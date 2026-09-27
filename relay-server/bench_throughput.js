/**
 * HRAPP Throughput Benchmark — Phase K/N
 * Measures actual relay throughput in MB/s for large binary payloads.
 * Run against local relay to get LAN baseline.
 *
 * Reports: REQUESTED target / ACTUAL measured / BOTTLENECK
 * Required per MASTER PROMPT 4 §15 — do not claim impossible numbers.
 */
import WebSocket from 'ws';
import { randomBytes } from 'crypto';

const RELAY = 'ws://localhost:8787';
const PAYLOAD_KB = 100;   // simulate a camera frame
const FRAME_COUNT = 200;
const payload = randomBytes(PAYLOAD_KB * 1024);

let sent = 0, received = 0, startMs = 0;

// Full pair→auth→bench flow
async function pair(ws) {
  return new Promise((res, rej) => {
    ws.once('message', raw => {
      const m = JSON.parse(raw);
      if (m.message_type === 'PAIR_INIT_RESPONSE') res(m.payload);
      else rej(new Error('expected PAIR_INIT_RESPONSE, got ' + m.message_type));
    });
    ws.send(JSON.stringify({ message_type: 'PAIR_INIT', device_id: 'bench-device', request_id: '1' }));
  });
}
async function auth(ws, deviceId, role, token) {
  return new Promise((res, rej) => {
    ws.once('message', raw => {
      const m = JSON.parse(raw);
      if (m.message_type === 'AUTH_RESPONSE' && m.status === 'OK') res();
      else rej(new Error('auth failed: ' + JSON.stringify(m)));
    });
    const msg = { message_type: 'AUTH_REQUEST', device_id: deviceId, role };
    if (role === 'controller') msg.payload = { session_token: token };
    ws.send(JSON.stringify(msg));
  });
}
async function pairController(ws, code, deviceId) {
  return new Promise((res, rej) => {
    ws.once('message', raw => {
      const m = JSON.parse(raw);
      if (m.message_type === 'PAIR_RESPONSE' && m.status === 'OK') res(m.payload.session_token);
      else rej(new Error('pair_request failed: ' + JSON.stringify(m)));
    });
    ws.send(JSON.stringify({ message_type: 'PAIR_REQUEST', request_id: '2', payload: { pairing_code: code } }));
  });
}

(async () => {
  const agent = new WebSocket(RELAY);
  await new Promise(r => agent.on('open', r));
  const { device_id, pairing_code } = await pair(agent);
  await auth(agent, device_id, 'agent');

  const ctrl = new WebSocket(RELAY);
  await new Promise(r => ctrl.on('open', r));
  const token = await pairController(ctrl, pairing_code, device_id);
  await auth(ctrl, device_id, 'controller', token);

  // Drain CAPABILITY_RESPONSE
  await new Promise(r => setTimeout(r, 100));
  agent.removeAllListeners('message');
  ctrl.removeAllListeners('message');

  // Benchmark: send PAYLOAD_KB*FRAME_COUNT bytes through relay as CAMERA_FRAMEs
  console.log(`\nBenchmarking: ${FRAME_COUNT} frames × ${PAYLOAD_KB} KB = ${(FRAME_COUNT * PAYLOAD_KB / 1024).toFixed(1)} MB total`);

  let framesReceived = 0;
  ctrl.on('message', () => {
    framesReceived++;
    if (framesReceived === FRAME_COUNT) {
      const elapsedMs = Date.now() - startMs;
      const totalMB = (FRAME_COUNT * PAYLOAD_KB) / 1024;
      const throughputMBs = totalMB / (elapsedMs / 1000);
      const throughputMbps = throughputMBs * 8;
      console.log('\n--- THROUGHPUT REPORT ---');
      console.log(`REQUESTED TARGET:   500 GB/s (500 MB/ms) — from original requirement`);
      console.log(`CELLULAR TARGET:     50 GB/s  (50 MB/ms)  — from original requirement`);
      console.log(`ACTUAL MEASURED:     ${throughputMBs.toFixed(1)} MB/s (${throughputMbps.toFixed(0)} Mbps) over localhost`);
      console.log(`FRAMES:              ${FRAME_COUNT} × ${PAYLOAD_KB}KB = ${totalMB.toFixed(1)} MB in ${elapsedMs}ms`);
      console.log(`BOTTLENECK:          Node.js single-threaded relay + WebSocket framing overhead`);
      console.log(`\nREALISTIC LIMITS:`);
      console.log(`  Wi-Fi 6 uplink:    ~800 Mbps (~100 MB/s) — phone RF hardware`);
      console.log(`  Wi-Fi 5 home:      ~150–400 Mbps (~20–50 MB/s)`);
      console.log(`  4G LTE:            ~10–100 Mbps (~1.2–12 MB/s)`);
      console.log(`  5G sub-6GHz:       ~50–300 Mbps (~6–37 MB/s)`);
      console.log(`  500 GB/s target:   BLOCKED — exceeds all known consumer hardware`);
      console.log(`  50 GB/s cellular:  BLOCKED — exceeds all known carrier infrastructure`);
      console.log('--- END REPORT ---\n');
      agent.close(); ctrl.close();
    }
  });

  startMs = Date.now();
  for (let i = 0; i < FRAME_COUNT; i++) {
    agent.send(JSON.stringify({
      message_type: 'CAMERA_FRAME',
      device_id,
      payload: { mime: 'image/jpeg', b64: payload.toString('base64') }
    }));
  }
})().catch(e => { console.error('bench error:', e.message); process.exit(1); });
