// Security test: the relay must reject commands/events from sockets that are
// not the authenticated controller/agent for the target device.
// (parallel-dev prompt §15: no unauthorized command execution.)
import WebSocket from 'ws';
const RELAY = 'ws://localhost:8787';
const connect = () => new Promise((res) => { const ws = new WebSocket(RELAY); ws.on('open', () => res(ws)); });
const once = (ws, type) => new Promise((res) => {
  const on = (raw) => { const m = JSON.parse(raw.toString()); if (m.message_type === type) { ws.off('message', on); res(m); } };
  ws.on('message', on);
});
function assert(c, m) { if (!c) { console.error('FAIL:', m); process.exit(1); } }

async function main() {
  // Set up a legit paired device (agent + controller).
  const agent = await connect();
  agent.send(JSON.stringify({ message_type: 'PAIR_INIT', request_id: 'a1', device_id: 'dev-authz' }));
  const pi = await once(agent, 'PAIR_INIT_RESPONSE');
  agent.send(JSON.stringify({ message_type: 'AUTH_REQUEST', device_id: 'dev-authz', role: 'agent' }));
  await once(agent, 'AUTH_RESPONSE');
  let agentGotCommand = false;
  agent.on('message', (raw) => { if (JSON.parse(raw.toString()).message_type === 'START_CAMERA') agentGotCommand = true; });

  const controller = await connect();
  controller.send(JSON.stringify({ message_type: 'PAIR_REQUEST', request_id: 'c1', payload: { pairing_code: pi.payload.pairing_code } }));
  const pr = await once(controller, 'PAIR_RESPONSE');
  controller.send(JSON.stringify({ message_type: 'AUTH_REQUEST', device_id: 'dev-authz', role: 'controller', payload: { session_token: pr.payload.session_token } }));
  await once(controller, 'AUTH_RESPONSE');

  // 1. ATTACK: an UNauthenticated socket tries to drive the device's camera.
  const attacker = await connect();
  const atkResp = once(attacker, 'START_CAMERA_ACK').catch(() => null);
  attacker.send(JSON.stringify({ message_type: 'START_CAMERA', device_id: 'dev-authz', payload: { facing: 'back' } }));
  // relay has no ACK for START_CAMERA, so catch the ERROR reply instead
  const err = await Promise.race([
    once(attacker, 'ERROR'),
    new Promise((r) => setTimeout(() => r(null), 800)),
  ]);
  await new Promise((r) => setTimeout(r, 200));
  assert(agentGotCommand === false, 'attacker command must NOT reach the agent');
  assert(err && err.error_code === 'AUTH_ERROR', 'attacker must get AUTH_ERROR');

  // 2. ATTACK: rogue socket tries to inject a fake CAMERA_FRAME to the controller.
  let controllerGotFrame = false;
  controller.on('message', (raw) => { if (JSON.parse(raw.toString()).message_type === 'CAMERA_FRAME') controllerGotFrame = true; });
  attacker.send(JSON.stringify({ message_type: 'CAMERA_FRAME', device_id: 'dev-authz', payload: { mime: 'image/jpeg', b64: 'ZmFrZQ==' } }));
  await new Promise((r) => setTimeout(r, 300));
  assert(controllerGotFrame === false, 'rogue frame must NOT reach the controller');

  // 3. LEGIT: the real controller CAN still drive the device.
  const agentGetsIt = once(agent, 'START_CAMERA');
  controller.send(JSON.stringify({ message_type: 'START_CAMERA', device_id: 'dev-authz', payload: { facing: 'front' } }));
  const got = await Promise.race([agentGetsIt, new Promise((r) => setTimeout(() => r(null), 1000))]);
  assert(got && got.payload.facing === 'front', 'legit controller command MUST still reach the agent');

  console.log('AUTHZ CHECK PASSED — unauthenticated command + rogue frame rejected (AUTH_ERROR); legit controller still works');
  process.exit(0);
}
main().catch((e) => { console.error('FAIL: unexpected', e); process.exit(1); });
