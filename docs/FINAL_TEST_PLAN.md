# JARVIS Final Phase-1 Test Plan

This checklist verifies the existing dashboard + MongoDB + ESP32 relay queue + INMP441 transcription + PIN-gated voice command path. It deliberately separates software checks from physical 220V load checks.

## 0. Before testing

- [ ] Pull the feature branch and install dependencies with `npm install`.
- [ ] Confirm `.env.local` has MongoDB, session, ESP32 token pepper, at least one LLM provider key, and Gemini STT key.
- [ ] Set a private random `ESP32_VOICE_PIN` (6–8 digits) in local env / Vercel environment. Never commit it.
- [ ] Confirm the ESP32 controller is active and linked to the intended Home owner.
- [ ] Keep all 220V mains disconnected during bench tests. Use relay-board indicator LEDs or a low-voltage test load only.

## 1. Software validation

Run locally:

```bash
npm run lint
npm run build
npm run start
```

Then verify:

- [ ] `GET /api/health` returns HTTP 200 and database connected.
- [ ] Signed-in dashboard loads; signed-out dashboard redirects to login.
- [ ] Existing manual device toggle queues a command.
- [ ] ESP32 ACK changes `reportedState`; merely queueing a command must not change it.
- [ ] Existing assistant text chat can list devices and queue a single device command.
- [ ] Ambiguous “light on” asks for clarification when more than one light matches.

## 2. ESP32 relay-only validation

- [ ] Select **ESP32 Dev Module**, board ESP32-WROOM-32, correct COM port, Serial Monitor 115200.
- [ ] In the sketch, fill only local `WIFI_SSID` and `WIFI_PASSWORD` placeholders. Do not commit them.
- [ ] Confirm NVS token is already provisioned; do not print or share the token.
- [ ] Confirm relay mapping remains IN1 GPIO13, IN2 GPIO12, IN3 GPIO14, IN4 GPIO15, active LOW.
- [ ] Power ESP32 and relay board from a suitable regulated supply; do not power relay coils from the ESP32 3V3 pin.
- [ ] Confirm Wi-Fi, NTP, HTTPS health, heartbeat, boot status, pending command polling, and ACK are successful.
- [ ] Toggle one channel from dashboard and verify the matching relay indicator LED changes, then returns OFF.
- [ ] Repeat for each mapped channel before connecting any mains load.

## 3. Microphone validation

- [ ] INMP441 VDD -> 3V3, GND -> GND, BCLK -> GPIO26, WS -> GPIO25, SD -> GPIO33, L/R -> GND.
- [ ] Confirm Serial says microphone initialized at 8 kHz.
- [ ] Observe RMS at quiet room baseline, normal speech, and close speech.
- [ ] Adjust `MIC_VOICE_THRESHOLD` in small increments: raise it if background noise triggers; lower it if normal speech never triggers.
- [ ] Respect the 30-second firmware upload cooldown while calibrating.
- [ ] First validate transcript accuracy only; do not infer command execution from an STT HTTP 200.

## 4. Voice command validation

Required Vercel/local environment:
- `GEMINI_API_KEY` for audio transcription.
- At least one configured assistant LLM provider key.
- `ESP32_VOICE_PIN` set to a private 6–8 digit value.

Speak this exact pattern, substituting your own PIN:

**“Jarvis, PIN 123456, Main Light on kar do.”**

- [ ] Serial transcript contains “Jarvis”, “PIN”, the correct numeric PIN, and the intended device command.
- [ ] Serial shows `execution: processed` and a short JARVIS reply.
- [ ] Tool execution summary indicates queued/completed/clarification/failure honestly.
- [ ] ESP32 receives the queued command on its next poll, drives the mapped relay, and sends ACK.
- [ ] Dashboard `reportedState` changes only after ACK.
- [ ] The returned transcript shows the PIN redacted.
- [ ] Without the PIN, with a wrong PIN, or without the JARVIS wake phrase, execution remains `not_executed`.
- [ ] If two lights match, JARVIS asks which light rather than guessing.
- [ ] After five invalid PIN attempts in the rate-limit window, voice PIN attempts are throttled.

## 5. Failure and recovery validation

- [ ] Turn Wi-Fi off briefly; ESP32 should not claim commands succeeded without ACK.
- [ ] Restore Wi-Fi; verify reconnect, health check, heartbeat, and command polling recover.
- [ ] Restart ESP32; relays initialize OFF and boot status syncs.
- [ ] Temporarily use an incorrect STT key only in a safe local test; route must return an error without relay action.
- [ ] Test a quiet/empty recording; no assistant tool should execute.
- [ ] Test a noisy trigger; if transcription is wrong, tune placement/threshold before allowing voice commands in daily use.

## 6. Physical load safety

Only after low-voltage relay tests pass:
- [ ] Disconnect power before touching any mains wiring.
- [ ] Have a qualified electrician verify relay contact ratings, enclosure, fusing, strain relief, insulation spacing, and the 220V load wiring.
- [ ] Never connect 220V to ESP32 GPIO, breadboard, or microphone wiring.
- [ ] Do not use the PIN-gated voice prototype for door locks, alarms, heaters, or other safety-critical actuators.

## 7. Known limits

- RMS threshold is not wake-word detection or robust voice activity detection; loud noise can trigger capture and first syllables may be clipped.
- 8 kHz mono is a memory-conscious prototype choice for ESP32-WROOM-32 without PSRAM.
- Capture and upload block the main loop for several seconds, so heartbeat and command polling pause briefly.
- No amplifier/speaker TTS is available in this hardware setup. Replies are visible in Serial Monitor / API response / existing dashboard.
- Arduino compilation and physical mic/relay voice E2E must be verified on the actual board; a successful GitHub commit is not a hardware test.
