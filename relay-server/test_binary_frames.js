// Tests binary WebSocket frame routing through the relay.
// Agent sends binary frames (opcode 0x82); relay forwards to controller socket.
// Binary envelope: [1 byte type][36 bytes device_id ASCII][payload]
// MIC type also embeds [4 bytes sample_rate BE] before PCM payload.
import WebSocket from 'ws';
const RELAY = 'ws://localhost:8787';

const connect = () => new Promise((res) => { const ws = new WebSocket(RELAY); ws.on('open', () => res(ws)); });
const once = (ws, type) => new Promise((res) => {
  const on = (raw) => { const m = JSON.parse(raw.toString()); if (m.message_type === type) { ws.off('message', on); res(m); } };
  ws.on('message', on);
});
const onceBinary = (ws) => new Promise((res) => {
  const on = (raw, isBinary) => { if (isBinary) { ws.off('message', on); res(Buffer.isBuffer(raw) ? raw : Buffer.from(raw)); } };
  ws.on('message', on);
});
function assert(c, m) { if (!c) { console.error('FAIL:', m); process.exit(1); } }

// Build a binary frame header as the agent would
function makeHeader(frameType, deviceId) {
  const buf = Buffer.alloc(37);
  buf[0] = frameType;
  buf.write(deviceId, 1, 36, 'ascii');
  return buf;
}

async function main() {
  const agent = await connect();
  const controller = await connect();

  // Pair and auth both sides
  agent.send(JSON.stringify({ message_type: 'PAIR_INIT', request_id: 'a1' }));
  const pi = await once(agent, 'PAIR_INIT_RESPONSE');
  const deviceId = pi.payload.device_id;
  agent.send(JSON.stringify({ message_type: 'AUTH_REQUEST', device_id: deviceId, role: 'agent' }));
  await once(agent, 'AUTH_RESPONSE');
  controller.send(JSON.stringify({ message_type: 'PAIR_REQUEST', request_id: 'c1', payload: { pairing_code: pi.payload.pairing_code } }));
  const pr = await once(controller, 'PAIR_RESPONSE');
  controller.send(JSON.stringify({ message_type: 'AUTH_REQUEST', device_id: deviceId, role: 'controller', payload: { session_token: pr.payload.session_token } }));
  await once(controller, 'AUTH_RESPONSE');

  // 1. Agent sends binary CAMERA_FRAME (type=0x01)
  const jpegBytes = Buffer.from([0xFF, 0xD8, 0xFF, 0xD9]); // minimal JPEG stub
  const cameraHeader = makeHeader(0x01, deviceId);
  const cameraFrame = Buffer.concat([cameraHeader, jpegBytes]);
  const gotCamera = onceBinary(controller);
  agent.send(cameraFrame, { binary: true });
  const camReceived = await gotCamera;
  assert(camReceived.length === cameraFrame.length, `controller should receive full camera frame (got ${camReceived.length})`);
  assert(camReceived[0] === 0x01, 'frame type should be 0x01 (CAMERA)');
  assert(camReceived.slice(37).equals(jpegBytes), 'payload should be forwarded intact');

  // 2. Agent sends binary MIC_CHUNK (type=0x02) with sample_rate header
  const pcmBytes = Buffer.alloc(160); // 100ms of silence at 8kHz
  const micHeader = Buffer.alloc(41); // 37 base + 4 sample_rate
  micHeader[0] = 0x02;
  micHeader.write(deviceId, 1, 36, 'ascii');
  const sampleRate = 8000;
  micHeader[37] = (sampleRate >> 24) & 0xFF;
  micHeader[38] = (sampleRate >> 16) & 0xFF;
  micHeader[39] = (sampleRate >> 8) & 0xFF;
  micHeader[40] = sampleRate & 0xFF;
  const micFrame = Buffer.concat([micHeader, pcmBytes]);
  const gotMic = onceBinary(controller);
  agent.send(micFrame, { binary: true });
  const micReceived = await gotMic;
  assert(micReceived.length === micFrame.length, `controller should receive full mic frame (got ${micReceived.length})`);
  assert(micReceived[0] === 0x02, 'frame type should be 0x02 (MIC)');

  // 3. Unauthenticated socket must NOT have binary frames relayed
  const rogue = await connect();
  let rogueFrameReceived = false;
  controller.once('message', (raw, isBinary) => { if (isBinary) rogueFrameReceived = true; });
  rogue.send(cameraFrame, { binary: true });
  await new Promise((r) => setTimeout(r, 150));
  assert(!rogueFrameReceived, 'binary frames from unauthenticated socket must not reach controller');

  // 4. Binary frame with wrong device_id must be rejected silently
  const wrongId = '00000000-0000-0000-0000-000000000000';
  const wrongHeader = makeHeader(0x01, wrongId);
  const wrongFrame = Buffer.concat([wrongHeader, jpegBytes]);
  let wrongFrameReceived = false;
  controller.once('message', (raw, isBinary) => { if (isBinary) wrongFrameReceived = true; });
  agent.send(wrongFrame, { binary: true });
  await new Promise((r) => setTimeout(r, 150));
  assert(!wrongFrameReceived, 'binary frame with wrong device_id must be rejected');

  console.log('BINARY FRAME CHECKS PASSED — camera+mic routed, unauthenticated+wrong-id rejected');
  process.exit(0);
}
main().catch((e) => { console.error('FAIL: unexpected', e); process.exit(1); });
