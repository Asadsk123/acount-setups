// Connect to the relay via the LAN IP (not localhost) — same path a phone takes.
import WebSocket from 'ws';
const url = 'ws://10.28.206.21:8787';
const ws = new WebSocket(url);
const timer = setTimeout(() => { console.log('FAIL: timeout, no response from ' + url); process.exit(1); }, 8000);
ws.on('open', () => {
  console.log('LAN CONNECT OK -> ' + url);
  ws.send(JSON.stringify({ message_type: 'PAIR_INIT', request_id: 'lan-check' }));
});
ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.message_type === 'PAIR_INIT_RESPONSE') {
    console.log('LAN PAIR_INIT OK, code=' + msg.payload.pairing_code);
    clearTimeout(timer);
    process.exit(0);
  }
});
ws.on('error', (e) => { console.log('FAIL: ' + e.message); process.exit(1); });
