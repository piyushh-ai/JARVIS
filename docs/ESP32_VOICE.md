# ESP32 Voice API — Phase 1 (Speech-to-Text)

## Endpoint

`POST /api/esp32/voice`

This endpoint accepts a short binary audio recording from an authenticated ESP32 and returns a Hindi/Hinglish/English transcript using the configured Gemini API key.

## Authentication

Use the same machine credentials as the other ESP32 endpoints:

- `X-Device-Id: ESP32-001`
- `Authorization: Bearer <controller-token>`

The controller must be active, linked to a Home, and linked to a valid Home owner. The route verifies that owner membership before calling Gemini.

## Audio request

Send the audio bytes as the raw HTTP request body (not JSON or multipart form data).

Supported content types:

- `audio/wav`
- `audio/mpeg` / `audio/mp3`
- `audio/ogg`
- `audio/webm`
- `audio/aac`
- `audio/pcm;rate=16000` (16 kHz PCM)

Maximum request size: 384 KB. For the first ESP32 test, use a short 2–4 second, mono, 16 kHz recording. WAV is recommended because it carries its sample format in the header.

## Example response

```json
{
  "success": true,
  "message": "Audio transcribed",
  "data": {
    "esp32DeviceId": "ESP32-001",
    "transcript": "JARVIS lights on karo",
    "model": "gemini-2.5-flash",
    "detectedSpeech": true,
    "execution": "not_executed"
  }
}
```

## ESP32 firmware capture test

The companion sketch at `aurduino/sketch_nov11a/sketch_nov11a.ino` now includes a first-pass sound-triggered capture/upload path:

- INMP441 is sampled at 16 kHz, mono.
- When the measured RMS reaches the provisional `MIC_VOICE_THRESHOLD` (default 180), the firmware records a 3-second clip.
- Samples are converted to 16-bit PCM and wrapped in a WAV header.
- WAV bytes are sent directly to this endpoint with the existing device ID and NVS bearer token.
- The transcript is printed to Serial Monitor. A 10-second cooldown limits repeated uploads.

This is a prototype sound-level trigger, **not a wake-word detector or speech VAD**. Loud noise can trigger a recording, and a quiet/soft voice may not. Tune the threshold from actual Serial RMS readings. Audio capture/upload temporarily blocks the main loop, so heartbeat and command polling pause during the short recording and request.

Before uploading this sketch, replace the Wi-Fi placeholders locally with your own credentials. Do not commit Wi-Fi passwords or device tokens.

## Security boundary — important

This is deliberately a **transcription-only** milestone. An ESP32 bearer token proves that the registered controller sent the request; it does not prove who spoke near the microphone. The endpoint therefore does not call `runAssistantTurn`, execute tools, enqueue relay commands, or claim the speaker is the Home owner.

Before voice-triggered device control is enabled, add a real human identity step (for example, enrolled speaker verification plus a PIN/phone-confirmation fallback) and pass only the verified user ID into `runAssistantTurn({ homeId, userId, message, inputMode: "voice" })`.

## Limits and privacy

- Audio is held in request memory only; it is not saved to MongoDB, disk, or application logs.
- Maximum audio payload: 384 KB.
- Per-controller voice route limit: 8 requests per minute.
- Gemini timeout: 20 seconds.
- The route returns the transcript only; no audio playback/TTS is included in this phase.
