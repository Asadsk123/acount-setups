// Full-protocol stand-in agent for browser-testing the controller dashboard
// without a phone. Prints the pairing code; answers device-info, location,
// input, lock, and sound like the real Agent.kt router.
import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:8787');
let deviceId;

const send = (o) => ws.send(JSON.stringify({ ...o, device_id: deviceId }));

ws.on('open', () => ws.send(JSON.stringify({ message_type: 'PAIR_INIT', request_id: '1' })));
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  switch (m.message_type) {
    case 'PAIR_INIT_RESPONSE':
      deviceId = m.payload.device_id;
      console.log('PAIRING_CODE=' + m.payload.pairing_code);
      send({ message_type: 'AUTH_REQUEST', role: 'agent' });
      break;
    case 'AUTH_RESPONSE':
      if (m.status === 'OK') {
        console.log('AGENT_READY');
        send({ message_type: 'CAPABILITY_RESPONSE', payload: { push_to_sound: true, device_info: true, location: true, remote_input: true, lock: true, screen: true, camera: true, mic: true, notifications: true, apps: true } });
        startNotifications();
      }
      break;
    case 'DEVICE_INFO_REQUEST':
      send({ message_type: 'DEVICE_INFO_RESPONSE', request_id: m.request_id, payload: { model: 'Pixel 5', android_version: '14', battery_pct: 82, charging: false, network_type: 'wifi', storage_free_bytes: 41_000_000_000 } });
      break;
    case 'LOCATION_REQUEST':
      send({ message_type: 'LOCATION_EVENT', payload: { lat: 24.8607, lon: 67.0011, accuracy_m: 12.5 } });
      break;
    case 'INPUT_COMMAND':
      console.log('INPUT:', JSON.stringify(m.payload));
      send({ message_type: 'INPUT_COMMAND_ACK', request_id: m.request_id, payload: { ok: true, action: m.payload.action } });
      break;
    case 'LOCK_REQUEST':
      console.log('LOCK requested');
      send({ message_type: 'LOCK_RESPONSE', request_id: m.request_id, payload: { ok: true } });
      break;
    case 'PLAY_SOUND':
      console.log('PLAY_SOUND:', m.payload.sound_id);
      send({ message_type: 'PLAY_SOUND_RESULT', payload: { result: 'PLAYED' } });
      break;

    case 'START_SCREEN': startStream('screen', 'SCREEN_FRAME', '#1e3a8a'); break;
    case 'STOP_SCREEN':  stopStream('screen'); break;
    case 'START_CAMERA': {
      const facing = m.payload?.facing || 'back';
      stopStream('camera');
      startStream('camera', 'CAMERA_FRAME', facing === 'front' ? '#7c3aed' : '#166534', `camera ${facing}`);
      break;
    }
    case 'STOP_CAMERA':  stopStream('camera'); break;
    case 'START_MIC':    startMic(); break;
    case 'STOP_MIC':     stopMic(); break;

    case 'APPS_REQUEST':
      send({ message_type: 'APPS_RESPONSE', payload: { apps: fakeApps } });
      break;
    case 'UNINSTALL_REQUEST':
      console.log('UNINSTALL requested:', m.payload.pkg);
      // Real agent fires the system uninstall dialog; here we report "prompted".
      send({ message_type: 'UNINSTALL_ACK', payload: { pkg: m.payload.pkg, state: 'prompted-on-device' } });
      break;
    case 'SET_APP_POLICY': {
      const a = fakeApps.find((x) => x.pkg === m.payload.pkg);
      if (a) { a.blocked = m.payload.blocked; a.limit_seconds = m.payload.limit_seconds; }
      console.log('POLICY:', JSON.stringify(m.payload));
      send({ message_type: 'APP_POLICY_ACK', payload: m.payload });
      break;
    }
  }
});

const fakeApps = [
  { pkg: 'com.whatsapp', label: 'WhatsApp', blocked: false, limit_seconds: 0 },
  { pkg: 'com.instagram.android', label: 'Instagram', blocked: false, limit_seconds: 0 },
  { pkg: 'com.google.android.youtube', label: 'YouTube', blocked: false, limit_seconds: 0 },
  { pkg: 'com.android.chrome', label: 'Chrome', blocked: false, limit_seconds: 0 },
];

const sampleNotifs = [
  { app: 'WhatsApp', title: 'Ammi', text: 'Khana kha liya?' },
  { app: 'Gmail', title: 'Invoice #4821', text: 'Your payment is due' },
  { app: 'Instagram', title: 'new_follower', text: 'started following you' },
];
let notifIdx = 0;
function startNotifications() {
  setInterval(() => {
    const n = sampleNotifs[notifIdx++ % sampleNotifs.length];
    send({ message_type: 'NOTIFICATION_EVENT', payload: { ...n, time: Date.now() } });
  }, 4000);
}

// --- streaming stand-ins: real agent sends JPEG (screen/camera) and PCM (mic);
// here we synthesize equivalent frames so the controller's receive+display
// path can be verified without a phone. ---
const timers = {};

function svgFrame(color, label, t) {
  const cx = 40 + (Math.sin(t / 3) * 0.5 + 0.5) * 240;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180">
    <rect width="320" height="180" fill="${color}"/>
    <circle cx="${cx.toFixed(0)}" cy="90" r="24" fill="#fbbf24"/>
    <text x="12" y="28" fill="#fff" font-family="monospace" font-size="14">${label} ${t}</text>
  </svg>`;
  return Buffer.from(svg).toString('base64');
}

function startStream(id, frameType, color, label = id) {
  if (timers[id]) return;
  console.log(`${label} stream started`);
  send({ message_type: 'STREAM_STATUS', payload: { stream: id, state: 'started', label } });
  let t = 0;
  timers[id] = setInterval(() => {
    t++;
    send({ message_type: frameType, payload: { mime: 'image/svg+xml', b64: svgFrame(color, label, t) } });
  }, 250); // 4 fps
}
function stopStream(id) {
  if (!timers[id]) return;
  clearInterval(timers[id]); delete timers[id];
  console.log(`${id} stream stopped`);
  send({ message_type: 'STREAM_STATUS', payload: { stream: id, state: 'stopped' } });
}

function startMic() {
  if (timers.mic) return;
  console.log('mic started');
  send({ message_type: 'STREAM_STATUS', payload: { stream: 'mic', state: 'started' } });
  const sampleRate = 8000, chunkSamples = 800; // 100ms chunks
  let phase = 0;
  timers.mic = setInterval(() => {
    const buf = Buffer.alloc(chunkSamples * 2);
    for (let i = 0; i < chunkSamples; i++) {
      const v = Math.round(Math.sin(phase) * 12000);
      buf.writeInt16LE(v, i * 2);
      phase += 2 * Math.PI * 440 / sampleRate;
    }
    send({ message_type: 'MIC_CHUNK', payload: { pcm_b64: buf.toString('base64'), sample_rate: sampleRate } });
  }, 100);
}
function stopMic() {
  if (!timers.mic) return;
  clearInterval(timers.mic); delete timers.mic;
  console.log('mic stopped');
  send({ message_type: 'STREAM_STATUS', payload: { stream: 'mic', state: 'stopped' } });
}
