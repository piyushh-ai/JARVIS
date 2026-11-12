import { ServiceError } from "@/lib/utils/apiResponse";

const DEFAULT_TIMEOUT_MS = 20000;
const MIN_TIMEOUT_MS = 5000;
const MAX_TIMEOUT_MS = 45000;
const DEFAULT_MAX_TOKENS = 220;

const PROVIDER_ORDER = ["groq"];

const PROVIDER_DEFAULTS = Object.freeze({ groq: Object.freeze({ defaultModel: "qwen/qwen3.8-27b", fallbackModels: [], apiBase: "https://api.groq.com/openai/v1" }) });

function resolveTimeoutMs(overrideMs) {
  const raw = overrideMs ?? Number(process.env.AI_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(raw)));
}

function getProviderApiKey(provider) { return provider === "groq" ? process.env.GROQ_API_KEY?.trim() || "" : ""; }

/**
 * Resolves active primary LLM provider and available failover chain from server env vars.
 */
export function resolveLlmConfig() {
  const explicitProvider = process.env.AI_PROVIDER?.trim().toLowerCase() || "";
  let provider = "";

  if (explicitProvider) {
    if (!PROVIDER_DEFAULTS[explicitProvider]) {
      return {
        configured: false,
        provider: explicitProvider,
        model: null,
        apiKey: "",
        failoverChain: [],
        error: `Unsupported AI_PROVIDER "${explicitProvider}". Supported: groq.`,
      };
    }
    provider = explicitProvider;
  } else {
    for (const candidate of PROVIDER_ORDER) {
      if (getProviderApiKey(candidate)) {
        provider = candidate;
        break;
      }
    }
  }

  if (!provider) {
    return {
      configured: false,
      provider: null,
      model: null,
      apiKey: "",
      failoverChain: [],
      error:
        "No AI provider API key is configured on the server. Set GROQ_API_KEY.",
    };
  }

  const apiKey = getProviderApiKey(provider);
  const model =
    process.env.GROQ_MODEL?.trim() || process.env.AI_MODEL?.trim() || PROVIDER_DEFAULTS[provider].defaultModel;

  // Build backup provider configs for automatic cross-provider failover (e.g. Groq -> Mistral)
  const failoverChain = [];
  for (const candidate of PROVIDER_ORDER) {
    if (candidate === provider) continue;
    const backupKey = getProviderApiKey(candidate);
    if (backupKey) {
      failoverChain.push({
        provider: candidate,
        model: PROVIDER_DEFAULTS[candidate].defaultModel,
        apiKey: backupKey,
      });
    }
  }

  if (!apiKey) {
    if (failoverChain.length > 0) {
      const firstBackup = failoverChain[0];
      return {
        configured: true,
        provider: firstBackup.provider,
        model: firstBackup.model,
        apiKey: firstBackup.apiKey,
        failoverChain: failoverChain.slice(1),
        error: null,
      };
    }
    return {
      configured: false,
      provider,
      model,
      apiKey: "",
      failoverChain: [],
      error: `Missing API key for configured AI provider "${provider}".`,
    };
  }

  return {
    configured: true,
    provider,
    model,
    apiKey,
    failoverChain,
    error: null,
  };
}

export function getProviderStatus() {
  const cfg = resolveLlmConfig();
  return {
    configured: cfg.configured,
    provider: cfg.provider,
    model: cfg.model,
    fallbackProviders: cfg.failoverChain.map((f) => f.provider),
    ...(cfg.configured
      ? {}
      : {
          message:
            "Server AI provider is not configured. Configure GROQ_API_KEY in server environment variables.",
        }),
  };
}

function handleFetchError(err, providerLabel) {
  if (err instanceof ServiceError) throw err;
  if (err?.name === "TimeoutError" || err?.name === "AbortError") {
    throw new ServiceError(
      `AI provider (${providerLabel}) timed out. Please retry.`,
      504
    );
  }
  throw new ServiceError(
    `Unable to reach AI provider (${providerLabel}).`,
    503
  );
}

function redactSecretValues(text) {
  let out = String(text || "");
  for (const provider of PROVIDER_ORDER) {
    const key = getProviderApiKey(provider);
    if (key && key.length >= 6) {
      out = out.split(key).join("[REDACTED]");
    }
  }
  return out
    .replace(/AIza[0-9A-Za-z_-]{15,}/g, "[REDACTED]")
    .replace(/sk-[0-9A-Za-z_-]{15,}/g, "[REDACTED]")
    .replace(/gsk_[0-9A-Za-z_-]{15,}/g, "[REDACTED]")
    .slice(0, 180);
}

function throwForHttpStatus(status, providerLabel, detail = "") {
  const safeDetail = redactSecretValues(detail);

  if (status === 401 || status === 403) {
    throw new ServiceError(
      `AI provider (${providerLabel}) authentication failed. Verify server API key configuration.`,
      502
    );
  }
  if (status === 429) {
    throw new ServiceError(
      `AI provider (${providerLabel}) rate quota reached. Retry shortly.`,
      503
    );
  }
  if (status >= 500) {
    throw new ServiceError(
      `AI provider (${providerLabel}) returned upstream error (${status}).`,
      502
    );
  }
  throw new ServiceError(
    `AI provider (${providerLabel}) rejected request (${status})${safeDetail ? `: ${safeDetail}` : ""}.`,
    502
  );
}

async function runSingleProviderStep({
  providerCfg,
  systemPrompt,
  messages,
  toolSchemas,
  continuationState,
  toolResults,
  timeoutMs,
  allowModelFallbacks,
}) {
  return callOpenAiCompatibleStep({
    cfg: providerCfg,
    systemPrompt,
    messages,
    toolSchemas,
    continuationState,
    toolResults,
    timeoutMs,
  });
}

/**
 * Normalizes Groq OpenAI-compatible tool-calling loops
 * with Groq-only provider execution.
 */
export async function runProviderToolStep({
  systemPrompt,
  messages = [],
  toolSchemas = [],
  continuationState = null,
  toolResults = [],
  timeoutMs,
} = {}) {
  const cfg = resolveLlmConfig();
  if (!cfg.configured) {
    throw new ServiceError(cfg.error, 503);
  }

  const effectiveTimeoutMs = resolveTimeoutMs(timeoutMs);

  // Mid-conversation continuation stays bound to the exact provider that emitted tool calls
  if (continuationState?.provider) {
    const boundCfg =
      continuationState.provider === cfg.provider
        ? cfg
        : cfg.failoverChain.find((b) => b.provider === continuationState.provider);

    if (!boundCfg) {
      throw new ServiceError(
        `Provider "${continuationState.provider}" unavailable for tool continuation`,
        503
      );
    }

    return runSingleProviderStep({
      providerCfg: boundCfg,
      systemPrompt,
      messages,
      toolSchemas,
      continuationState,
      toolResults,
      timeoutMs: effectiveTimeoutMs,
      allowModelFallbacks: false,
    });
  }

  const providerChain = [
    { provider: cfg.provider, model: cfg.model, apiKey: cfg.apiKey },
    ...cfg.failoverChain,
  ];

  let lastError = null;
  for (let i = 0; i < providerChain.length; i++) {
    const providerCfg = providerChain[i];
    const hasBackupProvider = i < providerChain.length - 1;
    // Cap primary attempt timeout cleanly when a live backup provider (e.g. Mistral) exists
    const perProviderTimeout = hasBackupProvider
      ? Math.min(effectiveTimeoutMs, 8000)
      : effectiveTimeoutMs;

    try {
      return await runSingleProviderStep({
        providerCfg,
        systemPrompt,
        messages,
        toolSchemas,
        continuationState: null,
        toolResults: [],
        timeoutMs: perProviderTimeout,
        allowModelFallbacks: false,
      });
    } catch (err) {
      lastError = err;
      if (!hasBackupProvider) {
        throw err;
      }
      // Groq is the sole configured provider; no cross-provider failover.
    }
  }

  throw lastError;
}

async function callOpenAiCompatibleStep({
  cfg,
  systemPrompt,
  messages,
  toolSchemas,
  continuationState,
  toolResults,
  timeoutMs,
}) {
  let chatMessages;
  if (continuationState?.chatMessages) {
    chatMessages = [
      ...continuationState.chatMessages,
      ...toolResults.map((entry) => ({
        role: "tool",
        tool_call_id: entry.id,
        name: entry.name,
        content: JSON.stringify(entry.result),
      })),
    ];
  } else {
    chatMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((msg) => ({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: String(msg.content || ""),
      })),
    ];
  }

  const endpoint = `${PROVIDER_DEFAULTS[cfg.provider].apiBase}/chat/completions`;
  const payload = {
    model: cfg.model,
    messages: chatMessages,
    tools: toolSchemas.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    })),
    tool_choice: "auto",
    temperature: 0.2,
    max_tokens: DEFAULT_MAX_TOKENS,
  };

  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    handleFetchError(err, cfg.provider);
  }

  const rawText = await res.text().catch(() => "");
  let parsed = null;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    throwForHttpStatus(
      res.status,
      cfg.provider,
      parsed?.error?.message || rawText
    );
  }

  const message = parsed?.choices?.[0]?.message;
  if (!message) {
    throw new ServiceError(
      `AI provider (${cfg.provider}) returned an empty completion.`,
      502
    );
  }

  const rawToolCalls = Array.isArray(message.tool_calls)
    ? message.tool_calls
    : [];
  const toolCalls = rawToolCalls.map((tc, index) => {
    let args = {};
    if (typeof tc?.function?.arguments === "string") {
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {
        args = {};
      }
    } else if (tc?.function?.arguments && typeof tc.function.arguments === "object") {
      args = tc.function.arguments;
    }
    return {
      id: tc?.id || `call_${index}`,
      name: tc?.function?.name || "",
      args,
    };
  });

  return {
    provider: cfg.provider,
    model: cfg.model,
    text: typeof message.content === "string" ? message.content.trim() : "",
    toolCalls,
    continuationState: {
      provider: cfg.provider,
      model: cfg.model,
      chatMessages: [...chatMessages, message],
    },
  };
}
