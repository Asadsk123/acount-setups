// Security test: a socket guessing pairing codes must be throttled after a few
// wrong tries (brute-force guard), while a correct code still pairs.
import WebSocket from 'ws';
const RELAY = 'ws://localhost:8787';
const connect = () => new Promise((res) => { const ws = new WebSocket(RELAY); ws.on('open', () => res(ws)); });
const once = (ws, type) => new Promise((res) => {
  const on = (raw) => { const m = JSON.parse(raw.toString()); if (m.message_type === type) { ws.off('message', on); res(m); } };
  ws.on('message', on);
});
function assert(c, m) { if (!c) { console.error('FAIL:', m); process.exit(1); } }

const send = (ws, o) => ws.send(JSON.stringify(o));

async function main() {
  // A real pending pairing exists.
  const agent = await connect();
  send(agent, { message_type: 'PAIR_INIT', request_id: 'a1', device_id: 'dev-bf' });
  const pi = await once(agent, 'PAIR_INIT_RESPONSE');
  const realCode = pi.payload.pairing_code;

  // Attacker guesses wrong codes on one socket.
  const attacker = await connect();
  let lastErr = null;
  for (let i = 0; i < 6; i++) {
    const wrong = String((parseInt(realCode, 10) + 1 + i) % 1000000).padStart(6, '0');
    send(attacker, { message_type: 'PAIR_REQUEST', request_id: 'g' + i, payload: { pairing_code: wrong } });
    lastErr = await once(attacker, 'PAIR_RESPONSE');
  }
  assert(lastErr.error_code === 'RATE_LIMITED', `after 5 wrong tries the 6th must be RATE_LIMITED (got ${lastErr.error_code})`);

  // Even the CORRECT code is now refused on the throttled socket.
  send(attacker, { message_type: 'PAIR_REQUEST', request_id: 'gc', payload: { pairing_code: realCode } });
  const afterThrottle = await once(attacker, 'PAIR_RESPONSE');
  assert(afterThrottle.status === 'ERROR', 'throttled socket must not pair even with the right code');

  // A FRESH socket with the correct code still pairs (guard is per-connection).
  const legit = await connect();
  send(legit, { message_type: 'PAIR_REQUEST', request_id: 'ok', payload: { pairing_code: realCode } });
  const ok = await once(legit, 'PAIR_RESPONSE');
  assert(ok.status === 'OK', 'a fresh socket with the correct code must still pair');

  console.log('BRUTE-FORCE CHECK PASSED — wrong-code attempts throttled after 5; correct code still pairs on a fresh socket');
  process.exit(0);
}
main().catch((e) => { console.error('FAIL: unexpected', e); process.exit(1); });
