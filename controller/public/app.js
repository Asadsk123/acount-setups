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
  const labels = { push_to_sound: 'Sound', device_info: 'Device info', location: 'Location', remote_input: 'Remote control', lock: 'Lock' };
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
