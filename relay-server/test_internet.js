// Proves the remote/internet path: connect to the relay THROUGH the public
// cloudflared wss:// tunnel (exactly what a far-away phone on mobile data does),
// pair, and run a command. Pass the tunnel URL as argv[2].
import WebSocket from 'ws';
const url = process.argv[2];
if (!url) { console.error('usage: node test_internet.js wss://xxx.trycloudflare.com'); process.exit(1); }
const WSS = url.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');

const connect = () => new Promise((res, rej) => { const ws = new WebSocket(WSS); ws.on('open', () => res(ws)); ws.on('error', rej); });
const once = (ws, type) => new Promise((res) => {
  const on = (raw) => { const m = JSON.parse(raw.toString()); if (m.message_type === type) { ws.off('message', on); res(m); } };
  ws.on('message', on);
});
function assert(c, m) { if (!c) { console.error('FAIL:', m); process.exit(1); } }

async function main() {
  console.log('connecting through tunnel:', WSS);
  const agent = await connect();
  agent.send(JSON.stringify({ message_type: 'PAIR_INIT', request_id: 'a1', device_id: 'remote-phone-1' }));
  const pi = await once(agent, 'PAIR_INIT_RESPONSE');
  assert(pi.payload.pairing_code, 'should receive a pairing code over the internet tunnel');
  agent.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.message_type === 'DEVICE_INFO_REQUEST')
      agent.send(JSON.stringify({ message_type: 'DEVICE_INFO_RESPONSE', device_id: 'remote-phone-1', request_id: m.request_id, payload: { model: 'RemotePhone', battery_pct: 46, charging: false } }));
  });
  agent.send(JSON.stringify({ message_type: 'AUTH_REQUEST', device_id: 'remote-phone-1', role: 'agent' }));
  await once(agent, 'AUTH_RESPONSE');

  const controller = await connect();
  controller.send(JSON.stringify({ message_type: 'PAIR_REQUEST', request_id: 'c1', payload: { pairing_code: pi.payload.pairing_code } }));
  const pr = await once(controller, 'PAIR_RESPONSE');
  controller.send(JSON.stringify({ message_type: 'AUTH_REQUEST', device_id: 'remote-phone-1', role: 'controller', payload: { session_token: pr.payload.session_token } }));
  await once(controller, 'AUTH_RESPONSE');

  const di = once(controller, 'DEVICE_INFO_RESPONSE');
  controller.send(JSON.stringify({ message_type: 'DEVICE_INFO_REQUEST', request_id: 'd1', device_id: 'remote-phone-1' }));
  const r = await Promise.race([di, new Promise((res) => setTimeout(() => res(null), 8000))]);
  assert(r && r.payload.model === 'RemotePhone', 'command must round-trip over the internet tunnel');

  console.log('INTERNET CHECK PASSED — pair + command works over the public wss tunnel (remote phone path)');
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
