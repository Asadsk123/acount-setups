// End-to-end test: notifications, installed-apps list, app policy (block/limit),
// uninstall prompt — controller <-> relay <-> agent.
import WebSocket from 'ws';
const RELAY = 'ws://localhost:8787';
const connect = () => new Promise((res) => { const ws = new WebSocket(RELAY); ws.on('open', () => res(ws)); });
const once = (ws, type) => new Promise((res) => {
  const on = (raw) => { const m = JSON.parse(raw.toString()); if (m.message_type === type) { ws.off('message', on); res(m); } };
  ws.on('message', on);
});
function assert(c, m) { if (!c) { console.error('FAIL:', m); process.exit(1); } }

const apps = [{ pkg: 'com.whatsapp', label: 'WhatsApp', blocked: false, limit_seconds: 0 }];
function startAgent(ws, deviceId) {
  const send = (o) => ws.send(JSON.stringify({ ...o, device_id: deviceId }));
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    switch (m.message_type) {
      case 'APPS_REQUEST': send({ message_type: 'APPS_RESPONSE', request_id: m.request_id, payload: { apps } }); break;
      case 'SET_APP_POLICY': {
        const a = apps.find((x) => x.pkg === m.payload.pkg);
        if (a) { a.blocked = m.payload.blocked; a.limit_seconds = m.payload.limit_seconds; }
        send({ message_type: 'APP_POLICY_ACK', request_id: m.request_id, payload: m.payload });
        break;
      }
      case 'UNINSTALL_REQUEST': send({ message_type: 'UNINSTALL_ACK', request_id: m.request_id, payload: { pkg: m.payload.pkg, state: 'prompted-on-device' } }); break;
    }
  });
  // push a notification shortly after connect
  setTimeout(() => send({ message_type: 'NOTIFICATION_EVENT', payload: { app: 'WhatsApp', title: 'Ammi', text: 'Khana?', time: Date.now() } }), 100);
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

  // notification pushed by agent should reach the controller
  const notif = await once(controller, 'NOTIFICATION_EVENT');
  assert(notif.payload.app === 'WhatsApp' && notif.payload.title === 'Ammi', 'notification should reach controller');

  // apps list
  const appsSeen = once(controller, 'APPS_RESPONSE');
  controller.send(JSON.stringify({ message_type: 'APPS_REQUEST', request_id: 'x1', device_id: deviceId }));
  const ar = await appsSeen;
  assert(ar.payload.apps[0].pkg === 'com.whatsapp', 'apps list should return installed apps');

  // block + time limit policy
  const polSeen = once(controller, 'APP_POLICY_ACK');
  controller.send(JSON.stringify({ message_type: 'SET_APP_POLICY', request_id: 'x2', device_id: deviceId, payload: { pkg: 'com.whatsapp', blocked: true, limit_seconds: 1800 } }));
  const pol = await polSeen;
  assert(pol.payload.blocked === true && pol.payload.limit_seconds === 1800, 'policy should be acked with block + limit');

  // uninstall prompt
  const unSeen = once(controller, 'UNINSTALL_ACK');
  controller.send(JSON.stringify({ message_type: 'UNINSTALL_REQUEST', request_id: 'x3', device_id: deviceId, payload: { pkg: 'com.whatsapp' } }));
  const un = await unSeen;
  assert(un.payload.state === 'prompted-on-device', 'uninstall should be prompted on device');

  // audit records the app/policy traffic (not notifications spam? notifications are fine to audit)
  const audit = await fetch('http://localhost:8788/audit').then((r) => r.json());
  assert(audit.some((e) => e.type === 'SET_APP_POLICY_SENT'), 'policy command should be audited');
  assert(audit.some((e) => e.type === 'APP_POLICY_ACK'), 'policy ack should be audited');

  console.log('ALL APPS/NOTIF CHECKS PASSED — notification, apps list, block+limit policy, uninstall prompt verified end to end');
  process.exit(0);
}
main().catch((e) => { console.error('FAIL: unexpected', e); process.exit(1); });
