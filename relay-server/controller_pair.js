// One-shot controller pairing script
import { WebSocket } from 'ws';

const RELAY = 'wss://yen-juan-weighted-receptors.trycloudflare.com';
const CODE  = process.argv[2];

if (!CODE) { console.error('Usage: node controller_pair.js <pairing_code>'); process.exit(1); }

const ws = new WebSocket(RELAY);

function send(msg) {
  ws.send(JSON.stringify({ protocol_version: 1, timestamp: Date.now(), ...msg }));
  console.log('→', msg.message_type, JSON.stringify(msg).slice(0, 120));
}

ws.on('open', () => {
  console.log('WS open — sending PAIR_REQUEST with code', CODE);
  send({ message_type: 'PAIR_REQUEST', request_id: 'test-1',
         payload: { pairing_code: CODE } });
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw);
  console.log('←', msg.message_type, JSON.stringify(msg).slice(0, 200));

  if (msg.message_type === 'PAIR_RESPONSE' && msg.status === 'OK') {
    const { device_id, session_token } = msg.payload;
    console.log('\nPAIR_RESPONSE OK — device_id:', device_id, '\nsession_token:', session_token.slice(0, 40) + '...');
    console.log('\nSending AUTH_REQUEST as controller...');
    send({ message_type: 'AUTH_REQUEST', device_id, role: 'controller',
           payload: { session_token } });
  } else if (msg.message_type === 'AUTH_RESPONSE') {
    console.log('\nAUTH_RESPONSE status:', msg.status);
    if (msg.status === 'OK') {
      console.log('\n✅ CONTROLLER PAIRED AND AUTHENTICATED');
      console.log('Waiting 3s for PAIR_COMPLETE to reach phone, then sending PLAY_SOUND...');
      setTimeout(() => {
        const device_id = msg.payload?.device_id;
        send({ message_type: 'PLAY_SOUND', device_id, payload: { sound: 'chime' } });
        setTimeout(() => { console.log('Done.'); ws.close(); }, 2000);
      }, 3000);
    } else {
      console.log('AUTH FAILED:', msg.error_code);
      ws.close();
    }
  } else if (msg.message_type === 'PAIR_RESPONSE' && msg.status !== 'OK') {
    console.log('PAIR_REQUEST FAILED:', msg.error_code);
    ws.close();
  } else if (msg.message_type === 'PLAY_SOUND_ACK') {
    console.log('✅ PLAY_SOUND_ACK received — controller→relay→agent command path WORKING');
  }
});

ws.on('error', e => { console.error('WS error:', e.message); });
ws.on('close', () => console.log('WS closed'));
