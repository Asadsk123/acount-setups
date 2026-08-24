const RELAY_WS = 'ws://localhost:8787';
const RELAY_AUDIT = 'http://localhost:8788/audit';

let ws = null;
let deviceId = null;
let sessionToken = null;

const pairBtn = document.getElementById('pairBtn');
const codeInput = document.getElementById('code');
const pairStatus = document.getElementById('pairStatus');
const pairCard = document.getElementById('pairCard');
const deviceCard = document.getElementById('deviceCard');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const soundBtn = document.getElementById('soundBtn');
const soundStatus = document.getElementById('soundStatus');
const auditEl = document.getElementById('audit');

function connectWs() {
  ws = new WebSocket(RELAY_WS);
  ws.onopen = () => pairBtn.disabled = false;
  ws.onclose = () => { statusDot.className = 'dot offline'; statusText.textContent = 'relay disconnected'; };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.message_type === 'PAIR_RESPONSE') return onPairResponse(msg);
    if (msg.message_type === 'AUTH_RESPONSE') return onAuthResponse(msg);
    if (msg.message_type === 'PLAY_SOUND_ACK') return onPlaySoundAck(msg);
    if (msg.message_type === 'PLAY_SOUND_RESULT') return onPlaySoundResult(msg);
  };
}
connectWs();

pairBtn.onclick = () => {
  const pairing_code = codeInput.value.trim();
  if (pairing_code.length !== 6) { pairStatus.textContent = '6-digit code chahiye.'; return; }
  pairStatus.textContent = 'pairing…';
  ws.send(JSON.stringify({ message_type: 'PAIR_REQUEST', request_id: crypto.randomUUID(), payload: { pairing_code } }));
};

function onPairResponse(msg) {
  if (msg.status !== 'OK') { pairStatus.textContent = 'Galat code ya expired.'; return; }
  deviceId = msg.payload.device_id;
  sessionToken = msg.payload.session_token;
  ws.send(JSON.stringify({ message_type: 'AUTH_REQUEST', device_id: deviceId, role: 'controller', payload: { session_token: sessionToken } }));
}

function onAuthResponse(msg) {
  if (msg.status !== 'OK') { pairStatus.textContent = 'Auth fail.'; return; }
  pairCard.style.display = 'none';
  deviceCard.style.display = 'block';
  statusDot.className = 'dot online';
  statusText.textContent = 'Paired — device ' + deviceId.slice(0, 8);
  soundBtn.disabled = false;
  pollAudit();
}

soundBtn.onclick = () => {
  soundBtn.disabled = true;
  soundStatus.textContent = 'sending…';
  ws.send(JSON.stringify({ message_type: 'PLAY_SOUND', request_id: crypto.randomUUID(), device_id: deviceId, payload: { sound_id: 'tan_tan' } }));
};

function onPlaySoundAck(msg) {
  soundStatus.textContent = msg.status === 'OK' ? 'sent — waiting for device…' : 'FAILED: ' + msg.error_code;
  soundBtn.disabled = false;
  pollAudit();
}

function onPlaySoundResult(msg) {
  soundStatus.textContent = 'device result: ' + msg.payload.result;
  pollAudit();
}

async function pollAudit() {
  try {
    const events = await fetch(RELAY_AUDIT).then((r) => r.json());
    auditEl.innerHTML = events.map((e) => `<div>${e.at.split('T')[1].slice(0,8)} — ${e.type} — ${e.deviceId ?? ''} ${e.detail ?? ''}</div>`).join('');
  } catch {}
}
setInterval(pollAudit, 2000);
pollAudit();
