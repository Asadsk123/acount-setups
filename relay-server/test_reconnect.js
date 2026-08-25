// Proves the fix for "pair hua but commands don't work": an agent that provides
// its OWN stable device_id and reconnects keeps the controller's pairing alive,
// so commands still route to it after a drop.
import WebSocket from 'ws';
const RELAY = 'ws://localhost:8787';
const connect = () => new Promise((res) => { const ws = new WebSocket(RELAY); ws.on('open', () => res(ws)); });
const once = (ws, type) => new Promise((res) => {
  const on = (raw) => { const m = JSON.parse(raw.toString()); if (m.message_type === type) { ws.off('message', on); res(m); } };
  ws.on('message', on);
});
function assert(c, m) { if (!c) { console.error('FAIL:', m); process.exit(1); } }

const DEVICE_ID = 'fixed-device-123'; // agent's persistent id

function agentBehaviour(ws) {
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.message_type === 'DEVICE_INFO_REQUEST') {
      ws.send(JSON.stringify({ message_type: 'DEVICE_INFO_RESPONSE', device_id: DEVICE_ID, request_id: m.request_id, payload: { model: 'RealPhone', battery_pct: 55, charging: true } }));
    }
  });
}

async function main() {
  // Agent connects with its OWN device_id (the fix).
  let agent = await connect();
  agent.send(JSON.stringify({ message_type: 'PAIR_INIT', request_id: 'a1', device_id: DEVICE_ID }));
  const pi = await once(agent, 'PAIR_INIT_RESPONSE');
  assert(pi.payload.device_id === DEVICE_ID, 'relay must reuse the agent-provided device_id');
  agent.send(JSON.stringify({ message_type: 'AUTH_REQUEST', device_id: DEVICE_ID, role: 'agent' }));
  await once(agent, 'AUTH_RESPONSE');
  agentBehaviour(agent);

  // Controller pairs to that device_id.
  const controller = await connect();
  controller.send(JSON.stringify({ message_type: 'PAIR_REQUEST', request_id: 'c1', payload: { pairing_code: pi.payload.pairing_code } }));
  const pr = await once(controller, 'PAIR_RESPONSE');
  controller.send(JSON.stringify({ message_type: 'AUTH_REQUEST', device_id: DEVICE_ID, role: 'controller', payload: { session_token: pr.payload.session_token } }));
  await once(controller, 'AUTH_RESPONSE');

  // Command works while connected.
  let di = once(controller, 'DEVICE_INFO_RESPONSE');
  controller.send(JSON.stringify({ message_type: 'DEVICE_INFO_REQUEST', request_id: 'd1', device_id: DEVICE_ID }));
  assert((await di).payload.model === 'RealPhone', 'command should work right after pairing');

  // --- Agent DROPS (screen locked / backgrounded) and RECONNECTS with SAME id ---
  agent.close();
  await new Promise((r) => setTimeout(r, 200));
  agent = await connect();
  agent.send(JSON.stringify({ message_type: 'PAIR_INIT', request_id: 'a2', device_id: DEVICE_ID }));
  await once(agent, 'PAIR_INIT_RESPONSE');
  agent.send(JSON.stringify({ message_type: 'AUTH_REQUEST', device_id: DEVICE_ID, role: 'agent' }));
  await once(agent, 'AUTH_RESPONSE');
  agentBehaviour(agent);

  // Controller (never re-paired) sends a command again — must still reach the reconnected agent.
  di = once(controller, 'DEVICE_INFO_RESPONSE');
  controller.send(JSON.stringify({ message_type: 'DEVICE_INFO_REQUEST', request_id: 'd2', device_id: DEVICE_ID }));
  const after = await Promise.race([di, new Promise((r) => setTimeout(() => r(null), 2000))]);
  assert(after && after.payload.battery_pct === 55, 'command must still work after the agent reconnects (pairing not orphaned)');

  console.log('RECONNECT CHECK PASSED — stable device_id keeps the pairing alive across an agent reconnect');
  process.exit(0);
}
main().catch((e) => { console.error('FAIL: unexpected', e); process.exit(1); });
