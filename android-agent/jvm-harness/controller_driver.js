// Pairs with the JVM harness (real MiniWebSocket agent) and sends PLAY_SOUND.
import WebSocket from 'ws';
const [code, deviceId] = [process.argv[2], process.argv[3]];
const ws = new WebSocket('ws://localhost:8787');
const once = (t) => new Promise((r) => { const on = (raw) => { const m = JSON.parse(raw); if (m.message_type === t) { ws.off('message', on); r(m); } }; ws.on('message', on); });
ws.on('open', async () => {
  ws.send(JSON.stringify({ message_type: 'PAIR_REQUEST', request_id: 'c1', payload: { pairing_code: code } }));
  const pr = await once('PAIR_RESPONSE');
  if (pr.status !== 'OK') { console.error('controller: pair failed'); process.exit(1); }
  ws.send(JSON.stringify({ message_type: 'AUTH_REQUEST', device_id: deviceId, role: 'controller', payload: { session_token: pr.payload.session_token } }));
  await once('AUTH_RESPONSE');
  ws.send(JSON.stringify({ message_type: 'PLAY_SOUND', request_id: 'c2', device_id: deviceId, payload: { sound_id: 'tan_tan' } }));
  console.log('controller: sent PLAY_SOUND to the JVM agent');
  setTimeout(() => process.exit(0), 1500);
});
