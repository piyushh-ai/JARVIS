import { ServiceError } from "@/lib/utils/apiResponse";

const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_AUDIO_BYTES = 384 * 1024;

const ALLOWED_AUDIO_TYPES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/webm",
  "audio/aac",
  "audio/pcm;rate=16000",
]);

function normalizeMimeType(value) {
  return String(value || "")
    .split(";")
    .map((part) => part.trim().toLowerCase())
    .join(";");
}

/**
 * Transcribes a short audio buffer with Gemini. Audio is kept in memory and is
 * never written to disk or logged.
 */
export async function transcribeAudioBuffer(audioBuffer, contentType) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new ServiceError("Speech service is not configured (GEMINI_API_KEY)", 503);
  }

  if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
    throw new ServiceError("Audio payload is empty", 400);
  }
  if (audioBuffer.length > MAX_AUDIO_BYTES) {
    throw new ServiceError("Audio payload exceeds the 384 KB limit", 413);
  }

  const mimeType = normalizeMimeType(contentType);
  if (!ALLOWED_AUDIO_TYPES.has(mimeType)) {
    throw new ServiceError(
      "Unsupported audio format. Send WAV, MP3, OGG, WEBM, AAC, or 16 kHz PCM.",
      415
    );
  }

  const model = process.env.GEMINI_STT_MODEL?.trim() || DEFAULT_MODEL;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const audioBase64 = audioBuffer.toString("base64");

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  "Transcribe the spoken audio exactly. The speaker may use Hindi, Hinglish, or English. " +
                  "Preserve the original language and wording. Return only the transcript, with no explanation. " +
                  "If there is no intelligible speech, return an empty transcript.",
              },
              {
                inlineData: {
                  mimeType,
                  data: audioBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 256,
        },
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw new ServiceError("Speech transcription timed out. Try a shorter recording.", 504);
    }
    throw new ServiceError("Could not reach the speech transcription service", 502);
  }

  if (!response.ok) {
    // Do not return upstream response bodies because they can contain request metadata.
    if (response.status === 429) {
      throw new ServiceError("Speech service rate limit reached. Try again shortly.", 429);
    }
    if (response.status === 401 || response.status === 403) {
      throw new ServiceError("Gemini rejected the configured API key or model access", 502);
    }
    throw new ServiceError("Speech transcription provider returned an error", 502);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ServiceError("Speech provider returned an invalid response", 502);
  }

  const transcript = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();

  if (!transcript) {
    return {
      transcript: "",
      model,
      detectedSpeech: false,
    };
  }

  return {
    transcript: transcript.slice(0, 1500),
    model,
    detectedSpeech: true,
  };
}
