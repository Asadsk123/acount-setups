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
        send({ message_type: 'CAPABILITY_RESPONSE', payload: { push_to_sound: true, device_info: true, location: true, remote_input: true, lock: true } });
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
  }
});
