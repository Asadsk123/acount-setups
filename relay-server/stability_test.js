// Phase 5 stability test: 20 auth cycles as controller
// Each cycle: connect → PAIR_REQUEST (or AUTH) → verify AUTH_OK → disconnect
import { WebSocket } from 'ws';
import { randomInt } from 'crypto';

const RELAY = process.env.RELAY || 'wss://yen-juan-weighted-receptors.trycloudflare.com';
const DEVICE_ID = '9f14931a-8562-4d5d-930b-5d9c2ae481cc';
const ADMIN_URL = 'http://localhost:8787';
const CYCLES = 20;

let passed = 0, failed = 0;

async function getCode() {
  const r = await fetch(`${ADMIN_URL}/admin/new-pair-code/${DEVICE_ID}`);
  const j = await r.json();
  return j.code;
}

async function oneCycle(n) {
  return new Promise(async (resolve) => {
    let code;
    try { code = await getCode(); } catch(e) { console.log(`[${n}] FAIL getCode: ${e.message}`); failed++; return resolve(); }
    const ws = new WebSocket(RELAY);
    const timer = setTimeout(() => { ws.close(); console.log(`[${n}] TIMEOUT`); failed++; resolve(); }, 15000);

    ws.on('open', () => {
      ws.send(JSON.stringify({ protocol_version:1, timestamp:Date.now(), message_type:'PAIR_REQUEST', request_id:`r${n}`, payload:{ pairing_code: code } }));
    });
    ws.on('message', raw => {
      const msg = JSON.parse(raw);
      if (msg.message_type === 'PAIR_RESPONSE' && msg.status === 'OK') {
        const { device_id, session_token } = msg.payload;
        ws.send(JSON.stringify({ protocol_version:1, timestamp:Date.now(), message_type:'AUTH_REQUEST', device_id, role:'controller', payload:{ session_token } }));
      } else if (msg.message_type === 'AUTH_RESPONSE') {
        clearTimeout(timer);
        if (msg.status === 'OK') {
          passed++;
          console.log(`[${n}] ✅ AUTH_OK device_id=${msg.payload?.device_id?.slice(0,8)}`);
        } else {
          failed++;
          console.log(`[${n}] ❌ AUTH_FAIL: ${msg.error_code}`);
        }
        ws.close();
        resolve();
      } else if (msg.message_type === 'PAIR_RESPONSE' && msg.status !== 'OK') {
        clearTimeout(timer);
        failed++;
        console.log(`[${n}] ❌ PAIR_FAIL: ${msg.error_code}`);
        ws.close();
        resolve();
      }
    });
    ws.on('error', e => { clearTimeout(timer); failed++; console.log(`[${n}] ERR: ${e.message}`); resolve(); });
  });
}

console.log(`Running ${CYCLES} auth cycles against ${RELAY}\n`);
for (let i = 1; i <= CYCLES; i++) {
  await oneCycle(i);
  await new Promise(r => setTimeout(r, 500)); // 500ms between cycles
}

console.log(`\n=== RESULT: ${passed}/${CYCLES} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
