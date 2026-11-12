# ESP32 Voice Control — Firmware v1.6.0

## Overview

Firmware v1.6.0 sends a RIFF/WAVE G.711 mu-law (format tag 7), mono, 16 kHz, 8-bit payload to `POST /api/esp32/voice`, with `X-Audio-Codec: mulaw`. The server decodes it to PCM16, removes DC offset, normalizes quiet audio toward a 23000 peak (about -3 dBFS, gain capped at 40x), and sends a 16 kHz mono PCM16 WAV to Gemini. The previous firmware format—8 kHz mono PCM16 WAV—is still accepted and resampled to 16 kHz.

The audio conversion is typed-array/buffer work only; it does not load an audio-processing library. The endpoint uses one Gemini call for transcription, intent, catalog grounding, and session-aware answers. It keeps the existing Home-scoped command queue and atomically claims commands for immediate delivery in the voice response.

The wake word is an attention gate, not speaker authentication or proof of identity. The ESP32 controller token authenticates the hardware and voice actions are attributed to the controller's registered Home owner. Do not use voice control for locks, alarms, or safety-critical actuators.

## Vercel region and database connection

- Set `preferredRegion = "bom1"` in the route when the MongoDB Atlas cluster is in Mumbai. Change it to the region nearest the actual Atlas cluster.
- In Vercel, open **Project → Settings → Functions → Region** and confirm it matches the Atlas cluster's region. The route's preferred region is a deployment hint; confirm the project/function region setting too.
- `src/lib/db/connect.js` caches the Mongoose connection and in-flight connection promise on `globalThis`, so warm serverless instances reuse the connection.
- This project has `cacheComponents: true`. Next.js rejects an explicit `runtime = "nodejs"` segment export with that setting; Node.js is already the default runtime. Keep the default and do not add that export unless the Next.js configuration changes.

## Environment variables

Configure these server-only values in Vercel Project Settings → Environment Variables:

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | — | Required for audio understanding |
| `GEMINI_VOICE_MODEL` | `gemini-2.5-flash-lite` | Primary audio parser model |
| `GEMINI_VOICE_FALLBACK_MODEL` | `gemini-2.5-flash` | Gemini-only fallback |
| `ESP32_VOICE_WAKE_WORD` | `jarvis` | Configured wake word |
| `ESP32_VOICE_REQUIRE_WAKE_WORD` | `true` | Require wake word except a recent clarification follow-up |
| `ESP32_VOICE_SESSION_IDLE_MIN` | `15` | Start a new voice session after this many idle minutes |
| `ESP32_TOKEN_PEPPER` | existing secret | Existing controller-token hashing pepper |
| `MONGODB_URI` | — | Existing Atlas connection string |

The controller authentication lookup is cached in module memory for up to 15 seconds by controller ID + token hash. Revocation and token rotation therefore take effect on warm instances within at most that cache window (usually sooner after instance eviction). The existing IP/device rate limits still run on every request.

## Audio request

`POST /api/esp32/voice`

Headers:

- `X-Device-Id: ESP32-001`
- `Authorization: Bearer <controller-token>`
- `Content-Type: audio/wav`
- `X-Audio-Codec: mulaw` (required for format tag 7; omit for legacy PCM16)

Firmware v1.6.0 body:

- RIFF/WAVE
- `fmt ` chunk length 16
- format tag 7 (G.711 mu-law)
- mono, 16000 Hz, 8 bits
- no `fact` chunk required
- data chunk up to approximately 64 KB

Legacy firmware remains supported:

- PCM format tag 1
- mono, 8000 Hz, 16 bits
- `X-Audio-Codec` omitted or set to a non-mulaw value

The server accepts up to 256 KB, validates RIFF/chunk boundaries, and rejects format/header mismatches. No fixed clip duration is required.

## Wake word, intent, and clarification

The default wake word is `jarvis`. Common variants are accepted: “jarvish”, “jarwis”, “jarvas”, “javis”, “jarviss”, and “जार्विस”. The wake word is stripped from the saved transcript and command text.

The parser understands Hinglish/Hindi/English. ON phrases include “on”, “chalu”, “start”, “jala do”, “jalao”, and “kholo”. OFF phrases include “off”, “band”, “stop”, “bujha do”, and “bujhao”. The prompt explicitly tells Gemini to distinguish the final consonant in “on” versus “off”. When a clear single action phrase is present, the server also applies that explicit polarity deterministically. If both polarities are present, or Gemini marks the action/target uncertain, the server does not execute and returns `execution: "needs_clarification"` (typically “On karun ya off?”).

A clarification target is retained for 30 seconds. A short next utterance such as “on”, “band”, or “band kar do” can answer it without repeating the wake word. The follow-up is still transcribed once by Gemini; the pending target/action are then applied deterministically.

## Conversation memory

Voice sessions are isolated by `(userId, homeId, source="esp32-voice", controllerId)`. A new turn continues the latest session while its last message is within `ESP32_VOICE_SESSION_IDLE_MIN` (default 15 minutes); after that idle window a new session is created.

Each processed turn stores the wake-word-stripped user transcript, JARVIS reply, and executed actions. Ignored/empty audio is not stored. Gemini receives:

1. The first two turns, pinned separately from the rolling message window.
2. The rolling text summary.
3. The latest 12 turns verbatim (each message bounded to keep prompt size controlled).

After the session grows beyond roughly 16 turns (32 stored messages), a cheap text-only Gemini summary refresh folds older turns incrementally in `after()`. The voice response does not wait for conversation persistence or summary refresh. Cross-session long-term memory and semantic recall are phase 2; no LangChain or vector database is added to this request path.

Questions such as “kaun si light on hai?” and “mera pehla sawal kya tha?” are answered by the same audio+catalog+context Gemini call. The legacy `/assistant` text-chat route is not changed.

## Inline command delivery and ACK

After the existing device/scene service queues commands, the voice route calls the same atomic `claimPendingCommands` lease function used by `GET /api/esp32/commands/pending`. Claimed commands are returned immediately in `data.commands`:

```json
{
  "commandId": "cmd_example",
  "relayNumber": 2,
  "action": "on",
  "ttlRemainingMs": 12000
}
```

The ESP32 should execute these commands immediately and send the existing ACK request unchanged. The claim increments the attempt count and sets the normal processing lease. If a command is not executed/ACKed, lease expiry allows the existing pending-command polling path to retry it. The normal pending endpoint remains available as fallback.

## Response contract

The existing response wrapper and execution names are retained. Example:

```json
{
  "success": true,
  "message": "Voice request processed",
  "data": {
    "esp32DeviceId": "ESP32-001",
    "transcript": "Jarvis, main light chalu karo",
    "execution": "processed",
    "reason": "command_queued",
    "reply": "Main Light on kar di.",
    "commands": [
      {
        "commandId": "cmd_example",
        "relayNumber": 2,
        "action": "on",
        "ttlRemainingMs": 12000
      }
    ],
    "serverMs": 840,
    "timingsMs": {
      "decode": 2,
      "auth": 18,
      "catalog": 25,
      "gemini": 600,
      "execute": 90,
      "total": 840
    }
  }
}
```

Timing values above are illustrative, not measured. Actual values are logged per request; `serverMs` and `timingsMs.total` are measured elapsed server time. The response returns after the command claim; conversation writes and summary refresh are scheduled in `after()`.

## Test sequence

Run:

```bash
npm test
npm run lint
npm run build
```

Hardware acceptance sequence:

1. “Jarvis, light chalu karo” → `processed` and at least one inline command; execute immediately without waiting for the next poll, then ACK as before.
2. “Jarvis, hello kaise ho” then “Jarvis, mera pehla sawal kya tha” → second answer recalls the first question from the same session.
3. Wait longer than 15 minutes, speak again → a new session begins.
4. Cause an on/off ambiguity → `needs_clarification`, no command queued; reply “on” or “band kar do” within 30 seconds → pending target executes without wake word.
5. Upload legacy PCM16 8 kHz WAV → accepted and converted.
6. Test quiet/far mu-law audio and verify the transcript in Vercel logs.

## Troubleshooting

- HTTP 401: controller ID/token mismatch or revoked controller. Never share the Bearer token.
- HTTP 400/415: verify RIFF/WAVE header, format tag, sample rate, channel count, bit depth, data chunk length, and `X-Audio-Codec`.
- HTTP 413: clip exceeds 256 KB.
- HTTP 429: respect the existing rate-limit response and retry interval.
- Incorrect on/off: inspect the logged transcript and decision; compare `GEMINI_VOICE_MODEL=gemini-2.5-flash-lite` against `gemini-2.5-flash` in Vercel.
- Command queued but not executed: check inline `data.commands`, relay number, ACK logs, and then normal pending polling/lease expiry.
- Slow requests: compare logged `auth`, `catalog`, `decode`, `gemini`, `execute`, and `total`. A sub-1.5-second total is a target, not a guaranteed SLA; Gemini network/model latency is outside the server's control.

## Privacy boundary

Audio is processed in memory and sent to Gemini for understanding. Ignored audio is not saved to voice conversation memory. Voice sessions are scoped to the authenticated controller, owner, and Home. The wake word does not identify the speaker.
