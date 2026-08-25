// End-to-end test for the full module protocol: capabilities, device info,
// location, remote input, lock — controller <-> relay <-> agent round trips.
// Run with relay-server running. Uses a scripted agent that answers like the
// real Android Agent.kt router would.
import WebSocket from 'ws';
const RELAY = 'ws://localhost:8787';

const connect = () => new Promise((res) => { const ws = new WebSocket(RELAY); ws.on('open', () => res(ws)); });
const once = (ws, type) => new Promise((res) => {
  const on = (raw) => { const m = JSON.parse(raw.toString()); if (m.message_type === type) { ws.off('message', on); res(m); } };
  ws.on('message', on);
});
function assert(c, m) { if (!c) { console.error('FAIL:', m); process.exit(1); } }

// Scripted agent: mimics Agent.kt's handleMessage for the module commands.
function startAgent(ws, deviceId) {
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    const reply = (type, payload) => ws.send(JSON.stringify({ message_type: type, device_id: deviceId, request_id: m.request_id, payload }));
    switch (m.message_type) {
      case 'DEVICE_INFO_REQUEST':
        reply('DEVICE_INFO_RESPONSE', { model: 'Pixel 5', battery_pct: 82, charging: false, network_type: 'wifi' });
        break;
      case 'LOCATION_REQUEST':
        reply('LOCATION_EVENT', { lat: 24.86, lon: 67.01, accuracy_m: 12.5 });
        break;
      case 'INPUT_COMMAND':
        reply('INPUT_COMMAND_ACK', { ok: true, action: m.payload.action });
        break;
      case 'LOCK_REQUEST':
        reply('LOCK_RESPONSE', { ok: true });
        break;
    }
  });
}

async function main() {
  const agent = await connect();
  const controller = await connect();

  // pair + auth
  agent.send(JSON.stringify({ message_type: 'PAIR_INIT', request_id: 'a1' }));
  const pi = await once(agent, 'PAIR_INIT_RESPONSE');
  const deviceId = pi.payload.device_id;
  startAgent(agent, deviceId);
  agent.send(JSON.stringify({ message_type: 'AUTH_REQUEST', device_id: deviceId, role: 'agent' }));
  await once(agent, 'AUTH_RESPONSE');

  controller.send(JSON.stringify({ message_type: 'PAIR_REQUEST', request_id: 'c1', payload: { pairing_code: pi.payload.pairing_code } }));
  const pr = await once(controller, 'PAIR_RESPONSE');
  controller.send(JSON.stringify({ message_type: 'AUTH_REQUEST', device_id: deviceId, role: 'controller', payload: { session_token: pr.payload.session_token } }));
  await once(controller, 'AUTH_RESPONSE');

  // agent advertises capabilities (as real agent does after AUTH_RESPONSE)
  const capSeen = once(controller, 'CAPABILITY_RESPONSE');
  agent.send(JSON.stringify({ message_type: 'CAPABILITY_RESPONSE', device_id: deviceId, payload: { device_info: true, location: true, remote_input: true, lock: true, push_to_sound: true } }));
  const cap = await capSeen;
  assert(cap.payload.remote_input === true, 'controller should receive capabilities');

  // DEVICE_INFO round trip
  const diSeen = once(controller, 'DEVICE_INFO_RESPONSE');
  controller.send(JSON.stringify({ message_type: 'DEVICE_INFO_REQUEST', request_id: 'd1', device_id: deviceId }));
  const di = await diSeen;
  assert(di.payload.model === 'Pixel 5' && di.payload.battery_pct === 82, 'device info should return model + battery');

  // LOCATION round trip
  const locSeen = once(controller, 'LOCATION_EVENT');
  controller.send(JSON.stringify({ message_type: 'LOCATION_REQUEST', request_id: 'l1', device_id: deviceId }));
  const loc = await locSeen;
  assert(Math.abs(loc.payload.lat - 24.86) < 0.001, 'location event should carry lat/lon');

  // INPUT_COMMAND (tap) round trip
  const inSeen = once(controller, 'INPUT_COMMAND_ACK');
  controller.send(JSON.stringify({ message_type: 'INPUT_COMMAND', request_id: 'i1', device_id: deviceId, payload: { action: 'tap', x: 500, y: 900 } }));
  const inAck = await inSeen;
  assert(inAck.payload.ok === true && inAck.payload.action === 'tap', 'tap should be acked ok');

  // LOCK round trip
  const lkSeen = once(controller, 'LOCK_RESPONSE');
  controller.send(JSON.stringify({ message_type: 'LOCK_REQUEST', request_id: 'k1', device_id: deviceId }));
  const lk = await lkSeen;
  assert(lk.payload.ok === true, 'lock should succeed');

  // command to offline device -> agent gone -> INPUT_COMMAND still forwarded, but if agent closed, no ack
  agent.close();
  await new Promise((r) => setTimeout(r, 150));
  // audit must contain the module traffic
  const auditRes = await fetch('http://localhost:8788/audit').then((r) => r.json());
  assert(auditRes.some((e) => e.type === 'DEVICE_INFO_RESPONSE'), 'audit should record DEVICE_INFO_RESPONSE');
  assert(auditRes.some((e) => e.type === 'INPUT_COMMAND_SENT'), 'audit should record INPUT_COMMAND_SENT');
  assert(auditRes.some((e) => e.type === 'LOCK_RESPONSE'), 'audit should record LOCK_RESPONSE');

  console.log('ALL MODULE CHECKS PASSED — capabilities, device info, location, input, lock, audit verified end to end');
  process.exit(0);
}
main().catch((e) => { console.error('FAIL: unexpected', e); process.exit(1); });
