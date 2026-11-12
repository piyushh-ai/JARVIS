import { connectDB } from "@/lib/db/connect";
import Conversation from "@/models/Conversation";

const MAX_IDLE_MIN = 120;
const MAX_MESSAGES = 100;

export function isVoiceSessionActive(lastMessageAt, now = new Date(), idleMinutes = getVoiceIdleMinutes()) {\n  return Boolean(lastMessageAt) && now.getTime() - new Date(lastMessageAt).getTime() <= idleMinutes * 60 * 1000;\n}\n\nexport function getVoiceIdleMinutes() {
  const value = Number(process.env.ESP32_VOICE_SESSION_IDLE_MIN || 15);
  return Number.isFinite(value) ? Math.max(1, Math.min(MAX_IDLE_MIN, Math.floor(value))) : 15;
}

export async function loadEsp32VoiceSession({ userId, homeId, controllerId, now = new Date() }) {
  await connectDB();
  const session = await Conversation.findOne({
    userId, homeId, source: "esp32-voice", controllerId,
  }).sort({ lastMessageAt: -1 }).lean();
  const idleMs = getVoiceIdleMinutes() * 60 * 1000;
  if (!session || !isVoiceSessionActive(session.lastMessageAt, now, idleMs / 60000)) {
    return { conversation: null, context: [], summary: "", pendingClarification: null };
  }
  const messages = Array.isArray(session.messages) ? session.messages : [];
  const pinned = session.pinnedMessages?.length ? session.pinnedMessages : messages.slice(0, 4);
  const recent = messages.slice(-12);
  const merged = [...pinned, ...recent.filter((m) => !pinned.includes(m))];
  return {
    conversation: session,
    context: merged.map((m) => ({ role: m.role, content: m.content })),
    summary: session.summary || "",
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
  const userMessage = { role: "user", content: String(transcript).slice(0, 1500), inputMode: "voice", createdAt: now };
  const assistantMessage = {
    role: "assistant",
    content: assistantText.slice(0, 8000),
    inputMode: "voice",
    toolExecutions: clarification ? [{ toolName: "voice_clarification", status: "clarification", summary: clarification }] : [],
    createdAt: new Date(now.getTime() + 1),
  };
  const update = {
    $set: {
      lastMessageAt: assistantMessage.createdAt,
      pendingClarification: pendingClarification || null,
      ...(pendingClarification ? {} : { pendingClarification: null }),
    },
    $inc: { messageCount: 2 },
    $push: { messages: { $each: [userMessage, assistantMessage], $slice: -MAX_MESSAGES } },
  };
  if (sessionId) {
    await Conversation.updateOne({ _id: sessionId, userId, homeId, source: "esp32-voice", controllerId }, update);
  } else {
    await Conversation.create({
      userId, homeId, source: "esp32-voice", controllerId,
      sessionStartedAt: now, lastMessageAt: assistantMessage.createdAt,
      firstUserMessage: String(transcript).slice(0, 1500),
      title: String(transcript).slice(0, 80) || "ESP32 Voice Session",
      messages: [userMessage, assistantMessage], pinnedMessages: [userMessage, assistantMessage], messageCount: 2,
      summary: "", pendingClarification: pendingClarification || null,
    });
  }
}

export async function refreshEsp32VoiceSummary({ sessionId, userId, homeId, controllerId, summarize }) {
  if (!sessionId || typeof summarize !== "function") return;
  await connectDB();
  const session = await Conversation.findOne({ _id: sessionId, userId, homeId, source: "esp32-voice", controllerId })
    .select("messages summary messageCount").lean();
  if (!session || session.messageCount <= 16) return;
  const older = (session.messages || []).slice(0, Math.max(0, session.messages.length - 12));
  if (!older.length) return;
  const folded = older.map((m) => `${m.role}: ${m.content}`).join("\n").slice(-12000);
  const summary = await summarize(session.summary || "", folded);
  if (summary) {
    await Conversation.updateOne(
      { _id: sessionId, userId, homeId, source: "esp32-voice", controllerId },
      { $set: { summary: String(summary).slice(0, 5000) } }
    );
  }
}
