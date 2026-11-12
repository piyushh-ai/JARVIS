import { ServiceError } from "@/lib/utils/apiResponse";

const MAX_AUDIO_BYTES = 384 * 1024;
const ALLOWED_AUDIO_TYPES = new Set(["audio/wav","audio/mpeg","audio/mp3","audio/aiff","audio/aac","audio/ogg","audio/flac","audio/pcm;rate=16000"]);
function normalizeMimeType(value){return String(value||"").split(";").map(p=>p.trim().toLowerCase()).join(";");}

/** Transcribe a short audio buffer with Groq Whisper. Audio stays in memory. */
export async function transcribeAudioBuffer(audioBuffer,contentType){
 const apiKey=process.env.GROQ_API_KEY?.trim();if(!apiKey)throw new ServiceError("Speech service is not configured (GROQ_API_KEY)",503);
 if(!Buffer.isBuffer(audioBuffer)||!audioBuffer.length)throw new ServiceError("Audio payload is empty",400);
 if(audioBuffer.length>MAX_AUDIO_BYTES)throw new ServiceError("Audio payload exceeds the 384 KB limit",413);
 const mime=normalizeMimeType(contentType);if(!ALLOWED_AUDIO_TYPES.has(mime))throw new ServiceError("Unsupported audio format. Send WAV, MP3, AIFF, AAC, OGG, FLAC, or 16 kHz PCM.",415);
 const model=process.env.GROQ_STT_MODEL?.trim()||"whisper-large-v3",language=process.env.GROQ_STT_LANGUAGE?.trim()||"en";
 const form=new FormData();form.append("file",new Blob([audioBuffer],{type:mime.split(";")[0]}),"jarvis-audio.wav");form.append("model",model);form.append("language",language);form.append("temperature","0");form.append("response_format","json");
 let response;try{response=await fetch("https://api.groq.com/openai/v1/audio/transcriptions",{method:"POST",headers:{authorization:"Bearer "+apiKey},body:form,signal:AbortSignal.timeout(6000)});}catch(error){if(error?.name==="TimeoutError"||error?.name==="AbortError")throw new ServiceError("Speech transcription timed out. Try a shorter recording.",504);throw new ServiceError("Could not reach the speech transcription service",502);}
 if(!response.ok){if(response.status===429)throw new ServiceError("Speech service rate limit reached. Try again shortly.",429);if(response.status===401||response.status===403)throw new ServiceError("Groq rejected the configured API key or model access",502);throw new ServiceError("Speech transcription provider returned an error",502);}
 const payload=await response.json().catch(()=>null),transcript=String(payload?.text||"").trim();
 return {transcript:transcript.slice(0,1500),model,language,detectedSpeech:Boolean(transcript)};
}
