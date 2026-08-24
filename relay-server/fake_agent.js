// Temporary stand-in for the real Android agent, used only to prove the
// controller UI works end-to-end before the real Kotlin app exists.
// Prints the pairing code to stdout, plays "sound" by logging when it
// receives PLAY_SOUND, and reports PLAY_SOUND_RESULT back.
import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:8787');
let deviceId;

ws.on('open', () => ws.send(JSON.stringify({ message_type: 'PAIR_INIT', request_id: '1' })));
ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.message_type === 'PAIR_INIT_RESPONSE') {
    deviceId = msg.payload.device_id;
    console.log('PAIRING_CODE=' + msg.payload.pairing_code);
    ws.send(JSON.stringify({ message_type: 'AUTH_REQUEST', device_id: deviceId, role: 'agent' }));
  }
  if (msg.message_type === 'AUTH_RESPONSE' && msg.status === 'OK') {
    console.log('AGENT_READY');
  }
  if (msg.message_type === 'PLAY_SOUND') {
    console.log('PLAYING_SOUND: ' + msg.payload.sound_id);
    setTimeout(() => {
      ws.send(JSON.stringify({ message_type: 'PLAY_SOUND_RESULT', device_id: deviceId, payload: { result: 'PLAYED' } }));
      console.log('RESULT_SENT');
    }, 500);
  }
});
