# ESP32 Voice Control — Microphone to Assistant

## What works in this phase

The ESP32 captures a short INMP441 microphone clip, uploads it to the authenticated voice endpoint, Gemini transcribes Hindi/Hinglish/English, and the backend can pass a PIN-authorized command to the existing JARVIS assistant. The assistant uses the existing Home-scoped tools and command queue; relay state is still confirmed only by ESP32 ACK.

The endpoint returns the transcript, assistant reply, execution metadata, and tool summaries. The firmware prints those results to Serial Monitor. There is no audio playback in this phase because the amplifier and speaker are not connected.

## Hardware and firmware

- Board: ESP32 DevKit V1 / ESP32-WROOM-32 (no PSRAM assumed).
- Microphone: INMP441, VDD -> 3V3, GND -> GND, BCLK -> GPIO26, WS -> GPIO25, SD -> GPIO33, L/R -> GND.
- Existing relay mapping is preserved: IN1 -> GPIO13, IN2 -> GPIO12, IN3 -> GPIO14, IN4 -> GPIO15; active LOW.
- I2S capture: 8 kHz mono, 32-bit I2S slot converted to PCM16 WAV, 3-second clip. This keeps the audio buffer around 48 KB instead of allocating a 96 KB 16 kHz/3-second buffer in internal DRAM.
- Firmware keeps a 500 ms circular PCM16 pre-roll and requires three consecutive audio blocks above the provisional RMS threshold before upload. The pre-roll is prepended to the recording to reduce clipped first syllables. This is still a sustained sound gate, not wake-word recognition.
- The provisional RMS threshold is currently 450 and requires three consecutive loud audio blocks. This value is based on the supplied Serial log and must still be calibrated in the actual room. A loud sustained noise can still trigger it; it is not a true wake-word detector or robust VAD.
- The capture/upload is blocking for a few seconds; heartbeat and command polling pause during capture and network upload.
- Firmware cooldown is 30 seconds. Tune `MIC_VOICE_THRESHOLD` using actual Serial RMS readings. If it false-triggers, raise it; if normal speech does not trigger, lower it gradually.

## Configure the voice PIN

Set `ESP32_VOICE_PIN` in Vercel Project Settings -> Environment Variables and in local `.env.local` if testing locally. Use your own random 6–8 digit value. Do not commit it or send it in chat.

The spoken phrase must contain all three parts:

1. Wake phrase: “Jarvis”
2. The word “PIN” followed by the configured digits
3. The command

Example: **“Jarvis, PIN 123456, main light on kar do.”**

The backend removes the PIN phrase before sending the remaining command to the assistant. It does not store the raw audio or PIN in application logs or conversation messages. Gemini receives the audio for transcription, so the spoken PIN is included in that provider request.

If the PIN is missing or incorrect, the transcript is returned but no assistant command is executed. PIN attempts are rate-limited. The PIN is a prototype second factor, not speaker recognition: anyone who knows or overhears it may use it. Commands are attributed to the controller's registered Home owner. Do not use this voice PIN mechanism for locks, alarms, or safety-critical devices.

## Endpoint

`POST /api/esp32/voice`

Headers:
- `X-Device-Id: ESP32-001`
- `Authorization: Bearer <controller-token>`
- `Content-Type: audio/wav`

Body: raw WAV bytes, not JSON or multipart. Maximum request size: 384 KB.

## Expected responses

- `execution: "not_executed"` with a reason when speech is empty, the wake phrase is missing, the PIN is missing/invalid, or voice PIN configuration is absent.
- `execution: "processed"` when the assistant has processed the authorized transcript. Check `toolExecutions` for queued/partial/clarification/failure outcomes. “Processed” does not mean the relay has already changed.
- The dashboard's reported state changes only after the ESP32 applies the queued relay command and sends its ACK.

## Test sequence

1. First test relays from the dashboard manually with mains disconnected; confirm Serial shows command received, relay channel, and ACK success.
2. Open Arduino Serial Monitor at 115200 baud. Confirm Wi-Fi, NTP, HTTPS health, heartbeat, and microphone initialization.
3. Watch quiet-room and speech RMS. The current starting threshold is 450; adjust only in small steps after observing real speech. A trigger now requires three consecutive loud blocks, and the WAV includes 500 ms pre-roll. Avoid repeated testing faster than the 30-second cooldown.
4. Confirm the firmware prints a transcript. If it prints unrelated words, improve mic placement and threshold before enabling command tests.
5. Configure the PIN in Vercel and redeploy. Speak the exact wake phrase + PIN + a single device command.
6. Confirm Serial shows `execution: processed`, a JARVIS reply, and a tool execution summary. Then wait for ESP32 polling and ACK; verify the dashboard reported state.
7. Speak without the PIN or with a wrong PIN. It must return `not_executed` and no relay command should appear.
8. Test an ambiguous command such as “Jarvis, PIN 123456, light on kar do” if multiple lights exist. JARVIS should ask for clarification instead of guessing.

## Troubleshooting

- HTTP 401: controller ID/token mismatch or revoked token. Never paste the bearer token into logs or chat.
- HTTP 429 with `Retry after ...s`: check that the deployed voice route includes the shared-auth rate-limit fix. The voice route must call `authenticateEsp32Request(request)` with its normal shared hardware limit, not override it to 8/minute; command polling, heartbeat, and voice requests share the auth bucket. The separate voice-specific limiter remains 8 uploads/minute. Wait for the stated retry window after deploying the fix.
- Empty or inaccurate transcript: mic channel/pin wiring, placement, RMS threshold, and clip timing need checking.
- `voice_pin_required_or_invalid`: transcript did not contain the wake phrase and numeric PIN in the required format.
- Assistant reply says clarification: provide the exact device name (e.g. “Main Light”).
- Assistant queues a command but no physical change: inspect ESP32 pending poll, relay wiring/polarity, and ACK logs.
- Build memory error: this sketch targets ESP32-WROOM-32 without PSRAM; keep the 8 kHz / 3-second PCM buffer size unless memory is measured again.

## Security and privacy boundary

The ESP32 bearer token authenticates the controller, not the speaker. This prototype requires a spoken PIN as a second factor and attributes the action to the controller's registered Home owner. It is not speaker biometrics and it is not suitable for high-risk actuators. Raw audio is held in memory for transcription and is not saved to MongoDB or disk. The speech provider receives the audio to perform transcription.


## Continuous microphone task

Microphone I2S sampling runs in a dedicated FreeRTOS task on core 1, independent of relay polling and heartbeat requests in the main loop. Voice uploads use a separate TLS/HTTP client to avoid concurrent access to the main HTTP client.
