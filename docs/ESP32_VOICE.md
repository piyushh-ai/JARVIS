# ESP32 Voice Control — Firmware v1.5.0

## Overview

The ESP32 uploads raw 8 kHz mono PCM16 WAV clips to the authenticated voice endpoint. Clips may be 0.5–4 seconds and up to 256 KB. Gemini receives the audio once and returns structured JSON containing the transcript, wake-word decision, intent, and catalog-resolved actions. Device commands go directly through JARVIS's existing Home-scoped command queue; informational questions use the existing assistant service.

There is no spoken PIN. The wake word is an attention gate, not speaker authentication or proof of identity. The ESP32 controller token authenticates the hardware and voice actions are attributed to the controller's registered Home owner. Do not use voice control for locks, alarms, or safety-critical actuators.

## Environment variables

Configure these server-only variables in Vercel Project Settings → Environment Variables:

- `GEMINI_API_KEY` — required for audio understanding.
- `ESP32_VOICE_WAKE_WORD` — optional; defaults to `jarvis`.
- `ESP32_VOICE_REQUIRE_WAKE_WORD` — optional; defaults to `true`. Set to `false` only if commands without the wake word are intentionally allowed.
- `GEMINI_VOICE_MODEL` — optional primary model override; defaults to `gemini-2.5-flash-lite`.
- `GEMINI_VOICE_FALLBACK_MODEL` — optional Gemini-only fallback; defaults to `gemini-2.5-flash`.

Remove the obsolete voice PIN variable from Vercel. No PIN is spoken, parsed, stored, or sent to Gemini.

## Audio request

`POST /api/esp32/voice`

Headers:

- `X-Device-Id: ESP32-001`
- `Authorization: Bearer <controller-token>`
- `Content-Type: audio/wav`

Body: raw RIFF/WAVE bytes containing PCM16 mono audio. The server validates the RIFF/WAVE structure, PCM encoding, channel count, bit depth, and data chunk length. Maximum body size is 256 KB. No fixed clip duration is required.

The endpoint retains the existing ESP32 controller authentication. It applies an additional per-controller limit of approximately 30 voice uploads per minute.

## Wake-word behavior

The default wake word is `jarvis`. The parser tolerates common recognition variants including “jarvish”, “jarwis”, “jarvas”, “javis”, “jarviss”, and “जार्विस”. The wake word is removed from the command transcript before processing.

When wake-word enforcement is enabled and no wake word is detected, the endpoint returns HTTP 200 with:

- `execution: "ignored"`
- `reason: "wake_word_missing"`
- an empty `reply`
- no device/scene execution and no conversation-memory write

Unintelligible audio or background noise also returns HTTP 200 with `execution: "ignored"` and `reason: "not_understood"`. Ambiguous targets return `execution: "needs_clarification"` with a short question. Clear commands return `execution: "processed"` after commands have been queued.

## Response contract

Successful responses preserve this firmware-facing shape:

```json
{
  "success": true,
  "data": {
    "transcript": "Jarvis, main light on kar do",
    "execution": "processed",
    "reason": "command_queued",
    "reply": "Main Light on kar di.",
    "serverMs": 740,
    "timingsMs": {
      "parseAudio": 1,
      "db": 35,
      "gemini": 520,
      "execute": 80
    }
  }
}
```

Timing values above are illustrative, not measured performance guarantees. `serverMs` is the actual server-side elapsed time for the request. The relay changes physically only after the ESP32 polls the command queue, applies the relay output, and sends its ACK.

## Test sequence

1. Confirm the ESP32 sends the controller ID and Bearer token exactly as before.
2. Upload “Jarvis, main light on kar do”. Confirm `execution: "processed"`, a queued response, and a pending command on the ESP32.
3. Upload “main light on kar do” without the wake word. With the default configuration it must return HTTP 200, `execution: "ignored"`, and `reason: "wake_word_missing"`; no command should be queued.
4. Test a quiet/distant command and a noisy clip containing no clear speech. The latter must be ignored rather than guessed.
5. Test a generic ambiguous target when multiple matching devices exist. The response must be `needs_clarification`.
6. Confirm the dashboard's reported state changes only after a successful hardware ACK.

## Troubleshooting

- HTTP 401: controller ID/token mismatch or revoked token. Do not share the Bearer token.
- HTTP 413: clip exceeds 256 KB.
- HTTP 415 / 400: verify `Content-Type: audio/wav`, RIFF/WAVE header, PCM16 mono format, and chunk lengths.
- HTTP 429: respect the response message's `Retry after Ns` interval. The additional voice limit is 30 requests/minute per controller.
- Empty or inaccurate transcript: check INMP441 wiring, mic placement, clipping, and firmware capture gain/normalization.
- Command queued but no physical change: inspect pending-command polling, relay wiring/polarity, and ESP32 ACK logs.

## Privacy boundary

Raw audio is processed in memory and sent to Gemini for understanding. Ignored audio is not written to assistant conversation memory. The wake word does not identify the speaker; controller authentication continues to identify the hardware, and actions remain scoped to the controller's linked Home.
