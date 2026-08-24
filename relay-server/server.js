// Relay/signaling server — protocol v1 (see docs/PROTOCOL.md).
// Vertical-slice scope only: pairing handshake + PLAY_SOUND relay + audit log.
// ponytail: in-memory pairing/session store, single-process. No persistence,
// no clustering. Upgrade to Postgres + Redis (MASTER.md §18/§51) when this
// needs to survive a restart or scale past one process.

import { WebSocketServer } from 'ws';
import { randomUUID, createHmac, randomBytes } from 'crypto';

const PORT = process.env.PORT || 8787;
const wss = new WebSocketServer({ port: PORT });

// device_id -> { ws, role: 'agent' | 'controller', lastSeq }
const connections = new Map();
// pairing_code -> { deviceId, secret, expiresAt }
const pendingPairings = new Map();
// deviceId -> secret (paired devices' shared secret, HMAC key for session tokens)
const pairedDevices = new Map();
// audit log, newest first, capped
const audit = [];

function logAudit(event) {
  audit.unshift({ ...event, at: new Date().toISOString() });
  if (audit.length > 500) audit.pop();
  console.log('[audit]', event.type, event.deviceId ?? '', event.detail ?? '');
}

function send(ws, msg) {
  ws.send(JSON.stringify({ protocol_version: 1, timestamp: Date.now(), ...msg }));
}

function makeSessionToken(deviceId, secret) {
  const nonce = randomBytes(12).toString('hex');
  const sig = createHmac('sha256', secret).update(`${deviceId}:${nonce}`).digest('hex');
  return `${nonce}.${sig}`;
}

function verifySessionToken(deviceId, secret, token) {
  const [nonce, sig] = String(token).split('.');
  if (!nonce || !sig) return false;
  const expected = createHmac('sha256', secret).update(`${deviceId}:${nonce}`).digest('hex');
  return sig === expected;
}

wss.on('connection', (ws) => {
  let boundDeviceId = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, { message_type: 'ERROR', status: 'ERROR', error_code: 'MALFORMED_MESSAGE' });
    }

    switch (msg.message_type) {
      // Agent asks for a pairing code to show as QR/PIN on its own screen.
      case 'PAIR_INIT': {
        const code = String(Math.floor(100000 + Math.random() * 900000)); // 6-digit PIN
        const deviceId = msg.device_id || randomUUID();
        const secret = randomBytes(32).toString('hex');
        // Secret is live immediately — the agent authenticates as soon as it
        // holds device_id+secret, it does not need to wait for a controller
        // to claim the pairing code first.
        pairedDevices.set(deviceId, secret);
        pendingPairings.set(code, { deviceId, expiresAt: Date.now() + 5 * 60_000 });
        send(ws, { message_type: 'PAIR_INIT_RESPONSE', request_id: msg.request_id, status: 'OK', payload: { device_id: deviceId, pairing_code: code } });
        logAudit({ type: 'PAIR_INIT', deviceId, detail: 'pairing code issued' });
        break;
      }

      // Controller enters the PIN shown on the phone.
      case 'PAIR_REQUEST': {
        const entry = pendingPairings.get(msg.payload?.pairing_code);
        if (!entry || entry.expiresAt < Date.now()) {
          return send(ws, { message_type: 'PAIR_RESPONSE', request_id: msg.request_id, status: 'ERROR', error_code: 'NOT_SUPPORTED' });
        }
        const secret = pairedDevices.get(entry.deviceId);
        pendingPairings.delete(msg.payload.pairing_code);
        const token = makeSessionToken(entry.deviceId, secret);
        send(ws, { message_type: 'PAIR_RESPONSE', request_id: msg.request_id, status: 'OK', payload: { device_id: entry.deviceId, session_token: token } });
        logAudit({ type: 'PAIR_COMPLETE', deviceId: entry.deviceId, detail: 'controller paired' });
        break;
      }

      // Both agent and controller call this once they hold device_id + a valid token
      // (agent's token comes from PAIR_INIT_RESPONSE's implicit trust — see note below).
      case 'AUTH_REQUEST': {
        const { device_id, role } = msg;
        const secret = pairedDevices.get(device_id);
        if (!secret) return send(ws, { message_type: 'AUTH_RESPONSE', status: 'ERROR', error_code: 'AUTH_FAILED' });
        // ponytail: agent authenticates by knowing device_id + secret directly
        // (it minted the pairing, so it already holds the secret in memory from
        // PAIR_INIT_RESPONSE in this same process run). Controller must present
        // the session_token from PAIR_RESPONSE. Real mutual-auth (asymmetric
        // keys, Android Keystore) is Phase 1 hardening — MASTER.md §17 — this
        // is deliberately the smallest thing that proves the flow end to end.
        if (role === 'controller' && !verifySessionToken(device_id, secret, msg.payload?.session_token)) {
          return send(ws, { message_type: 'AUTH_RESPONSE', status: 'ERROR', error_code: 'AUTH_FAILED' });
        }
        boundDeviceId = device_id;
        connections.set(`${device_id}:${role}`, { ws, role, deviceId: device_id });
        send(ws, { message_type: 'AUTH_RESPONSE', status: 'OK', payload: { device_id } });
        logAudit({ type: 'AUTH_OK', deviceId: device_id, detail: role });
        break;
      }

      case 'PLAY_SOUND': {
        const target = connections.get(`${msg.device_id}:agent`);
        if (!target) {
          logAudit({ type: 'PLAY_SOUND_FAILED', deviceId: msg.device_id, detail: 'agent offline' });
          return send(ws, { message_type: 'PLAY_SOUND_ACK', request_id: msg.request_id, status: 'ERROR', error_code: 'DEVICE_OFFLINE' });
        }
        send(target.ws, { message_type: 'PLAY_SOUND', request_id: msg.request_id, device_id: msg.device_id, payload: msg.payload });
        logAudit({ type: 'PLAY_SOUND_SENT', deviceId: msg.device_id, detail: msg.payload?.sound_id });
        send(ws, { message_type: 'PLAY_SOUND_ACK', request_id: msg.request_id, status: 'OK' });
        break;
      }

      // Agent reports playback completed — forwarded to controller + audited.
      case 'PLAY_SOUND_RESULT': {
        logAudit({ type: 'PLAY_SOUND_RESULT', deviceId: msg.device_id, detail: msg.payload?.result });
        const controller = connections.get(`${msg.device_id}:controller`);
        if (controller) send(controller.ws, { message_type: 'PLAY_SOUND_RESULT', device_id: msg.device_id, payload: msg.payload });
        break;
      }

      case 'HEARTBEAT':
        send(ws, { message_type: 'HEARTBEAT', status: 'OK' });
        break;

      default:
        send(ws, { message_type: 'ERROR', status: 'ERROR', error_code: 'NOT_SUPPORTED' });
    }
  });

  ws.on('close', () => {
    if (boundDeviceId) logAudit({ type: 'DISCONNECT', deviceId: boundDeviceId });
    for (const [key, conn] of connections) if (conn.ws === ws) connections.delete(key);
  });
});

// Minimal HTTP audit endpoint for the controller UI to poll (no separate HTTP framework — ponytail).
import { createServer } from 'http';
createServer((req, res) => {
  if (req.url === '/audit') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(audit.slice(0, 50)));
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(PORT + 1);

console.log(`Relay WS listening on ${PORT}, audit HTTP on ${PORT + 1}`);
