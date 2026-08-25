const RELAY_WS = `ws://${location.hostname}:8787`;
const RELAY_AUDIT = `http://${location.hostname}:8788/audit`;

let ws = null, deviceId = null, sessionToken = null;
const $ = (id) => document.getElementById(id);

function connectWs() {
  ws = new WebSocket(RELAY_WS);
  ws.onopen = () => { $('pairBtn').disabled = false; };
  ws.onclose = () => setStatus('relay disconnected', false);
  ws.onmessage = (ev) => route(JSON.parse(ev.data));
}
connectWs();

function send(msg) { ws.send(JSON.stringify({ ...msg, request_id: crypto.randomUUID(), device_id: deviceId })); }

function route(msg) {
  switch (msg.message_type) {
    case 'PAIR_RESPONSE': return onPair(msg);
    case 'AUTH_RESPONSE': return onAuth(msg);
    case 'CAPABILITY_RESPONSE': return onCaps(msg.payload);
    case 'DEVICE_INFO_RESPONSE': return onDeviceInfo(msg.payload);
    case 'LOCATION_EVENT': return onLocation(msg.payload);
    case 'INPUT_COMMAND_ACK': return setControlStatus(`input: ${msg.payload.action} → ${msg.payload.ok ? 'ok' : 'not applied'}`);
    case 'LOCK_RESPONSE': return setActionStatus(msg.payload.ok ? 'device locked' : 'lock failed — Device Admin not enabled on phone');
    case 'PLAY_SOUND_ACK': return setActionStatus(msg.status === 'OK' ? 'sound sent…' : 'sound failed: ' + msg.error_code);
    case 'PLAY_SOUND_RESULT': return setActionStatus('sound result: ' + msg.payload.result);
    case 'SCREEN_FRAME': return onFrame('screenView', 'screenStatus', msg.payload);
    case 'CAMERA_FRAME': return onFrame('cameraView', 'cameraStatus', msg.payload);
    case 'MIC_CHUNK': return onMicChunk(msg.payload);
    case 'STREAM_STATUS': return onStreamStatus(msg.payload);
  }
}

// --- pairing ---
$('pairBtn').onclick = () => {
  const pairing_code = $('code').value.trim();
  if (pairing_code.length !== 6) { $('pairStatus').textContent = '6-digit code required.'; return; }
  $('pairStatus').textContent = 'pairing…';
  ws.send(JSON.stringify({ message_type: 'PAIR_REQUEST', request_id: crypto.randomUUID(), payload: { pairing_code } }));
};
function onPair(msg) {
  if (msg.status !== 'OK') { $('pairStatus').textContent = 'Wrong or expired code.'; return; }
  deviceId = msg.payload.device_id; sessionToken = msg.payload.session_token;
  send({ message_type: 'AUTH_REQUEST', role: 'controller', payload: { session_token: sessionToken } });
}
function onAuth(msg) {
  if (msg.status !== 'OK') { $('pairStatus').textContent = 'Auth failed.'; return; }
  $('pairCard').classList.add('hidden');
  $('dash').classList.remove('hidden');
  setStatus('Paired — device ' + deviceId.slice(0, 8), true);
  pollAudit();
}

// --- capabilities ---
function onCaps(caps) {
  const labels = { push_to_sound: 'Sound', device_info: 'Device info', location: 'Location', remote_input: 'Remote control', lock: 'Lock', screen: 'Screen', camera: 'Camera', mic: 'Mic' };
  $('caps').innerHTML = Object.entries(labels)
    .map(([k, label]) => `<span class="chip ${caps[k] ? 'on' : ''}">${label}${caps[k] ? '' : ' (off)'}</span>`).join('');
}

// --- device info ---
$('infoBtn').onclick = () => { send({ message_type: 'DEVICE_INFO_REQUEST' }); setControlStatus(''); };
function onDeviceInfo(p) {
  const rows = [
    ['Model', p.model], ['Android', p.android_version ?? '—'],
    ['Battery', p.battery_pct + '%' + (p.charging ? ' (charging)' : '')],
    ['Network', p.network_type],
  ];
  if (p.storage_free_bytes) rows.push(['Storage free', (p.storage_free_bytes / 1e9).toFixed(1) + ' GB']);
  $('deviceInfo').innerHTML = rows.map(([k, v]) => `<span class="k">${k}</span><span>${v}</span>`).join('');
}

// --- location ---
$('locBtn').onclick = () => send({ message_type: 'LOCATION_REQUEST' });
function onLocation(p) {
  $('locationInfo').innerHTML =
    `<span class="k">Lat</span><span>${p.lat.toFixed(5)}</span>` +
    `<span class="k">Lon</span><span>${p.lon.toFixed(5)}</span>` +
    `<span class="k">Accuracy</span><span>±${Math.round(p.accuracy_m)} m</span>` +
    `<span class="k">Map</span><span><a href="https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=16/${p.lat}/${p.lon}" target="_blank" rel="noopener">open</a></span>`;
}

// --- remote control: pointer events on the touchpad ---
const pad = $('touchpad');
let down = null;
pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); down = norm(e); });
pad.addEventListener('pointerup', (e) => {
  if (!down) return;
  const up = norm(e);
  const dist = Math.hypot(up.nx - down.nx, up.ny - down.ny);
  if (dist < 0.03) {
    send({ message_type: 'INPUT_COMMAND', payload: { action: 'tap', nx: up.nx, ny: up.ny } });
  } else {
    send({ message_type: 'INPUT_COMMAND', payload: { action: 'swipe', nx1: down.nx, ny1: down.ny, nx2: up.nx, ny2: up.ny, duration_ms: 300 } });
  }
  down = null;
});
function norm(e) {
  const r = pad.getBoundingClientRect();
  return { nx: (e.clientX - r.left) / r.width, ny: (e.clientY - r.top) / r.height };
}
document.querySelectorAll('[data-global]').forEach((b) =>
  b.addEventListener('click', () => send({ message_type: 'INPUT_COMMAND', payload: { action: 'global', name: b.dataset.global } })));
$('textBtn').onclick = () => {
  const text = $('textInput').value;
  if (!text) return;
  send({ message_type: 'INPUT_COMMAND', payload: { action: 'text', text } });
  $('textInput').value = '';
};

// --- media streams (screen / camera / mic) ---
let screenFrames = 0, cameraFrames = 0, micChunks = 0;
function onFrame(imgId, statusId, p) {
  $(imgId).src = `data:${p.mime || 'image/jpeg'};base64,${p.b64}`;
  const n = imgId === 'screenView' ? (screenFrames += 1) : (cameraFrames += 1);
  $(statusId).textContent = `live — ${n} frames`;
}
let audioCtx = null;
function onMicChunk(p) {
  micChunks += 1;
  // Decode 16-bit PCM base64 -> Float32, play via WebAudio + drive a level meter.
  const bytes = Uint8Array.from(atob(p.pcm_b64), (c) => c.charCodeAt(0));
  const samples = new Int16Array(bytes.buffer);
  let peak = 0;
  const f32 = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) { f32[i] = samples[i] / 32768; peak = Math.max(peak, Math.abs(f32[i])); }
  $('micLevel').style.width = Math.round(peak * 100) + '%';
  $('micStatus').textContent = `receiving — ${micChunks} chunks`;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const buf = audioCtx.createBuffer(1, f32.length, p.sample_rate || 8000);
    buf.getChannelData(0).set(f32);
    const src = audioCtx.createBufferSource();
    src.buffer = buf; src.connect(audioCtx.destination); src.start();
  } catch {}
}
function onStreamStatus(p) {
  const map = { screen: 'screenStatus', camera: 'cameraStatus', mic: 'micStatus' };
  if (map[p.stream]) $(map[p.stream]).textContent = p.state;
  if (p.state === 'started') { if (p.stream === 'screen') screenFrames = 0; if (p.stream === 'camera') cameraFrames = 0; if (p.stream === 'mic') micChunks = 0; }
}
$('screenStart').onclick = () => send({ message_type: 'START_SCREEN' });
$('screenStop').onclick = () => send({ message_type: 'STOP_SCREEN' });
$('cameraStart').onclick = () => send({ message_type: 'START_CAMERA' });
$('cameraStop').onclick = () => send({ message_type: 'STOP_CAMERA' });
$('micStart').onclick = () => send({ message_type: 'START_MIC' });
$('micStop').onclick = () => send({ message_type: 'STOP_MIC' });

// --- actions ---
$('soundBtn').onclick = () => send({ message_type: 'PLAY_SOUND', payload: { sound_id: 'tan_tan' } });
$('lockBtn').onclick = () => send({ message_type: 'LOCK_REQUEST' });

// --- helpers ---
function setStatus(t, online) { $('statusText').textContent = t; $('statusDot').className = 'dot ' + (online ? 'online' : 'offline'); }
function setControlStatus(t) { $('controlStatus').textContent = t; pollAudit(); }
function setActionStatus(t) { $('actionStatus').textContent = t; pollAudit(); }

async function pollAudit() {
  try {
    const events = await fetch(RELAY_AUDIT).then((r) => r.json());
    $('audit').innerHTML = events.map((e) =>
      `<div>${e.at.split('T')[1].slice(0, 8)} — ${e.type} — ${e.detail ?? ''}</div>`).join('');
  } catch {}
}
setInterval(() => { if (deviceId) pollAudit(); }, 2500);
