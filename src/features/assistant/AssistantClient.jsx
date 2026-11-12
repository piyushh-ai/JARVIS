"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Cpu,
  History,
  Loader2,
  MessageSquarePlus,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Trash2,
  User,
  Volume2,
  VolumeX,
  Wrench,
} from "lucide-react";
import Header from "@/components/layout/Header";
import BottomNav from "@/components/layout/BottomNav";
import { useAuth } from "@/hooks/useAuth";
import { useDevices } from "@/hooks/useDevices";
import { useVoiceAssistant } from "@/hooks/useVoiceAssistant";
import { prefersReducedMotion } from "@/lib/motion";
import {
  deleteAssistantConversation,
  getAssistantConversation,
  listAssistantConversations,
  sendAssistantMessage,
} from "@/services/assistantApi";

const QUICK_PROMPTS = [
  "Jarvis, main light on kar do",
  "Fan band kar do",
  "Good night scene activate kar do",
  "Mere ghar mein kaun-kaun se devices online hain?",
];

const TOOL_STATUS_STYLES = {
  queued: "border-cyan-primary/35 bg-cyan-primary/10 text-cyan-primary",
  partial: "border-amber-300/40 bg-amber-400/10 text-amber-200",
  completed: "border-cyan-primary/25 bg-cyan-primary/8 text-cyan-primary",
  clarification: "border-amber-300/40 bg-amber-400/10 text-amber-200",
  not_found: "border-amber-300/35 bg-amber-400/10 text-amber-200",
  failed: "border-red-400/40 bg-red-500/10 text-red-200",
};

export default function AssistantClient({ initialAuth }) {
  const router = useRouter();
  const shellRef = useRef(null);
  const messagesEndRef = useRef(null);
  const submittingRef = useRef(false);

  const {
    user,
    homes,
    currentHome,
    mutating: authMutating,
    switchHome,
    createHome,
    logout,
  } = useAuth({ initialAuth });

  const activeHomeId = currentHome?._id || "";

  const {
    devices,
    loading: devicesLoading,
    refresh: refreshDevices,
    applySceneOutcome,
  } = useDevices({
    homeId: activeHomeId,
    autoFetch: Boolean(activeHomeId),
  });

  const {
    hydrated,
    sttSupported,
    ttsSupported,
    listening,
    interimTranscript,
    voiceError,
    clearVoiceError,
    voiceEnabled,
    speaking,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    toggleVoiceOutput,
  } = useVoiceAssistant();

  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [providerInfo, setProviderInfo] = useState(null);

  const [loadingList, setLoadingList] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [showHistoryMobile, setShowHistoryMobile] = useState(false);

  const [inputText, setInputText] = useState("");
  const [lastInputMode, setLastInputMode] = useState("text");
  const [errorState, setErrorState] = useState(null);
  const [lastFailedPayload, setLastFailedPayload] = useState(null);

  const loadConversations = useCallback(async (homeId) => {
    if (!homeId) return;
    setLoadingList(true);
    try {
      const data = await listAssistantConversations(homeId);
      setConversations(
        Array.isArray(data?.conversations) ? data.conversations : []
      );
      if (data?.provider) {
        setProviderInfo(data.provider);
      }
    } catch (err) {
      setErrorState(err?.message || "Failed to load conversation history");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (!activeHomeId) return undefined;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) {
        loadConversations(activeHomeId);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeHomeId, loadConversations]);

  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const ctx = gsap.context(() => {
      gsap.from('[data-gsap="assistant-stage"]', {
        y: 10,
        opacity: 0,
        duration: 0.34,
        ease: "power2.out",
        clearProps: "transform,opacity",
      });
    }, shellRef);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "end",
    });
  }, [messages, sending]);

  const handleSelectConversation = async (id) => {
    if (!activeHomeId || !id) return;
    setLoadingThread(true);
    setErrorState(null);
    try {
      const detail = await getAssistantConversation(id, activeHomeId);
      setActiveConversationId(detail?._id || id);
      setMessages(Array.isArray(detail?.messages) ? detail.messages : []);
      setShowHistoryMobile(false);
    } catch (err) {
      setErrorState(err?.message || "Failed to open conversation");
    } finally {
      setLoadingThread(false);
    }
  };

  const handleNewConversation = () => {
    stopSpeaking();
    setActiveConversationId(null);
    setMessages([]);
    setErrorState(null);
    setLastFailedPayload(null);
    setShowHistoryMobile(false);
  };

  const handleDeleteConversation = async (id, event) => {
    event?.stopPropagation?.();
    if (!activeHomeId || !id || deletingId) return;
    setDeletingId(id);
    setErrorState(null);
    try {
      await deleteAssistantConversation(id, activeHomeId);
      setConversations((prev) => prev.filter((c) => c._id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch (err) {
      setErrorState(err?.message || "Failed to delete conversation");
    } finally {
      setDeletingId(null);
    }
  };

  const submitPrompt = async ({ text, inputMode = "text" }) => {
    const trimmed = String(text || "").trim();
    if (!trimmed || !activeHomeId || submittingRef.current) return;

    submittingRef.current = true;
    setSending(true);
    setErrorState(null);
    setLastFailedPayload(null);
    stopSpeaking();
    if (listening) stopListening();

    const optimisticUserMsg = {
      role: "user",
      content: trimmed,
      inputMode,
      toolExecutions: [],
      createdAt: new Date().toISOString(),
      optimistic: true,
    };

    setMessages((prev) => [...prev, optimisticUserMsg]);
    setInputText("");
    setLastInputMode("text");

    try {
      const result = await sendAssistantMessage({
        homeId: activeHomeId,
        conversationId: activeConversationId,
        message: trimmed,
        inputMode,
      });

      if (result?.conversation) {
        setActiveConversationId(result.conversation._id);
        setMessages(
          Array.isArray(result.conversation.messages)
            ? result.conversation.messages
            : []
        );

        const summary = {
          _id: result.conversation._id,
          homeId: result.conversation.homeId,
          title: result.conversation.title,
          messageCount: result.conversation.messageCount,
          lastMessageAt: result.conversation.lastMessageAt,
        };
        setConversations((prev) => {
          const filtered = prev.filter((c) => c._id !== summary._id);
          return [summary, ...filtered];
        });
      }

      if (result?.updatedDevices?.length > 0) {
        const queuedResults = result.updatedDevices.map((d) => ({
          deviceId: d._id,
          status: "queued",
          commandId: null,
        }));
        applySceneOutcome({
          devices: result.updatedDevices,
          results: queuedResults,
        });
      }

      if (result?.reply && voiceEnabled) {
        speak(result.reply);
      }
    } catch (err) {
      setMessages((prev) => prev.filter((m) => !m.optimistic));
      setInputText(trimmed);
      setErrorState(err?.message || "JARVIS could not complete that request.");
      setLastFailedPayload({ text: trimmed, inputMode });
    } finally {
      submittingRef.current = false;
      setSending(false);
    }
  };

  const handleFormSubmit = (event) => {
    event.preventDefault();
    submitPrompt({ text: inputText, inputMode: lastInputMode });
  };

  const handleMicToggle = () => {
    clearVoiceError();
    if (listening) {
      stopListening();
      return;
    }
    startListening({
      lang: "en-IN",
      onTranscript: (recognized, { isFinal }) => {
        setInputText(recognized);
        setLastInputMode("voice");
        if (isFinal) {
          setLastInputMode("voice");
        }
      },
    });
  };

  const handleSwitchHome = async (homeId) => {
    stopSpeaking();
    setActiveConversationId(null);
    setMessages([]);
    setErrorState(null);
    setLastFailedPayload(null);
    return switchHome(homeId);
  };

  const handleCreateHome = async (name) => {
    stopSpeaking();
    setActiveConversationId(null);
    setMessages([]);
    setErrorState(null);
    setLastFailedPayload(null);
    return createHome(name);
  };

  const handleLogout = async () => {
    stopSpeaking();
    try {
      await logout();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  };

  const handleRefreshAll = async () => {
    await Promise.allSettled([
      refreshDevices(),
      loadConversations(activeHomeId),
    ]);
  };

  const onlineDevicesCount = devices.filter(
    (d) => d.connectionStatus === "online"
  ).length;

  return (
    <div
      ref={shellRef}
      className="min-h-dvh flex flex-col bg-hud-grid"
    >
      <Header
        status={sending || loadingList ? "syncing" : "connected"}
        systemLabel="NEURAL CORE · AI"
        user={user}
        homes={homes}
        currentHome={currentHome}
        onSwitchHome={handleSwitchHome}
        onCreateHome={handleCreateHome}
        onLogout={handleLogout}
        authMutating={authMutating}
        onRefresh={handleRefreshAll}
        isRefreshing={devicesLoading || loadingList}
      />

      <main className="hud-container flex-1 py-4 sm:py-6 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-28">
        <div
          data-gsap="assistant-stage"
          className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5 items-start"
        >
          {/* Left Column: Conversation History + Live Home Snapshot */}
          <aside className="lg:col-span-4 space-y-4">
            <section className="hud-surface rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-primary/10 hud-border-active text-cyan-primary">
                    <History className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-display text-xs sm:text-sm font-semibold uppercase tracking-[0.14em] text-foreground">
                      Memory Logs
                    </h2>
                    <p className="text-[11px] text-muted truncate">
                      {currentHome?.name || "Active Home"} · {conversations.length} chats
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleNewConversation}
                    className="inline-flex h-8 items-center gap-1 rounded-xl bg-cyan-primary/15 hud-border-active px-2.5 text-[11px] font-semibold uppercase tracking-wider text-cyan-primary hover:bg-cyan-primary/25 cursor-pointer"
                  >
                    <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>New</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowHistoryMobile((v) => !v)}
                    className="lg:hidden rounded-xl hud-surface px-2.5 h-8 text-[11px] font-medium text-muted hover:text-foreground cursor-pointer"
                  >
                    {showHistoryMobile ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <div
                className={`${
                  showHistoryMobile ? "block" : "hidden lg:block"
                } space-y-1.5 max-h-[280px] lg:max-h-[360px] overflow-y-auto pr-1`}
              >
                {loadingList && conversations.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted">
                    Loading conversations...
                  </p>
                ) : conversations.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted">
                    No saved conversations in this home yet. Send a command to start.
                  </p>
                ) : (
                  conversations.map((conv) => {
                    const isSelected = activeConversationId === conv._id;
                    const isDeleting = deletingId === conv._id;
                    return (
                      <div
                        key={conv._id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSelectConversation(conv._id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleSelectConversation(conv._id);
                          }
                        }}
                        className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left transition-colors cursor-pointer ${
                          isSelected
                            ? "hud-surface hud-border-active bg-cyan-primary/12 text-foreground"
                            : "bg-background/45 border border-white/10 text-muted hover:text-foreground hover:border-cyan-primary/30"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-foreground">
                            {conv.title}
                          </p>
                          <p className="text-[10px] text-muted">
                            {conv.messageCount || 0} msgs
                          </p>
                        </div>

                        <button
                          type="button"
                          disabled={isDeleting}
                          aria-label={`Delete conversation ${conv.title}`}
                          onClick={(e) => handleDeleteConversation(conv._id, e)}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted hover:text-red-300 hover:bg-red-500/15 cursor-pointer disabled:opacity-50"
                        >
                          {isDeleting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            {/* Live Device Sync Strip */}
            <section className="hud-surface rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Cpu className="h-4 w-4 text-cyan-primary shrink-0" aria-hidden="true" />
                  <h2 className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-foreground truncate">
                    Live Home Endpoints
                  </h2>
                </div>
                <span className="text-[10px] text-cyan-primary font-medium uppercase tracking-wider tabular-nums">
                  {onlineDevicesCount}/{devices.length} Online
                </span>
              </div>

              {devices.length === 0 ? (
                <p className="text-[11px] text-muted">
                  No devices registered in {currentHome?.name || "this home"}.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {devices.map((dev) => {
                    const diverged =
                      dev.esp32DeviceId &&
                      dev.relayNumber &&
                      dev.desiredState !== dev.reportedState;
                    return (
                      <span
                        key={dev._id}
                        title={`Desired: ${dev.desiredState} · Reported: ${dev.reportedState} · Conn: ${dev.connectionStatus}`}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] border ${
                          dev.desiredState === "on"
                            ? "border-cyan-primary/35 bg-cyan-primary/10 text-cyan-primary"
                            : "border-white/10 bg-background/60 text-muted"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            dev.connectionStatus === "online"
                              ? "bg-cyan-primary"
                              : dev.connectionStatus === "offline"
                                ? "bg-red-400"
                                : "bg-amber-300/75"
                          }`}
                        />
                        <span className="font-medium text-foreground">
                          {dev.name}
                        </span>
                        <span className="uppercase">{dev.desiredState}</span>
                        {diverged && (
                          <span className="text-amber-200">(ACK…)</span>
                        )}
                      </span>
                    );
                  })}
                </div>
              )}
            </section>
          </aside>

          {/* Right Column: Main JARVIS Chat & Voice Interface */}
          <section
            aria-label="JARVIS AI Assistant conversation"
            className="lg:col-span-8 hud-surface rounded-2xl p-4 sm:p-5 flex flex-col min-h-[65dvh] max-h-[78dvh]"
          >
            {/* Assistant Status & Voice Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b hud-divider pb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-primary/12 hud-border-active text-cyan-primary glow-cyan-sm">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-sm sm:text-base font-semibold tracking-wider text-foreground truncate">
                    JARVIS Neural Assistant
                  </h2>
                  <p className="text-[11px] text-muted truncate">
                    {providerInfo
                      ? providerInfo.configured
                        ? `Provider: ${providerInfo.provider.toUpperCase()} (${providerInfo.model})`
                        : "Provider not configured on server"
                      : "Checking AI provider..."}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {hydrated && ttsSupported && speaking && (
                  <button
                    type="button"
                    onClick={stopSpeaking}
                    className="inline-flex h-8 items-center gap-1 rounded-xl border border-amber-300/40 bg-amber-400/15 px-2.5 text-[11px] font-semibold text-amber-200 hover:bg-amber-400/25 cursor-pointer"
                  >
                    <Square className="h-3 w-3" aria-hidden="true" />
                    <span>Stop Voice</span>
                  </button>
                )}

                {hydrated && (
                  <button
                    type="button"
                    disabled={!ttsSupported}
                    onClick={toggleVoiceOutput}
                    aria-pressed={voiceEnabled}
                    title={
                      ttsSupported
                        ? voiceEnabled
                          ? "Mute JARVIS voice replies"
                          : "Enable JARVIS voice replies"
                        : "Browser text-to-speech unavailable"
                    }
                    className={`inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-[11px] font-medium border cursor-pointer disabled:opacity-50 ${
                      ttsSupported && voiceEnabled
                        ? "hud-border-active bg-cyan-primary/12 text-cyan-primary"
                        : "border-white/10 bg-white/5 text-muted"
                    }`}
                  >
                    {ttsSupported && voiceEnabled ? (
                      <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span className="hidden sm:inline">
                      {!ttsSupported
                        ? "No TTS"
                        : voiceEnabled
                          ? "Voice ON"
                          : "Muted"}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Unconfigured Server LLM Provider Notice */}
            {providerInfo && !providerInfo.configured && (
              <div
                role="status"
                className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300/35 bg-amber-400/10 px-3.5 py-2.5 text-xs text-amber-100"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-300" />
                <span>
                  {providerInfo.message ||
                    "Configure a server LLM provider API key (Gemini, Groq, or OpenAI) in environment variables to activate live AI responses."}
                </span>
              </div>
            )}

            {/* Message Feed */}
            <div className="flex-1 overflow-y-auto py-4 space-y-3.5 pr-1">
              {loadingThread ? (
                <div className="flex h-full items-center justify-center gap-2 text-xs text-muted">
                  <Loader2 className="h-4 w-4 animate-spin text-cyan-primary" />
                  <span>Loading conversation history...</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-6 sm:py-10 space-y-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-primary/10 hud-border-active text-cyan-primary glow-cyan-sm">
                    <Bot className="h-7 w-7" aria-hidden="true" />
                  </div>
                  <div className="max-w-md space-y-1.5">
                    <p className="font-display text-sm font-semibold tracking-wider text-foreground">
                      Systems Online, {user?.name?.split(" ")[0] || "Operator"}
                    </p>
                    <p className="text-xs text-muted leading-relaxed">
                      Ask me in English or Hinglish to control devices, inspect
                      online status, or activate smart scenes via the ESP32
                      command queue.
                    </p>
                  </div>

                  <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                    {QUICK_PROMPTS.map((sample) => (
                      <button
                        key={sample}
                        type="button"
                        disabled={sending}
                        onClick={() =>
                          submitPrompt({ text: sample, inputMode: "text" })
                        }
                        className="rounded-xl hud-surface border-white/10 px-3 py-1.5 text-[11px] text-foreground/90 hover:hud-border-active hover:bg-cyan-primary/10 cursor-pointer disabled:opacity-50"
                      >
                        {sample}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg, index) => {
                  const isUser = msg.role === "user";
                  return (
                    <div
                      key={`${msg.createdAt || index}_${index}`}
                      className={`flex flex-col ${
                        isUser ? "items-end" : "items-start"
                      }`}
                    >
                      <div
                        className={`max-w-[90%] sm:max-w-[82%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm space-y-2 ${
                          isUser
                            ? "bg-blue-secondary/18 border border-blue-secondary/40 text-foreground"
                            : "hud-surface hud-border-active text-foreground"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-wider text-muted">
                          <span className="inline-flex items-center gap-1 font-semibold">
                            {isUser ? (
                              <>
                                <User className="h-3 w-3 text-blue-secondary" />
                                {user?.name || "You"}
                                {msg.inputMode === "voice" && (
                                  <span className="rounded bg-white/10 px-1 py-0.2 text-[9px] text-cyan-primary">
                                    Voice
                                  </span>
                                )}
                              </>
                            ) : (
                              <>
                                <Bot className="h-3 w-3 text-cyan-primary" />
                                <span className="text-cyan-primary">JARVIS</span>
                              </>
                            )}
                          </span>
                        </div>

                        <p className="whitespace-pre-wrap leading-relaxed">
                          {msg.content}
                        </p>

                        {/* Structured Tool Execution Metadata */}
                        {!isUser &&
                          Array.isArray(msg.toolExecutions) &&
                          msg.toolExecutions.length > 0 && (
                            <div className="space-y-1.5 border-t border-white/10 pt-2">
                              {msg.toolExecutions.map((tool, tIdx) => (
                                <div
                                  key={`${tool.toolName}_${tIdx}`}
                                  className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-2.5 py-1.5 text-[11px] ${
                                    TOOL_STATUS_STYLES[tool.status] ||
                                    TOOL_STATUS_STYLES.completed
                                  }`}
                                >
                                  <span className="inline-flex items-center gap-1.5 min-w-0">
                                    <Wrench
                                      className="h-3 w-3 shrink-0"
                                      aria-hidden="true"
                                    />
                                    <span className="truncate font-medium">
                                      {tool.summary || tool.toolName}
                                    </span>
                                  </span>
                                  <span className="inline-flex items-center gap-1 rounded-full bg-black/25 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider shrink-0">
                                    {tool.status === "queued" ||
                                    tool.status === "completed" ? (
                                      <CheckCircle2 className="h-2.5 w-2.5" />
                                    ) : (
                                      <AlertTriangle className="h-2.5 w-2.5" />
                                    )}
                                    {tool.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                      </div>
                    </div>
                  );
                })
              )}

              {sending && (
                <div className="flex items-start">
                  <div className="hud-surface hud-border-active rounded-2xl px-3.5 py-2.5 text-xs text-cyan-primary inline-flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>JARVIS is reasoning & executing home tools...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Voice or API Errors */}
            {(errorState || voiceError) && (
              <div
                role="alert"
                className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-400/40 bg-red-500/10 px-3.5 py-2 text-xs text-red-200"
              >
                <span className="inline-flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{errorState || voiceError}</span>
                </span>

                <div className="flex items-center gap-2">
                  {lastFailedPayload && (
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => submitPrompt(lastFailedPayload)}
                      className="inline-flex items-center gap-1 rounded-lg bg-red-500/25 border border-red-400/50 px-2.5 py-1 text-[11px] font-semibold text-red-100 hover:bg-red-500/35 cursor-pointer"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Retry
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setErrorState(null);
                      clearVoiceError();
                    }}
                    className="text-[11px] underline opacity-80 hover:opacity-100 cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* Composer: Text + Browser Speech Recognition */}
            <form
              onSubmit={handleFormSubmit}
              className="border-t hud-divider pt-3 space-y-2"
            >
              {listening && (
                <div className="flex items-center justify-between gap-2 rounded-xl bg-cyan-primary/10 hud-border-active px-3 py-1.5 text-[11px] text-cyan-primary">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-red-400 animate-ping" />
                    <span>
                      Listening (English / Hinglish):{" "}
                      {interimTranscript
                        ? `"${interimTranscript}"`
                        : "Speak command now..."}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={stopListening}
                    className="font-semibold uppercase tracking-wider text-[10px] underline cursor-pointer"
                  >
                    Stop
                  </button>
                </div>
              )}

              <div className="flex items-end gap-2">
                <button
                  type="button"
                  disabled={!hydrated || !sttSupported || sending}
                  onClick={handleMicToggle}
                  aria-label={
                    !sttSupported
                      ? "Voice input not supported in this browser"
                      : listening
                        ? "Stop listening"
                        : "Start voice command"
                  }
                  title={
                    !sttSupported
                      ? "SpeechRecognition unavailable in this browser"
                      : listening
                        ? "Stop listening"
                        : "Speak command (Web Speech API)"
                  }
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                    listening
                      ? "border-red-400 bg-red-500/20 text-red-200 animate-pulse"
                      : "hud-surface border-white/15 text-cyan-primary hover:hud-border-active hover:bg-cyan-primary/10"
                  }`}
                >
                  {listening ? (
                    <MicOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Mic className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>

                <label htmlFor="jarvis-chat-input" className="sr-only">
                  Ask JARVIS a command or question
                </label>
                <input
                  id="jarvis-chat-input"
                  type="text"
                  value={inputText}
                  disabled={sending || !activeHomeId}
                  maxLength={1500}
                  onChange={(e) => {
                    setInputText(e.target.value);
                    setLastInputMode("text");
                  }}
                  placeholder={
                    listening
                      ? "Listening for voice..."
                      : 'Ask JARVIS (e.g. "Main light on kar do" or "All lights OFF")...'
                  }
                  className="flex-1 min-w-0 h-11 rounded-xl bg-background/85 hud-border px-3.5 text-sm text-foreground placeholder:text-muted/65 focus:border-cyan-primary focus:outline-none disabled:opacity-60"
                />

                <button
                  type="submit"
                  disabled={sending || !activeHomeId || !inputText.trim()}
                  aria-label="Send message to JARVIS"
                  className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-cyan-primary/20 hud-border-active px-4 text-xs font-semibold uppercase tracking-wider text-cyan-primary hover:bg-cyan-primary/30 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span className="hidden sm:inline">Send</span>
                </button>
              </div>
            </form>
          </section>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
