// Camera capture test: authenticate as controller, capture N JPEG frames from front/back camera
import { WebSocket } from 'ws';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const RELAY = 'wss://yen-juan-weighted-receptors.trycloudflare.com';
const DEVICE_ID = '9f14931a-8562-4d5d-930b-5d9c2ae481cc';
const ADMIN_URL = 'http://localhost:8787';
const OUT_DIR = process.argv[2] || 'C:\\tmp\\hrapp_captures';
const FACING = process.argv[3] || 'front';
const N = parseInt(process.argv[4] || '5', 10);

// Binary frame types (matches Agent.kt BinaryFrameType)
const FRAME_CAMERA = 0x01;
const FRAME_MIC    = 0x02;
const FRAME_SCREEN = 0x03;

mkdirSync(OUT_DIR, { recursive: true });

async function getCode() {
  const r = await fetch(`${ADMIN_URL}/admin/new-pair-code/${DEVICE_ID}`);
  const j = await r.json();
  return j.code;
}

async function main() {
  const code = await getCode();
  console.log(`Pairing code: ${code}`);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(RELAY);
    let sessionToken = null;
    let deviceId = null;
    let frameCount = 0;
    const timer = setTimeout(() => { ws.close(); reject(new Error('TIMEOUT')); }, 30000);

    function send(msg) {
      ws.send(JSON.stringify({ protocol_version:1, timestamp:Date.now(), ...msg }));
      console.log('→', msg.message_type);
    }

    ws.on('open', () => {
      send({ message_type:'PAIR_REQUEST', request_id:'cam-1', payload:{ pairing_code: code } });
    });

    ws.on('message', (raw, isBinary) => {
      if (isBinary) {
        // Binary frame: [1 byte type][36 bytes device_id ASCII][payload]
        const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        if (buf.length < 37) { console.log('← binary: too short', buf.length); return; }
        const frameType = buf[0];
        const frameDeviceId = buf.slice(1, 37).toString('ascii');
        const payload = buf.slice(37);

        if (frameType === FRAME_CAMERA) {
          frameCount++;
          const fname = join(OUT_DIR, `${FACING}_${frameCount.toString().padStart(2,'0')}.jpg`);
          writeFileSync(fname, payload);
          console.log(`← CAMERA_FRAME #${frameCount} device=${frameDeviceId.slice(0,8)} size=${payload.length} bytes → ${fname}`);

          if (frameCount >= N) {
            clearTimeout(timer);
            send({ message_type:'STOP_CAMERA', device_id: deviceId });
            setTimeout(() => {
              ws.close();
              console.log(`\n✅ Captured ${frameCount}/${N} frames, STOP_CAMERA sent`);
              resolve(frameCount);
            }, 1000);
          }
        } else {
          console.log(`← binary frame type=0x${frameType.toString(16)} size=${buf.length}`);
        }
        return;
      }

      const msg = JSON.parse(raw);
      console.log('←', msg.message_type, msg.status || '');

      if (msg.message_type === 'PAIR_RESPONSE' && msg.status === 'OK') {
        deviceId = msg.payload.device_id;
        sessionToken = msg.payload.session_token;
        send({ message_type:'AUTH_REQUEST', device_id: deviceId, role:'controller', payload:{ session_token: sessionToken } });
      } else if (msg.message_type === 'AUTH_RESPONSE' && msg.status === 'OK') {
        console.log(`\nAuthenticated as controller for ${deviceId.slice(0,8)}...`);
        console.log(`Sending START_CAMERA facing=${FACING}, waiting for ${N} frames...\n`);
        send({ message_type:'START_CAMERA', device_id: deviceId, payload:{ facing: FACING } });
      } else if (msg.message_type === 'AUTH_RESPONSE') {
        clearTimeout(timer);
        reject(new Error(`AUTH_FAILED: ${msg.error_code}`));
        ws.close();
      } else if (msg.message_type === 'PAIR_RESPONSE') {
        clearTimeout(timer);
        reject(new Error(`PAIR_FAILED: ${msg.error_code}`));
        ws.close();
      }
    });

    ws.on('error', e => { clearTimeout(timer); reject(e); });
    ws.on('close', () => console.log('WS closed'));
  });
}

main().then(n => {
  console.log(`\nResult: ${n} JPEG frames saved to ${OUT_DIR}`);
}).catch(e => {
  console.error('\n❌ FAILED:', e.message);
  process.exit(1);
});
