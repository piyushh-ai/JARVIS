"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

function useIsHydrated() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function prepareTextForSpeech(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\bcmd_[a-zA-Z0-9-]{8,}\b/g, "")
    .replace(/\b[a-f0-9]{24}\b/gi, "")
    .replace(/\bdesiredState\b/gi, "desired state")
    .replace(/\breportedState\b/gi, "reported state")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s*->\s*/g, " to ")
    .replace(/\s*[·|]\s*/g, ", ")
    .replace(/_/g, " ")
    .replace(/[()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function selectClearVoice(voices = []) {
  if (!Array.isArray(voices) || voices.length === 0) return null;

  const naturalPattern = /natural|online|google|neural|aria|jenny|guy|neerja|prabhat|ravi|heera/i;
  const enIn = voices.filter((v) => v.lang?.toLowerCase() === "en-in");
  const enAny = voices.filter((v) => v.lang?.toLowerCase().startsWith("en-"));
  const hiIn = voices.filter((v) => v.lang?.toLowerCase() === "hi-in");

  // Prefer crisp English / Indian-English neural voices for Roman-script English + Hinglish clarity;
  // avoid Devanagari-only hi-IN synthesizers garbling English words unless no English voice exists.
  return (
    enIn.find((v) => naturalPattern.test(v.name || "")) ||
    enAny.find((v) => naturalPattern.test(v.name || "")) ||
    enIn[0] ||
    enAny.find((v) => /en-gb|en-us/i.test(v.lang || "")) ||
    enAny[0] ||
    hiIn[0] ||
    voices[0] ||
    null
  );
}

/**
 * Hydration-safe browser-native Web Speech API hook for SpeechRecognition (STT)
 * and speechSynthesis (TTS) with Hinglish-friendly voice selection and zero overlap.
 */
export function useVoiceAssistant() {
  const hydrated = useIsHydrated();
  const sttSupported = hydrated && Boolean(getSpeechRecognitionConstructor());
  const ttsSupported =
    hydrated &&
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance === "function";

  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [voiceError, setVoiceError] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [speaking, setSpeaking] = useState(false);

  const recognitionRef = useRef(null);
  const voicesRef = useRef([]);

  useEffect(() => {
    if (!ttsSupported) return undefined;

    const syncVoices = () => {
      try {
        voicesRef.current = window.speechSynthesis.getVoices() || [];
      } catch {
        voicesRef.current = [];
      }
    };

    syncVoices();
    window.speechSynthesis.addEventListener?.("voiceschanged", syncVoices);
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", syncVoices);
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore cleanup cancel failure
      }
    };
  }, [ttsSupported]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort?.();
      } catch {
        // ignore
      }
    };
  }, []);

  const stopSpeaking = useCallback(() => {
    if (!ttsSupported) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
    setSpeaking(false);
  }, [ttsSupported]);

  const speak = useCallback(
    (text) => {
      if (!ttsSupported || !voiceEnabled) return false;
      const cleanText = prepareTextForSpeech(text);
      if (!cleanText) return false;

      try {
        window.speechSynthesis.cancel();
        const utterance = new window.SpeechSynthesisUtterance(cleanText);
        const preferredVoice = selectClearVoice(voicesRef.current);
        if (preferredVoice) {
          utterance.voice = preferredVoice;
          utterance.lang = preferredVoice.lang;
        } else {
          utterance.lang = "en-IN";
        }
        utterance.rate = 0.96;
        utterance.pitch = 1;
        utterance.volume = 1;
        utterance.onstart = () => setSpeaking(true);
        utterance.onend = () => setSpeaking(false);
        utterance.onerror = () => setSpeaking(false);
        window.speechSynthesis.speak(utterance);
        return true;
      } catch {
        setSpeaking(false);
        return false;
      }
    },
    [ttsSupported, voiceEnabled]
  );

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop?.();
    } catch {
      // ignore
    }
    setListening(false);
  }, []);

  const startListening = useCallback(
    ({ lang = "en-IN", onTranscript } = {}) => {
      setVoiceError(null);
      const SpeechRec = getSpeechRecognitionConstructor();
      if (!SpeechRec) {
        setVoiceError(
          "Voice input is not supported in this browser. Use Chrome or Edge, or type your command below."
        );
        return false;
      }

      stopSpeaking();

      try {
        recognitionRef.current?.abort?.();
      } catch {
        // ignore previous session abort error
      }

      try {
        const rec = new SpeechRec();
        rec.lang = lang;
        rec.continuous = false;
        rec.interimResults = true;
        rec.maxAlternatives = 1;

        rec.onstart = () => {
          setListening(true);
          setInterimTranscript("");
        };

        rec.onresult = (event) => {
          let finalText = "";
          let interimText = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const segment = event.results[i]?.[0]?.transcript || "";
            if (event.results[i]?.isFinal) {
              finalText += segment;
            } else {
              interimText += segment;
            }
          }
          const combined = (finalText || interimText).trim();
          setInterimTranscript(interimText.trim());
          if (combined) {
            onTranscript?.(combined, { isFinal: Boolean(finalText.trim()) });
          }
        };

        rec.onerror = (event) => {
          const code = event?.error || "unknown";
          if (code === "not-allowed" || code === "service-not-allowed") {
            setVoiceError(
              "Microphone permission was denied. Allow microphone access in browser settings to use voice commands."
            );
          } else if (code === "no-speech") {
            setVoiceError("No speech detected. Tap the microphone and try again.");
          } else if (code === "audio-capture") {
            setVoiceError("No active microphone device found.");
          } else if (code !== "aborted") {
            setVoiceError(`Voice recognition error (${code}).`);
          }
          setListening(false);
          setInterimTranscript("");
        };

        rec.onend = () => {
          setListening(false);
          setInterimTranscript("");
        };

        recognitionRef.current = rec;
        rec.start();
        return true;
      } catch {
        setListening(false);
        setVoiceError("Could not start browser speech recognition.");
        return false;
      }
    },
    [stopSpeaking]
  );

  const toggleVoiceOutput = useCallback(() => {
    setVoiceEnabled((prev) => {
      if (prev) stopSpeaking();
      return !prev;
    });
  }, [stopSpeaking]);

  return {
    hydrated,
    sttSupported,
    ttsSupported,
    listening,
    interimTranscript,
    voiceError,
    clearVoiceError: useCallback(() => setVoiceError(null), []),
    voiceEnabled,
    speaking,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    toggleVoiceOutput,
  };
}

