import { connectDB } from "@/lib/db/connect";
import Conversation from "@/models/Conversation";
import { isVoiceSessionActive } from "@/services/ai/esp32VoiceLogic";

const MAX_IDLE_MIN = 120;
const MAX_MESSAGES = 100;

export function getVoiceIdleMinutes() {
  const value = Number(process.env.ESP32_VOICE_SESSION_IDLE_MIN || 15);
  return Number.isFinite(value) ? Math.max(1, Math.min(MAX_IDLE_MIN, Math.floor(value))) : 15;
}

const voiceHintCache = globalThis._jarvisVoiceHintCache || (globalThis._jarvisVoiceHintCache = new Map());
const VOICE_HINT_TTL_MS = 30000;
export function getCachedVoiceSessionHint({ userId, homeId, controllerId, now = Date.now() }) {
  const item = voiceHintCache.get(`${userId}:${homeId}:${controllerId}`);
  return item && now - item.updatedAt <= VOICE_HINT_TTL_MS ? item : null;
}
function setVoiceSessionHint({ userId, homeId, controllerId, sessionId, lastMessageAt, pendingClarification, pinnedCount = 0 }) {
  voiceHintCache.set(`${userId}:${homeId}:${controllerId}`, { sessionId: sessionId || null, lastMessageAt: lastMessageAt || null, pendingClarification: pendingClarification || null, pinnedCount: Math.max(0, Math.min(4, Number(pinnedCount) || 0)), updatedAt: Date.now() });
}
export async function loadEsp32VoiceSession({ userId, homeId, controllerId, now = new Date() }) {
  await connectDB();
  const session = await Conversation.findOne({
    userId, homeId,
  }).sort({ lastMessageAt: -1 }).lean();
  if (!session || !isVoiceSessionActive(session.lastMessageAt, now, getVoiceIdleMinutes())) {
    return { conversation: null, context: [], summary: "", pendingClarification: null };
  }

  setVoiceSessionHint({ userId, homeId, controllerId, sessionId: session._id, lastMessageAt: session.lastMessageAt, pendingClarification: session.pendingClarification, pinnedCount: session.pinnedMessages?.length || 0 });
  const messages = Array.isArray(session.messages) ? session.messages : [];
  const pinned = session.pinnedMessages?.length ? session.pinnedMessages : messages.slice(0, 4);
  const recent = messages.slice(-24);
  const pinnedKeys = new Set(pinned.map((m) =>
    `${m.role}:${new Date(m.createdAt).getTime()}:${m.content}`
  ));
  const merged = [
    ...pinned,
    ...recent.filter((m) => !pinnedKeys.has(`${m.role}:${new Date(m.createdAt).getTime()}:${m.content}`)),
  ];

  return {
    conversation: session,
    context: merged.map((m) => ({ role: m.role, content: String(m.content || "").slice(0, 1200) })),
    summary: String(session.summary || "").slice(0, 3000),
    pendingClarification: session.pendingClarification || null,
  };
}

export async function persistEsp32VoiceTurn({
  sessionId, userId, homeId, controllerId, transcript, reply, actions = [],
  clarification = null, pendingClarification = null, pinnedCount = 0, now = new Date(),
}) {
  await connectDB();
  const actionText = actions.length
    ? ` Executed actions: ${actions.map((a) => `${a.name || a.deviceName || a.sceneId || "device"} ${a.action || ""}`.trim()).join(", ")}.`
    : "";
  const assistantText = `${String(reply || "").trim()}${actionText}`.trim() || "Request processed.";
  const userMessage = {
    role: "user", content: String(transcript).slice(0, 1500),
    inputMode: "voice", createdAt: now,
  };
  const assistantMessage = {
    role: "assistant", content: assistantText.slice(0, 8000), inputMode: "voice",
    toolExecutions: clarification
      ? [{ toolName: "voice_clarification", status: "clarification", summary: clarification }]
      : [],
    createdAt: new Date(now.getTime() + 1),
  };

  const update = {
    $set: {
      lastMessageAt: assistantMessage.createdAt,
      pendingClarification: pendingClarification || null,
    },
    $inc: { messageCount: 2 },
    $push: {
      messages: { $each: [userMessage, assistantMessage], $slice: -MAX_MESSAGES },
    },
  };

  if (sessionId) {
    if (pinnedCount < 4) {
      update.$push.pinnedMessages = {
        $each: [userMessage, assistantMessage].slice(0, 4 - pinnedCount),
      };
    }
    await Conversation.updateOne(
      { _id: sessionId, userId, homeId },
      update
    );
    setVoiceSessionHint({ userId, homeId, controllerId, sessionId, lastMessageAt: assistantMessage.createdAt, pendingClarification, pinnedCount: Math.min(4, pinnedCount + 2) });
    return sessionId;
  }

  const created = await Conversation.create({
    userId, homeId, source: "assistant-web",
    sessionStartedAt: now, lastMessageAt: assistantMessage.createdAt,
    firstUserMessage: String(transcript).slice(0, 1500),
    title: String(transcript).slice(0, 80) || "ESP32 Voice Session",
    messages: [userMessage, assistantMessage],
    pinnedMessages: [userMessage, assistantMessage],
    messageCount: 2, summary: "", summaryThroughMessageCount: 0,
    pendingClarification: pendingClarification || null,
  });
  setVoiceSessionHint({ userId, homeId, controllerId, sessionId: created._id, lastMessageAt: assistantMessage.createdAt, pendingClarification, pinnedCount: 2 });
  return created._id;
}

export async function refreshEsp32VoiceSummary({ sessionId, userId, homeId, controllerId, summarize }) {
  if (!sessionId || typeof summarize !== "function") return;
  await connectDB();
  const session = await Conversation.findOne({
    _id: sessionId, userId, homeId,
  }).select("messages summary messageCount summaryThroughMessageCount").lean();

  // messageCount counts user + assistant documents, so 32 messages is about 16 turns.
  if (!session || session.messageCount <= 32) return;
  const messages = session.messages || [];
  const storedStart = Math.max(0, session.messageCount - messages.length);
  const startAbsolute = Math.max(4, session.summaryThroughMessageCount || 0, storedStart);
  const endAbsolute = Math.max(startAbsolute, session.messageCount - 24);
  const older = messages.slice(startAbsolute - storedStart, endAbsolute - storedStart);
  if (older.length < 8) return;

  const folded = older.map((m) => `${m.role}: ${m.content}`).join("\n").slice(-12000);
  const summary = await summarize(session.summary || "", folded);
  if (!summary) return;

  await Conversation.updateOne(
    { _id: sessionId, userId, homeId },
    { $set: {
      summary: String(summary).slice(0, 5000),
      summaryThroughMessageCount: endAbsolute,
    } }
  );
}
