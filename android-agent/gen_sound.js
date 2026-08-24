// One-off generator for res/raw/tan_tan.wav — two short beeps.
// Not part of the app; run once, delete or keep for regenerating the asset.
import { writeFileSync } from 'fs';

const sampleRate = 44100;
const beep = (freqHz, durMs) => {
  const n = Math.floor(sampleRate * durMs / 1000);
  const samples = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const envelope = Math.min(1, i / 200) * Math.min(1, (n - i) / 200); // fade in/out, avoid clicks
    samples[i] = Math.round(Math.sin(2 * Math.PI * freqHz * t) * 32767 * 0.6 * envelope);
  }
  return samples;
};

const silence = (durMs) => new Int16Array(Math.floor(sampleRate * durMs / 1000));

const parts = [beep(880, 180), silence(90), beep(880, 180)];
const totalLen = parts.reduce((s, p) => s + p.length, 0);
const pcm = new Int16Array(totalLen);
let offset = 0;
for (const p of parts) { pcm.set(p, offset); offset += p.length; }

const dataSize = pcm.length * 2;
const buf = Buffer.alloc(44 + dataSize);
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + dataSize, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20); // PCM
buf.writeUInt16LE(1, 22); // mono
buf.writeUInt32LE(sampleRate, 24);
buf.writeUInt32LE(sampleRate * 2, 28);
buf.writeUInt16LE(2, 32);
buf.writeUInt16LE(16, 34);
buf.write('data', 36);
buf.writeUInt32LE(dataSize, 40);
Buffer.from(pcm.buffer).copy(buf, 44);

writeFileSync('app/src/main/res/raw/tan_tan.wav', buf);
console.log('wrote app/src/main/res/raw/tan_tan.wav,', buf.length, 'bytes');
