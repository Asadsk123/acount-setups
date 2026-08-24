// ponytail: one runnable check for the pairing+PLAY_SOUND flow.
// Run: node test_vertical_slice.js   (relay-server must be running on :8787)
import WebSocket from 'ws';

const RELAY = 'ws://localhost:8787';

function connect() {
  return new Promise((resolve) => {
    const ws = new WebSocket(RELAY);
    ws.on('open', () => resolve(ws));
  });
}

function once(ws, type) {
  return new Promise((resolve) => {
    function onMsg(raw) {
      const msg = JSON.parse(raw.toString());
      if (msg.message_type === type) {
        ws.off('message', onMsg);
        resolve(msg);
      }
    }
    ws.on('message', onMsg);
  });
}

async function main() {
  const agent = await connect();
  const controller = await connect();

  // 1. Agent requests a pairing code.
  agent.send(JSON.stringify({ message_type: 'PAIR_INIT', request_id: 'r1' }));
  const pairInitRes = await once(agent, 'PAIR_INIT_RESPONSE');
  assert(pairInitRes.status === 'OK', 'PAIR_INIT should succeed');
  const { device_id, pairing_code } = pairInitRes.payload;

  // 2. Agent authenticates itself (it already knows device_id from step 1).
  agent.send(JSON.stringify({ message_type: 'AUTH_REQUEST', device_id, role: 'agent' }));
  const agentAuth = await once(agent, 'AUTH_RESPONSE');
  assert(agentAuth.status === 'OK', 'agent AUTH_REQUEST should succeed');

  // 3. Controller enters the pairing code shown on the phone.
  controller.send(JSON.stringify({ message_type: 'PAIR_REQUEST', request_id: 'r2', payload: { pairing_code } }));
  const pairRes = await once(controller, 'PAIR_RESPONSE');
  assert(pairRes.status === 'OK', 'PAIR_REQUEST should succeed with valid code');
  const { session_token } = pairRes.payload;

  // 3b. Wrong PIN must be rejected.
  const rogue = await connect();
  rogue.send(JSON.stringify({ message_type: 'PAIR_REQUEST', request_id: 'r2b', payload: { pairing_code: '000000' } }));
  const rogueRes = await once(rogue, 'PAIR_RESPONSE');
  assert(rogueRes.status === 'ERROR', 'wrong pairing code must be rejected');

  // 4. Controller authenticates with the session token.
  controller.send(JSON.stringify({ message_type: 'AUTH_REQUEST', device_id, role: 'controller', payload: { session_token } }));
  const controllerAuth = await once(controller, 'AUTH_RESPONSE');
  assert(controllerAuth.status === 'OK', 'controller AUTH_REQUEST should succeed with valid token');

  // 4b. Forged token must be rejected.
  const rogue2 = await connect();
  rogue2.send(JSON.stringify({ message_type: 'AUTH_REQUEST', device_id, role: 'controller', payload: { session_token: 'forged.forged' } }));
  const rogueAuth = await once(rogue2, 'AUTH_RESPONSE');
  assert(rogueAuth.status === 'ERROR', 'forged session token must be rejected');

  // 5. Controller sends PLAY_SOUND; agent should receive it.
  const agentReceivesPlay = once(agent, 'PLAY_SOUND');
  controller.send(JSON.stringify({ message_type: 'PLAY_SOUND', request_id: 'r3', device_id, payload: { sound_id: 'tan_tan' } }));
  const ack = await once(controller, 'PLAY_SOUND_ACK');
  assert(ack.status === 'OK', 'PLAY_SOUND_ACK should be OK');
  const playMsg = await agentReceivesPlay;
  assert(playMsg.payload.sound_id === 'tan_tan', 'agent should receive the correct sound_id');

  // 6. Agent reports playback result; controller should be notified; audit should record it.
  const controllerReceivesResult = once(controller, 'PLAY_SOUND_RESULT');
  agent.send(JSON.stringify({ message_type: 'PLAY_SOUND_RESULT', device_id, payload: { result: 'PLAYED' } }));
  const resultMsg = await controllerReceivesResult;
  assert(resultMsg.payload.result === 'PLAYED', 'controller should see playback result');

  await new Promise((r) => setTimeout(r, 200));
  const auditRes = await fetch('http://localhost:8788/audit').then((r) => r.json());
  assert(auditRes.some((e) => e.type === 'PLAY_SOUND_SENT' && e.deviceId === device_id), 'audit log should contain PLAY_SOUND_SENT');
  assert(auditRes.some((e) => e.type === 'PLAY_SOUND_RESULT' && e.deviceId === device_id), 'audit log should contain PLAY_SOUND_RESULT');

  console.log('ALL CHECKS PASSED — pair -> auth -> PLAY_SOUND -> ACK -> result -> audit, verified end to end');
  process.exit(0);
}

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('FAIL: unexpected error', e);
  process.exit(1);
});
