// HRAPP Stress Test — 10 scenarios, all media saved, deliberate failure attempts
import { WebSocket } from 'ws';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const RELAY = 'wss://yen-juan-weighted-receptors.trycloudflare.com';
const DEVICE_ID = '9f14931a-8562-4d5d-930b-5d9c2ae481cc';
const ADMIN_URL = 'http://localhost:8787';
const OUT = process.argv[2] || 'C:\\tmp\\hrapp_stress';
mkdirSync(OUT, { recursive: true });

async function code() {
  const r = await fetch(`${ADMIN_URL}/admin/new-pair-code/${DEVICE_ID}`);
  return (await r.json()).code;
}

function send(ws, msg) {
  ws.send(JSON.stringify({ protocol_version: 1, timestamp: Date.now(), ...msg }));
}

function wavHeader(pcmLen) {
  const h = Buffer.alloc(44);
  h.write('RIFF',0); h.writeUInt32LE(36+pcmLen,4); h.write('WAVE',8);
  h.write('fmt ',12); h.writeUInt32LE(16,16); h.writeUInt16LE(1,20);
  h.writeUInt16LE(1,22); h.writeUInt32LE(8000,24); h.writeUInt32LE(16000,28);
  h.writeUInt16LE(2,32); h.writeUInt16LE(16,34); h.write('data',36);
  h.writeUInt32LE(pcmLen,40);
  return h;
}

async function connect(pairCode) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(RELAY);
    let devId;
    const to = setTimeout(()=>{ws.close();rej(new Error('AUTH_TIMEOUT'));}, 20000);
    function onMsg(raw, bin) {
      if (bin) return;
      const msg = JSON.parse(raw);
      if (msg.message_type === 'PAIR_RESPONSE' && msg.status === 'OK') {
        devId = msg.payload.device_id;
        send(ws, { message_type:'AUTH_REQUEST', device_id:devId, role:'controller', payload:{ session_token:msg.payload.session_token }});
      } else if (msg.message_type === 'AUTH_RESPONSE' && msg.status === 'OK') {
        clearTimeout(to); ws.off('message', onMsg); res({ ws, devId });
      } else if (msg.message_type === 'AUTH_RESPONSE') {
        clearTimeout(to); rej(new Error('AUTH_FAIL '+msg.error_code));
      }
    }
    ws.on('open', () => send(ws, { message_type:'PAIR_REQUEST', request_id:'st', payload:{ pairing_code:pairCode }}));
    ws.on('message', onMsg);
    ws.on('error', e=>{clearTimeout(to);rej(e);});
  });
}

async function grabFrames(ws, devId, type, count, label, startCmd, stopCmd, payload={}) {
  return new Promise((res) => {
    const chunks = []; let n = 0;
    const startMs = Date.now();
    function onMsg(raw, bin) {
      if (!bin) {
        const m = JSON.parse(raw);
        if (m.message_type === 'STREAM_STATUS') process.stdout.write(`  [${label}] ${m.payload?.state}\n`);
        return;
      }
      const buf = Buffer.isBuffer(raw)?raw:Buffer.from(raw);
      if (buf[0] !== type) return;
      const data = type===0x02 ? buf.slice(41) : buf.slice(37);
      chunks.push(data); n++;
      process.stdout.write(`\r  [${label}] n=${n}`);
      if (n >= count) {
        ws.off('message', onMsg);
        send(ws, { message_type:stopCmd, device_id:devId });
        setTimeout(() => {
          const all = Buffer.concat(chunks);
          if (type === 0x02) {
            writeFileSync(join(OUT, `${label}.wav`), Buffer.concat([wavHeader(all.length), all]));
          } else {
            all.forEach((_, i) => {}); // silence linter
            // save each frame individually
            chunks.forEach((c, i) => writeFileSync(join(OUT, `${label}_frame${i+1}.jpg`), c));
          }
          console.log(`\n  [${label}] ✅ ${n} chunks, ${all.length}B, ${Date.now()-startMs}ms`);
          res(n);
        }, 300);
      }
    }
    ws.on('message', onMsg);
    send(ws, { message_type:startCmd, device_id:devId, payload });
  });
}

const results = [];
let passed = 0, failed = 0;

async function scenario(num, label, fn) {
  process.stdout.write(`\n[${num}/10] ${label}...\n`);
  try {
    const r = await fn();
    console.log(`  ✅ PASS: ${label} — ${r}`);
    results.push({ num, label, status: 'PASS', detail: r });
    passed++;
  } catch (e) {
    console.log(`  ❌ FAIL: ${label} — ${e.message}`);
    results.push({ num, label, status: 'FAIL', detail: e.message });
    failed++;
  }
}

// 1. Front camera single frame
await scenario(1, 'Front cam single frame', async () => {
  const c = await code(); const { ws, devId } = await connect(c);
  const n = await grabFrames(ws, devId, 0x01, 1, 'test01_front_single', 'START_CAMERA','STOP_CAMERA',{facing:'front'});
  ws.close(); return `${n} frame`;
});

// 2. Rear camera single frame
await scenario(2, 'Rear cam single frame', async () => {
  const c = await code(); const { ws, devId } = await connect(c);
  const n = await grabFrames(ws, devId, 0x01, 1, 'test02_rear_single', 'START_CAMERA','STOP_CAMERA',{facing:'back'});
  ws.close(); return `${n} frame`;
});

// 3. Front cam 5-frame stream
await scenario(3, 'Front cam 5-frame stream', async () => {
  const c = await code(); const { ws, devId } = await connect(c);
  const n = await grabFrames(ws, devId, 0x01, 5, 'test03_front_5frames', 'START_CAMERA','STOP_CAMERA',{facing:'front'});
  ws.close(); return `${n} frames`;
});

// 4. Rear cam 5-frame stream
await scenario(4, 'Rear cam 5-frame stream', async () => {
  const c = await code(); const { ws, devId } = await connect(c);
  const n = await grabFrames(ws, devId, 0x01, 5, 'test04_rear_5frames', 'START_CAMERA','STOP_CAMERA',{facing:'back'});
  ws.close(); return `${n} frames`;
});

// 5. Mic 5-second recording
await scenario(5, 'Mic 5s recording (50 chunks)', async () => {
  const c = await code(); const { ws, devId } = await connect(c);
  const n = await grabFrames(ws, devId, 0x02, 50, 'test05_mic_5s', 'START_MIC','STOP_MIC');
  ws.close(); return `${n} chunks`;
});

// 6. Front cam 10-frame stream (long zoom-style)
await scenario(6, 'Front cam 10-frame stream', async () => {
  const c = await code(); const { ws, devId } = await connect(c);
  const n = await grabFrames(ws, devId, 0x01, 10, 'test06_front_10frames', 'START_CAMERA','STOP_CAMERA',{facing:'front'});
  ws.close(); return `${n} frames`;
});

// 7. Mic 10-second recording
await scenario(7, 'Mic 10s recording (100 chunks)', async () => {
  const c = await code(); const { ws, devId } = await connect(c);
  const n = await grabFrames(ws, devId, 0x02, 100, 'test07_mic_10s', 'START_MIC','STOP_MIC');
  ws.close(); return `${n} chunks`;
});

// 8. Front→Stop→Rear→Stop (camera switch, same session)
await scenario(8, 'Camera switch front→rear same session', async () => {
  const c = await code(); const { ws, devId } = await connect(c);
  const n1 = await grabFrames(ws, devId, 0x01, 3, 'test08_switch_front', 'START_CAMERA','STOP_CAMERA',{facing:'front'});
  await new Promise(r=>setTimeout(r,500));
  const n2 = await grabFrames(ws, devId, 0x01, 3, 'test08_switch_rear', 'START_CAMERA','STOP_CAMERA',{facing:'back'});
  ws.close(); return `front=${n1} rear=${n2}`;
});

// 9. Simultaneous camera + mic (same session)
await scenario(9, 'Camera + mic simultaneous', async () => {
  const c = await code(); const { ws, devId } = await connect(c);
  const [camN, micN] = await Promise.all([
    grabFrames(ws, devId, 0x01, 5, 'test09_cam_concurrent', 'START_CAMERA','STOP_CAMERA',{facing:'front'}),
    new Promise(r=>setTimeout(r,200)).then(()=>grabFrames(ws, devId, 0x02, 30, 'test09_mic_concurrent', 'START_MIC','STOP_MIC')),
  ]);
  ws.close(); return `cam=${camN} mic=${micN}`;
});

// 10. DELIBERATE FAILURE ATTEMPT: invalid pair code → should fail gracefully
await scenario(10, 'FAIL ATTEMPT: invalid pair code 000000', async () => {
  return new Promise((res, rej) => {
    const ws = new WebSocket(RELAY);
    const to = setTimeout(()=>{ws.close();rej(new Error('TIMEOUT'));},10000);
    ws.on('open',()=>ws.send(JSON.stringify({protocol_version:1,timestamp:Date.now(),message_type:'PAIR_REQUEST',request_id:'bad',payload:{pairing_code:'000000'}})));
    ws.on('message',(raw,bin)=>{
      if(bin) return;
      const msg=JSON.parse(raw);
      if(msg.message_type==='PAIR_RESPONSE'&&msg.status==='ERROR'){
        clearTimeout(to);ws.close();res(`Correctly rejected: ${msg.error_code}`);
      } else if(msg.message_type==='PAIR_RESPONSE'&&msg.status==='OK'){
        clearTimeout(to);ws.close();rej(new Error('SECURITY FAIL: bad code accepted!'));
      }
    });
    ws.on('error',e=>{clearTimeout(to);rej(e);});
  });
});

console.log('\n\n=== STRESS TEST SUMMARY ===');
console.log(`Passed: ${passed}/10  Failed: ${failed}/10`);
results.forEach(r => console.log(`  [${r.num}] ${r.status} — ${r.label}: ${r.detail}`));
writeFileSync(join(OUT, 'stress_test_results.json'), JSON.stringify(results, null, 2));
console.log(`\nAll media saved to: ${OUT}`);
