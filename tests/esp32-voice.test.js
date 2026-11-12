import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { decodeMuLawSample, normalizePcm16, parseAndPrepareVoiceWav } from "../src/services/ai/esp32VoiceAudio.js";
import {
  findWakeWord, parseFollowupAction, isVoiceSessionActive,
  toInlineVoiceCommands, makeVoiceResponseData, hasConflictingExplicitActions,
} from "../src/services/ai/esp32VoiceLogic.js";

function wav({ encoding = 7, sampleRate = 16000, bits = 8, samples = Buffer.from([0xff, 0x7f, 0x00, 0x80]), codec = "mulaw" } = {}) {
  const fmt = Buffer.alloc(24);
  fmt.write("fmt ", 0); fmt.writeUInt32LE(16, 4); fmt.writeUInt16LE(encoding, 8);
  fmt.writeUInt16LE(1, 10); fmt.writeUInt32LE(sampleRate, 12);
  fmt.writeUInt32LE(sampleRate * (bits / 8), 16); fmt.writeUInt16LE(bits / 8, 20);
  fmt.writeUInt16LE(bits, 22);
  const data = Buffer.alloc(8 + samples.length + (samples.length & 1));
  data.write("data", 0); data.writeUInt32LE(samples.length, 4); samples.copy(data, 8);
  const body = Buffer.concat([Buffer.from("WAVE"), fmt, data]);
  const header = Buffer.alloc(8); header.write("RIFF"); header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

test("G.711 mu-law decoder maps silence and full-scale codes", () => {
  assert.equal(decodeMuLawSample(0xff), 0);
  assert.equal(decodeMuLawSample(0x7f), 0);
  assert.ok(decodeMuLawSample(0x00) < -30000);
  assert.ok(decodeMuLawSample(0x80) > 30000);
});

test("PCM normalization removes DC and targets approximately -3 dBFS without clipping", () => {
  const normalized = normalizePcm16(new Int16Array([1100, 1200, 1300, 1400, 1500]));
  const peak = Math.max(...Array.from(normalized, (v) => Math.abs(v)));
  assert.ok(peak <= 23000);
  assert.ok(peak >= 22000);
  const centeredMean = normalized.reduce((a, b) => a + b, 0) / normalized.length;
  assert.ok(Math.abs(centeredMean) <= 1);
});

test("v1.6 mu-law WAV is converted to 16 kHz PCM16 WAV", () => {
  const converted = parseAndPrepareVoiceWav(wav(), "mulaw");
  assert.equal(converted.toString("ascii", 0, 4), "RIFF");
  assert.equal(converted.readUInt16LE(20), 1);
  assert.equal(converted.readUInt16LE(22), 1);
  assert.equal(converted.readUInt32LE(24), 16000);
  assert.equal(converted.readUInt16LE(34), 16);
});

test("legacy 8 kHz PCM16 WAV remains accepted", () => {
  const pcm = Buffer.alloc(8);
  pcm.writeInt16LE(1000, 0); pcm.writeInt16LE(2000, 2); pcm.writeInt16LE(-1000, 4); pcm.writeInt16LE(-2000, 6);
  const converted = parseAndPrepareVoiceWav(wav({ encoding: 1, sampleRate: 8000, bits: 16, samples: pcm, codec: "" }), "");
  assert.equal(converted.readUInt32LE(24), 16000);
  assert.equal(converted.readUInt16LE(34), 16);
});

test("wake-word variants are recognized and stripped", () => {
  for (const word of ["Jarvis", "Jarvish", "Jarwis", "Jarvas", "Javis", "Jarviss", "जार्विस"]) {
    const found = findWakeWord(`${word}, light chalu karo`);
    assert.equal(found.heard, true, word);
    assert.match(found.command, /light chalu karo/);
  }
});

test("clarification follow-ups parse only short explicit ON/OFF answers", () => {
  assert.equal(parseFollowupAction("on"), "on");
  assert.equal(parseFollowupAction("band kar do"), null);
  assert.equal(parseFollowupAction("band"), "off");
  assert.equal(parseFollowupAction("bujhao"), "off");
  assert.equal(parseFollowupAction("maybe on"), null);
  assert.equal(hasConflictingExplicitActions("light on ya off"), true);
});

test("voice session continues until idle window expires", () => {
  const now = new Date("2026-11-12T12:00:00.000Z");
  assert.equal(isVoiceSessionActive(new Date(now.getTime() - 14 * 60000), now, 15), true);
  assert.equal(isVoiceSessionActive(new Date(now.getTime() - 16 * 60000), now, 15), false);
});

test("inline command response exposes only the v1.6 command contract", () => {
  const commands = toInlineVoiceCommands([{
    commandId: "cmd_1", relayNumber: 2, action: "on", ttlRemainingMs: 12000, deviceId: "private",
  }]);
  assert.deepEqual(commands, [{ commandId: "cmd_1", relayNumber: 2, action: "on", ttlRemainingMs: 12000 }]);
});

test("voice response retains the existing response data shape and adds commands", () => {
  const data = makeVoiceResponseData({ esp32DeviceId: "ESP32-001" }, {
    transcript: "Jarvis light on", execution: "processed", reason: "command_queued",
    reply: "Light on kar di.", commands: [{ commandId: "cmd_1", relayNumber: 2, action: "on", ttlRemainingMs: 10000 }],
  }, 840, { decode: 1, auth: 12, catalog: 20, gemini: 600, execute: 80, total: 840 });
  assert.equal(data.execution, "processed");
  assert.equal(data.serverMs, 840);
  assert.equal(data.commands[0].commandId, "cmd_1");
  assert.equal(data.timingsMs.total, 840);
});

test("voice route atomically claims queued commands via the same pending-command service", async () => {
  const route = await readFile(new URL("../src/app/api/esp32/voice/route.js", import.meta.url), "utf8");
  const commandService = await readFile(new URL("../src/services/commandService.js", import.meta.url), "utf8");
  assert.match(route, /claimPendingCommands\(\{ esp32DeviceId: controller\.esp32DeviceId, limit: 16 \}\)/);
  assert.match(commandService, /Command\.findOneAndUpdate\(/);
  assert.match(commandService, /status: "processing"/);
  assert.match(commandService, /processingUntil: leaseUntil/);
});
