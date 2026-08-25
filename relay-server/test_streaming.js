// End-to-end test for the media streams: screen, camera, mic.
// Controller START_* -> agent streams frames/chunks -> controller receives them.
// Verifies the relay routes high-rate frames and that start/stop works.
import WebSocket from 'ws';
const RELAY = 'ws://localhost:8787';
const connect = () => new Promise((res) => { const ws = new WebSocket(RELAY); ws.on('open', () => res(ws)); });
const once = (ws, type) => new Promise((res) => {
  const on = (raw) => { const m = JSON.parse(raw.toString()); if (m.message_type === type) { ws.off('message', on); res(m); } };
  ws.on('message', on);
});
function assert(c, m) { if (!c) { console.error('FAIL:', m); process.exit(1); } }

// Scripted streaming agent (same shape as fake_agent_full).
function startAgent(ws, deviceId) {
  const timers = {};
  const send = (o) => ws.send(JSON.stringify({ ...o, device_id: deviceId }));
  const stream = (id, type) => {
    send({ message_type: 'STREAM_STATUS', payload: { stream: id, state: 'started' } });
    let t = 0; timers[id] = setInterval(() => { t++; send({ message_type: type, payload: { mime: 'image/svg+xml', b64: Buffer.from('<svg/>').toString('base64'), n: t } }); }, 50);
  };
  const stop = (id) => { if (timers[id]) { clearInterval(timers[id]); delete timers[id]; send({ message_type: 'STREAM_STATUS', payload: { stream: id, state: 'stopped' } }); } };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    switch (m.message_type) {
      case 'START_SCREEN': stream('screen', 'SCREEN_FRAME'); break;
      case 'STOP_SCREEN': stop('screen'); break;
      case 'START_CAMERA': stream('camera', 'CAMERA_FRAME'); break;
      case 'STOP_CAMERA': stop('camera'); break;
      case 'START_MIC': {
        send({ message_type: 'STREAM_STATUS', payload: { stream: 'mic', state: 'started' } });
        timers.mic = setInterval(() => send({ message_type: 'MIC_CHUNK', payload: { pcm_b64: Buffer.alloc(160).toString('base64'), sample_rate: 8000 } }), 50);
        break;
      }
      case 'STOP_MIC': stop('mic'); break;
    }
  });
}

async function main() {
  const agent = await connect();
  const controller = await connect();
  agent.send(JSON.stringify({ message_type: 'PAIR_INIT', request_id: 'a1' }));
  const pi = await once(agent, 'PAIR_INIT_RESPONSE');
  const deviceId = pi.payload.device_id;
  startAgent(agent, deviceId);
  agent.send(JSON.stringify({ message_type: 'AUTH_REQUEST', device_id: deviceId, role: 'agent' }));
  await once(agent, 'AUTH_RESPONSE');
  controller.send(JSON.stringify({ message_type: 'PAIR_REQUEST', request_id: 'c1', payload: { pairing_code: pi.payload.pairing_code } }));
  const pr = await once(controller, 'PAIR_RESPONSE');
  controller.send(JSON.stringify({ message_type: 'AUTH_REQUEST', device_id: deviceId, role: 'controller', payload: { session_token: pr.payload.session_token } }));
  await once(controller, 'AUTH_RESPONSE');

  async function checkStream(startType, frameType, streamName) {
    let frames = 0;
    const counter = (raw) => { const m = JSON.parse(raw.toString()); if (m.message_type === frameType) frames++; };
    controller.on('message', counter);
    const started = once(controller, 'STREAM_STATUS');
    controller.send(JSON.stringify({ message_type: startType, device_id: deviceId }));
    const s = await started;
    assert(s.payload.state === 'started' && s.payload.stream === streamName, `${streamName} should report started`);
    await new Promise((r) => setTimeout(r, 400)); // collect ~8 frames at 50ms
    controller.off('message', counter);
    assert(frames >= 3, `${streamName} should deliver frames to controller (got ${frames})`);
    return frames;
  }

  const sf = await checkStream('START_SCREEN', 'SCREEN_FRAME', 'screen');
  const cf = await checkStream('START_CAMERA', 'CAMERA_FRAME', 'camera');
  const mf = await checkStream('START_MIC', 'MIC_CHUNK', 'mic');

  // stop screen -> frames must stop arriving
  const stopped = once(controller, 'STREAM_STATUS');
  controller.send(JSON.stringify({ message_type: 'STOP_SCREEN', device_id: deviceId }));
  const st = await stopped;
  assert(st.payload.state === 'stopped', 'screen should report stopped');
  let after = 0;
  const c2 = (raw) => { if (JSON.parse(raw.toString()).message_type === 'SCREEN_FRAME') after++; };
  controller.on('message', c2);
  await new Promise((r) => setTimeout(r, 300));
  controller.off('message', c2);
  assert(after === 0, `no screen frames should arrive after STOP (got ${after})`);

  // audit must NOT be flooded with per-frame lines (HIGH_RATE excluded)
  const audit = await fetch('http://localhost:8788/audit').then((r) => r.json());
  const frameLines = audit.filter((e) => ['SCREEN_FRAME', 'CAMERA_FRAME', 'MIC_CHUNK'].includes(e.type)).length;
  assert(frameLines === 0, 'high-rate frames must not be written to the audit log');
  assert(audit.some((e) => e.type === 'STREAM_STATUS'), 'stream start/stop should be audited');

  console.log(`ALL STREAMING CHECKS PASSED — screen(${sf}) camera(${cf}) mic(${mf}) frames delivered, stop works, audit not flooded`);
  process.exit(0);
}
main().catch((e) => { console.error('FAIL: unexpected', e); process.exit(1); });
