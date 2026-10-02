// Phase 14/15: stream test — collect camera frames for N seconds, mic chunks for M seconds
import { WebSocket } from 'ws';
import { writeFileSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';

const RELAY = 'wss://yen-juan-weighted-receptors.trycloudflare.com';
const DEVICE_ID = '9f14931a-8562-4d5d-930b-5d9c2ae481cc';
const ADMIN_URL = 'http://localhost:8787';

const FRAME_CAMERA = 0x01;
const FRAME_MIC    = 0x02;
const SAMPLE_RATE  = 8000;
const BYTES_PER_SAMPLE = 2;

async function getCode() {
  const r = await fetch(`${ADMIN_URL}/admin/new-pair-code/${DEVICE_ID}`);
  return (await r.json()).code;
}

async function runTest({ streamType, facing, durationSec, outDir }) {
  mkdirSync(outDir, { recursive: true });
  const code = await getCode();
  console.log(`[${streamType}] code=${code} duration=${durationSec}s`);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(RELAY);
    let deviceId = null;
    let frameCount = 0;
    let totalBytes = 0;
    const micChunks = [];
    const startTimer = null;
    let streamStarted = false;
    let streamStartMs = 0;
    const connectTimer = setTimeout(() => { ws.close(); reject(new Error('TIMEOUT')); }, 60000);

    function send(msg) {
      ws.send(JSON.stringify({ protocol_version:1, timestamp:Date.now(), ...msg }));
      console.log(`[${streamType}] →`, msg.message_type);
    }

    function stopStream() {
      const elapsed = Date.now() - streamStartMs;
      const stopMsg = streamType === 'camera' ? 'STOP_CAMERA' : 'STOP_MIC';
      send({ message_type: stopMsg, device_id: deviceId });

      if (streamType === 'mic') {
        // Assemble all PCM chunks into a WAV file
        const allPcm = Buffer.concat(micChunks);
        const wavBuf = pcmToWav(allPcm, SAMPLE_RATE);
        const wavFile = join(outDir, 'mic_recording.wav');
        writeFileSync(wavFile, wavBuf);
        const durationActual = allPcm.byteLength / (SAMPLE_RATE * BYTES_PER_SAMPLE);
        console.log(`[mic] WAV saved: ${wavFile} size=${wavBuf.byteLength} PCM_duration=${durationActual.toFixed(1)}s elapsed=${elapsed}ms`);
      }

      clearTimeout(connectTimer);
      setTimeout(() => {
        ws.close();
        resolve({ frameCount, totalBytes, elapsed });
      }, 500);
    }

    ws.on('open', () => {
      send({ message_type:'PAIR_REQUEST', request_id:'st-1', payload:{ pairing_code: code } });
    });

    ws.on('message', (raw, isBinary) => {
      if (isBinary) {
        const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        if (buf.length < 37) return;
        const type = buf[0];
        const payload = buf.slice(37);

        if (type === FRAME_CAMERA && streamType === 'camera') {
          frameCount++;
          totalBytes += payload.length;
          const fname = join(outDir, `frame_${frameCount.toString().padStart(3,'0')}.jpg`);
          writeFileSync(fname, payload);
          const elapsed = Date.now() - streamStartMs;
          process.stdout.write(`\r[camera] frame=${frameCount} bytes=${totalBytes} elapsed=${elapsed}ms`);
          if (elapsed >= durationSec * 1000) stopStream();
        } else if (type === FRAME_MIC && streamType === 'mic') {
          // Binary mic frame: [1B type][36B deviceId][4B sample_rate little-endian][PCM bytes]
          const sr = buf.readUInt32LE(37);
          const pcm = buf.slice(41);
          micChunks.push(pcm);
          frameCount++;
          totalBytes += pcm.length;
          const elapsed = Date.now() - streamStartMs;
          process.stdout.write(`\r[mic] chunks=${frameCount} pcm_bytes=${totalBytes} elapsed=${elapsed}ms`);
          if (elapsed >= durationSec * 1000) stopStream();
        }
        return;
      }

      const msg = JSON.parse(raw);
      if (msg.message_type === 'PAIR_RESPONSE' && msg.status === 'OK') {
        deviceId = msg.payload.device_id;
        send({ message_type:'AUTH_REQUEST', device_id: deviceId, role:'controller', payload:{ session_token: msg.payload.session_token } });
      } else if (msg.message_type === 'AUTH_RESPONSE' && msg.status === 'OK') {
        const startCmd = streamType === 'camera' ? 'START_CAMERA' : 'START_MIC';
        const payload = streamType === 'camera' ? { facing: facing || 'front' } : {};
        send({ message_type: startCmd, device_id: deviceId, payload });
      } else if (msg.message_type === 'STREAM_STATUS') {
        const detail = msg.payload?.status || msg.status;
        console.log(`\n[${streamType}] STREAM_STATUS: ${JSON.stringify(msg.payload || msg)}`);
        if (!streamStarted && (detail === 'started' || msg.payload?.stream === 'camera' || msg.payload?.stream === 'mic')) {
          streamStarted = true;
          streamStartMs = Date.now();
          console.log(`[${streamType}] stream started — recording for ${durationSec}s`);
        }
      } else if (msg.message_type === 'AUTH_RESPONSE') {
        clearTimeout(connectTimer);
        reject(new Error(`AUTH_FAIL: ${msg.error_code}`));
        ws.close();
      }
    });

    ws.on('error', e => { clearTimeout(connectTimer); reject(e); });
    ws.on('close', () => {});
  });
}

function pcmToWav(pcmData, sampleRate) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmData.length, 40);
  return Buffer.concat([header, pcmData]);
}

const mode = process.argv[2] || 'camera';
const seconds = parseInt(process.argv[3] || (mode === 'mic' ? '25' : '5'), 10);
const outDir = process.argv[4] || `C:\\tmp\\hrapp_stream_${mode}`;

runTest({ streamType: mode, facing: 'front', durationSec: seconds, outDir }).then(r => {
  console.log(`\n\n✅ ${mode} stream: ${r.frameCount} chunks, ${r.totalBytes} bytes, ${r.elapsed}ms elapsed`);
  process.exit(0);
}).catch(e => {
  console.error('\n❌ FAILED:', e.message);
  process.exit(1);
});
