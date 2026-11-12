export function normalizeVoiceText(value) {
  return String(value || "").toLocaleLowerCase("en-IN").normalize("NFKC")
    .replace(/[’']/g, "").replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

const WAKE_WORD_ALIASES = ["jarvis", "jarvish", "jarwis", "jarvas", "javis", "jarviss", "जार्विस"];

export function findWakeWord(text) {
  const normalized = normalizeVoiceText(text);
  for (const alias of WAKE_WORD_ALIASES) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = normalized.match(new RegExp(`(^|\\s)${escaped}(?=$|\\s)`, "iu"));
    if (match) return { heard: true, command: normalized.replace(match[0], " ").trim() };
  }
  return { heard: false, command: normalized };
}

export function parseFollowupAction(text) {
  const value = normalizeVoiceText(text);
  if (/^(on|on kar do|chalu|chalu kar do|start|start karo|jala do|jalao)$/.test(value)) return "on";
  if (/^(off|off kar do|band|band kar do|stop|stop karo|bujha do|bujhao)$/.test(value)) return "off";
  return null;
}

export function detectExplicitAction(text) {
  const value = normalizeVoiceText(text);
  const on = /\b(on|chalu|start|jala do|jalao|kholo)\b/u.test(value);
  const off = /\b(off|band|stop|bujha do|bujhao)\b/u.test(value);
  return on === off ? null : on ? "on" : "off";
}

export function hasConflictingExplicitActions(text) {
  const value = normalizeVoiceText(text);
  return /\b(on|chalu|start|jala do|jalao|kholo)\b/u.test(value) &&
    /\b(off|band|stop|bujha do|bujhao)\b/u.test(value);
}

export function isVoiceSessionActive(lastMessageAt, now = new Date(), idleMinutes = 15) {
  return Boolean(lastMessageAt) && now.getTime() - new Date(lastMessageAt).getTime() <= idleMinutes * 60 * 1000;
}

export function toInlineVoiceCommands(claimed) {
  return (claimed || []).map((cmd) => ({
    commandId: cmd.commandId,
    relayNumber: cmd.relayNumber,
    action: cmd.action,
    ttlRemainingMs: cmd.ttlRemainingMs,
  }));
}

export function makeVoiceResponseData(controller, values, serverMs, timingsMs) {
  return {
    esp32DeviceId: controller.esp32DeviceId,
    transcript: values.transcript || "",
    execution: values.execution,
    reason: values.reason || "",
    reply: values.reply || "",
    commands: values.commands || [],
    serverMs,
    timingsMs,
    ...(values.details ? { details: values.details } : {}),
  };
}

export function resolveClarificationFollowup(text, pending, now = new Date()) {
  if (!pending?.createdAt || (!pending.deviceId && !pending.sceneId)) return null;
  const ageMs = now.getTime() - new Date(pending.createdAt).getTime();
  if (ageMs < 0 || ageMs > 30000) return null;
  const action = parseFollowupAction(text);
  if (!action) return null;
  return {
    action,
    ...(pending.deviceId ? { deviceId: pending.deviceId } : {}),
    ...(pending.sceneId ? { sceneId: pending.sceneId } : {}),
  };
}
