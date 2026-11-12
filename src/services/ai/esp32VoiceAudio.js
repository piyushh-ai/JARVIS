function audioError(message, statusCode) {
  const error = new Error(message);
  error.name = "VoiceAudioError";
  error.statusCode = statusCode;
  return error;
}

const TARGET_PEAK = 23000;
const MAX_GAIN = 40;

export function decodeMuLawSample(value) {
  const u = (~value) & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  return sign ? -sample : sample;
}

export function normalizePcm16(samples, { targetPeak = TARGET_PEAK, maxGain = MAX_GAIN } = {}) {
  if (!(samples instanceof Int16Array) || samples.length === 0) {
    throw audioError("Audio contains no samples", 400);
  }
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i];
  const dc = sum / samples.length;

  let peak = 0;
  const centered = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i] - dc;
    centered[i] = value;
    const magnitude = Math.abs(value);
    if (magnitude > peak) peak = magnitude;
  }

  const gain = peak > 0 ? Math.min(maxGain, targetPeak / peak) : 1;
  const output = new Int16Array(samples.length);
  for (let i = 0; i < centered.length; i++) {
    const value = Math.round(centered[i] * gain);
    output[i] = Math.max(-32768, Math.min(32767, value));
  }
  return output;
}

function writePcmWav(samples, sampleRate = 16000) {
  const buffer = Buffer.allocUnsafe(44 + samples.length * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buffer.writeInt16LE(samples[i], 44 + i * 2);
  return buffer;
}

export function parseAndPrepareVoiceWav(buffer, codecHeader = "") {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" ||
      buffer.toString("ascii", 8, 12) !== "WAVE" || buffer.readUInt32LE(4) !== buffer.length - 8) {
    throw audioError("Invalid RIFF/WAVE audio payload", 400);
  }
  let offset = 12, format = null, dataOffset = -1, dataSize = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8, end = start + size;
    if (end > buffer.length) throw audioError("WAV chunk exceeds payload", 400);
    if (id === "fmt ") {
      if (size < 16) throw audioError("Invalid WAV fmt chunk", 400);
      format = {
        encoding: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        bits: buffer.readUInt16LE(start + 14),
        fmtLength: size,
      };
    }
    if (id === "data") { dataOffset = start; dataSize = size; }
    offset = end + (size & 1);
  }
  if (!format || dataOffset < 0 || dataSize <= 0 || dataOffset + dataSize + (dataSize & 1) !== buffer.length) {
    throw audioError("WAV data chunk is missing or does not match payload", 400);
  }
  if (format.channels !== 1) throw audioError("WAV must be mono", 415);
  if (format.blockAlign !== format.bits / 8 || format.byteRate !== format.sampleRate * format.blockAlign) {
    throw audioError("WAV byte rate or block alignment is invalid", 400);
  }

  let pcm;
  if (format.encoding === 7 && format.bits === 8 && format.sampleRate === 16000 && format.fmtLength === 16) {
    if (codecHeader.toLowerCase() !== "mulaw") throw audioError("X-Audio-Codec must be mulaw for G.711 audio", 415);
    const decoded = new Int16Array(dataSize);
    for (let i = 0; i < dataSize; i++) decoded[i] = decodeMuLawSample(buffer[dataOffset + i]);
    pcm = normalizePcm16(decoded);
  } else if (format.encoding === 1 && format.bits === 16 && format.sampleRate === 8000) {
    if (codecHeader && codecHeader.toLowerCase() === "mulaw") throw audioError("Codec header does not match PCM16 WAV", 415);
    const sourceCount = Math.floor(dataSize / 2);
    if (sourceCount < 1 || dataSize % 2) throw audioError("Invalid PCM16 data chunk", 400);
    const source = new Int16Array(sourceCount);
    for (let i = 0; i < sourceCount; i++) source[i] = buffer.readInt16LE(dataOffset + i * 2);
    // Linear interpolation from 8 kHz to 16 kHz keeps the legacy firmware path compatible.
    const upsampled = new Int16Array(sourceCount * 2);
    for (let i = 0; i < sourceCount; i++) {
      const current = source[i], next = source[Math.min(i + 1, sourceCount - 1)];
      upsampled[i * 2] = current;
      upsampled[i * 2 + 1] = Math.round((current + next) / 2);
    }
    pcm = normalizePcm16(upsampled);
  } else {
    throw audioError("WAV must be G.711 mu-law 16 kHz mono or legacy PCM16 8 kHz mono", 415);
  }
  return writePcmWav(pcm, 16000);
}
