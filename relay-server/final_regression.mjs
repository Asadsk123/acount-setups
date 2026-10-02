// Phase 19 Final Regression
// connect + auth + front image + rear image + 5s video + 10s mic + front image
import { WebSocket } from 'ws';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const RELAY = 'wss://yen-juan-weighted-receptors.trycloudflare.com';
const DEVICE_ID = '9f14931a-8562-4d5d-930b-5d9c2ae481cc';
const ADMIN_URL = 'http://localhost:8787';
const OUT = process.argv[2] || 'C:\\tmp\\hrapp_final_reg';
const FRAME_CAMERA = 0x01, FRAME_MIC = 0x02;

mkdirSync(OUT, { recursive: true });

async function getCode() {
  const r = await fetch(`${ADMIN_URL}/admin/new-pair-code/${DEVICE_ID}`);
  return (await r.json()).code;
}

function send(ws, msg) {
  ws.send(JSON.stringify({ protocol_version:1, timestamp:Date.now(), ...msg }));
}

function auth(ws, code) {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('AUTH_TIMEOUT')), 20000);
    let deviceId;
    function handler(raw, isBin) {
      if (isBin) return;
      const msg = JSON.parse(raw);
      if (msg.message_type === 'PAIR_RESPONSE' && msg.status === 'OK') {
        deviceId = msg.payload.device_id;
        send(ws, { message_type:'AUTH_REQUEST', device_id:deviceId, role:'controller', payload:{ session_token: msg.payload.session_token } });
      } else if (msg.message_type === 'AUTH_RESPONSE' && msg.status === 'OK') {
        clearTimeout(to); ws.off('message', handler); resolve(deviceId);
      } else if (msg.message_type === 'AUTH_RESPONSE') {
        clearTimeout(to); reject(new Error('AUTH_FAIL: ' + msg.error_code));
      }
    }
    ws.on('message', handler);
    send(ws, { message_type:'PAIR_REQUEST', request_id:'fr', payload:{ pairing_code: code } });
  });
}

function captureFrames(ws, deviceId, type, n, label, startCmd, stopCmd, payload = {}) {
  return new Promise((resolve) => {
    let count = 0;
    const micChunks = [];
    const startTime = Date.now();
    const handler = (raw, isBin) => {
      if (!isBin) {
        const msg = JSON.parse(raw);
        if (msg.message_type === 'STREAM_STATUS') process.stdout.write(`  [${label}] STATUS:${msg.payload?.state}\n`);
        return;
      }
      const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
      if (buf.length < 37 || buf[0] !== type) return;
      const data = type === FRAME_MIC ? buf.slice(41) : buf.slice(37);
      count++;
      if (type === FRAME_CAMERA) {
        writeFileSync(join(OUT, `${label}_${count}.jpg`), data);
        process.stdout.write(`\r  [${label}] frames=${count} size=${data.length}B`);
      } else {
        micChunks.push(data);
        process.stdout.write(`\r  [${label}] chunks=${count}`);
      }
      if (count >= n) {
        ws.off('message', handler);
        send(ws, { message_type:stopCmd, device_id:deviceId });
        setTimeout(() => {
          if (type === FRAME_MIC) {
            const allPcm = Buffer.concat(micChunks);
            const hr = Buffer.alloc(44);
            hr.write('RIFF',0); hr.writeUInt32LE(36+allPcm.length,4); hr.write('WAVE',8);
            hr.write('fmt ',12); hr.writeUInt32LE(16,16); hr.writeUInt16LE(1,20);
            hr.writeUInt16LE(1,22); hr.writeUInt32LE(8000,24); hr.writeUInt32LE(16000,28);
            hr.writeUInt16LE(2,32); hr.writeUInt16LE(16,34); hr.write('data',36);
            hr.writeUInt32LE(allPcm.length,40);
            writeFileSync(join(OUT, `${label}.wav`), Buffer.concat([hr, allPcm]));
          }
          console.log(`\n  [${label}] ✅ done: ${count} chunks ${Date.now()-startTime}ms`);
          resolve(count);
        }, 300);
      }
    };
    ws.on('message', handler);
    send(ws, { message_type:startCmd, device_id:deviceId, payload });
  });
}

const code = await getCode();
console.log(`Phase 19 Final Regression | code: ${code}`);
const ws = new WebSocket(RELAY);

await new Promise(r => ws.on('open', r));
const deviceId = await auth(ws, code);
console.log(`✅ Authenticated | deviceId: ${deviceId}`);

console.log('\n[1/6] Front image (FRONT_1)...');
await captureFrames(ws, deviceId, FRAME_CAMERA, 1, 'front_1', 'START_CAMERA', 'STOP_CAMERA', { facing:'front' });
await new Promise(r => setTimeout(r, 600));

console.log('[2/6] Rear image (REAR_1)...');
await captureFrames(ws, deviceId, FRAME_CAMERA, 1, 'rear_1', 'START_CAMERA', 'STOP_CAMERA', { facing:'back' });
await new Promise(r => setTimeout(r, 600));

console.log('[3/6] 5-second camera stream...');
await captureFrames(ws, deviceId, FRAME_CAMERA, 10, 'video_stream', 'START_CAMERA', 'STOP_CAMERA', { facing:'front' });
await new Promise(r => setTimeout(r, 600));

console.log('[4/6] 10-second mic recording...');
await captureFrames(ws, deviceId, FRAME_MIC, 100, 'mic_10s', 'START_MIC', 'STOP_MIC');
await new Promise(r => setTimeout(r, 600));

console.log('[5/6] Front image again (FRONT_2)...');
await captureFrames(ws, deviceId, FRAME_CAMERA, 1, 'front_2', 'START_CAMERA', 'STOP_CAMERA', { facing:'front' });
await new Promise(r => setTimeout(r, 600));

console.log('[6/6] Rear image again (REAR_2)...');
await captureFrames(ws, deviceId, FRAME_CAMERA, 1, 'rear_2', 'START_CAMERA', 'STOP_CAMERA', { facing:'back' });

ws.close();
console.log('\n=== PHASE 19 FINAL REGRESSION COMPLETE ===');
console.log('All 6 steps passed. WS stayed open throughout.');
console.log(`Output: ${OUT}`);
