// Phase 16: Media combination test
// front image → rear image → 3s camera stream → 5s mic → front image → rear image
// Verify WebSocket remains open throughout
import { WebSocket } from 'ws';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const RELAY = 'wss://yen-juan-weighted-receptors.trycloudflare.com';
const DEVICE_ID = '9f14931a-8562-4d5d-930b-5d9c2ae481cc';
const ADMIN_URL = 'http://localhost:8787';
const OUT = 'C:\\tmp\\hrapp_combo';
const FRAME_CAMERA = 0x01, FRAME_MIC = 0x02;

mkdirSync(OUT, { recursive: true });

async function getCode() {
  return (await (await fetch(`${ADMIN_URL}/admin/new-pair-code/${DEVICE_ID}`)).json()).code;
}

async function main() {
  const code = await getCode();
  console.log('Combo test code:', code);
  const ws = new WebSocket(RELAY);
  let deviceId;
  const results = [];

  function send(msg) {
    ws.send(JSON.stringify({ protocol_version:1, timestamp:Date.now(), ...msg }));
  }

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('TIMEOUT')), 20000);
    ws.on('open', () => send({ message_type:'PAIR_REQUEST', request_id:'combo', payload:{ pairing_code: code } }));
    ws.on('message', (raw, bin) => {
      if (bin) return;
      const msg = JSON.parse(raw);
      if (msg.message_type === 'PAIR_RESPONSE' && msg.status === 'OK') {
        deviceId = msg.payload.device_id;
        send({ message_type:'AUTH_REQUEST', device_id: deviceId, role:'controller', payload:{ session_token: msg.payload.session_token } });
      } else if (msg.message_type === 'AUTH_RESPONSE' && msg.status === 'OK') {
        clearTimeout(timer); resolve();
      } else if (msg.message_type === 'AUTH_RESPONSE' || (msg.message_type === 'PAIR_RESPONSE' && msg.status !== 'OK')) {
        clearTimeout(timer); reject(new Error(msg.error_code));
      }
    });
    ws.on('error', e => { clearTimeout(timer); reject(e); });
  });

  console.log('✅ Authenticated');

  // Helper: capture N frames of a type, return count
  function captureFrames(type, n, label, startCmd, stopCmd, payload = {}) {
    return new Promise((resolve) => {
      let count = 0;
      const micChunks = [];
      const startTime = Date.now();
      const handler = (raw, isBin) => {
        if (!isBin) {
          const msg = JSON.parse(raw);
          if (msg.message_type === 'STREAM_STATUS') {
            console.log(`  [${label}] STREAM_STATUS:`, msg.payload?.state);
          }
          return;
        }
        const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        if (buf.length < 37) return;
        if (buf[0] !== type) return;
        const data = type === FRAME_MIC ? buf.slice(41) : buf.slice(37);
        count++;
        if (type === FRAME_CAMERA) {
          writeFileSync(join(OUT, `${label}_${count}.jpg`), data);
          process.stdout.write(`\r  [${label}] frames=${count} bytes=${data.length}`);
        } else {
          micChunks.push(data);
          process.stdout.write(`\r  [${label}] chunks=${count}`);
        }
        if (count >= n) {
          ws.off('message', handler);
          send({ message_type: stopCmd, device_id: deviceId });
          setTimeout(() => {
            console.log(`\n  [${label}] done: ${count} chunks ${Date.now()-startTime}ms`);
            resolve(count);
          }, 300);
        }
      };
      ws.on('message', handler);
      send({ message_type: startCmd, device_id: deviceId, payload });
    });
  }

  // 1. Front image (1 frame)
  console.log('\n[1/6] Front image...');
  const r1 = await captureFrames(FRAME_CAMERA, 1, 'combo_front1', 'START_CAMERA', 'STOP_CAMERA', { facing:'front' });
  await new Promise(r => setTimeout(r, 800));

  // 2. Rear image (1 frame)
  console.log('[2/6] Rear image...');
  const r2 = await captureFrames(FRAME_CAMERA, 1, 'combo_rear1', 'START_CAMERA', 'STOP_CAMERA', { facing:'back' });
  await new Promise(r => setTimeout(r, 800));

  // 3. 3-second camera stream (~6 frames)
  console.log('[3/6] 3s camera stream...');
  const r3 = await captureFrames(FRAME_CAMERA, 6, 'combo_stream', 'START_CAMERA', 'STOP_CAMERA', { facing:'front' });
  await new Promise(r => setTimeout(r, 800));

  // 4. 5-second mic
  console.log('[4/6] 5s mic...');
  const r4 = await captureFrames(FRAME_MIC, 50, 'combo_mic', 'START_MIC', 'STOP_MIC');
  await new Promise(r => setTimeout(r, 800));

  // 5. Front image again
  console.log('[5/6] Front image again...');
  const r5 = await captureFrames(FRAME_CAMERA, 1, 'combo_front2', 'START_CAMERA', 'STOP_CAMERA', { facing:'front' });
  await new Promise(r => setTimeout(r, 800));

  // 6. Rear image again
  console.log('[6/6] Rear image again...');
  const r6 = await captureFrames(FRAME_CAMERA, 1, 'combo_rear2', 'START_CAMERA', 'STOP_CAMERA', { facing:'back' });

  ws.close();
  results.push({step:'front_image_1', frames:r1}, {step:'rear_image_1', frames:r2},
               {step:'camera_stream_3s', frames:r3}, {step:'mic_5s', chunks:r4},
               {step:'front_image_2', frames:r5}, {step:'rear_image_2', frames:r6});

  console.log('\n=== COMBO RESULTS ===');
  results.forEach(r => console.log(r.step, '→', JSON.stringify(r)));
  const allPassed = results.every(r => (r.frames || r.chunks) > 0);
  console.log(allPassed ? '\n✅ ALL COMBO STEPS PASSED — WebSocket intact' : '\n❌ SOME STEPS FAILED');
  process.exit(allPassed ? 0 : 1);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
