import { VALID_SCENE_IDS } from "@/lib/scenes/sceneDefinitions";
import { verifyHomeMembership } from "@/services/ai/homeContextService";
import { executeScene } from "@/services/sceneService";

/**
 * Executes a Smart Scene preset through the existing authenticated scene pipeline
 * (`executeScene` -> `toggleDeviceById` -> `Command` queue) with role checks.
 */
export async function executeSmartSceneTool({
  homeId,
  userId,
  sceneId,
  idempotencyKey,
} = {}) {
  await verifyHomeMembership({
    homeId,
    userId,
    allowedRoles: ["owner", "admin", "member"],
  });

  const normalized =
    typeof sceneId === "string" ? sceneId.trim().toLowerCase() : "";
  if (!VALID_SCENE_IDS.includes(normalized)) {
    return {
      executed: false,
      status: "failed",
      error: `Invalid sceneId "${sceneId}". Allowed scenes: ${VALID_SCENE_IDS.join(", ")}`,
    };
  }

  try {
    const execution = await executeScene(normalized, {
      homeId,
      ownerId: userId,
      idempotencyKey,
    });

    return {
      executed: true,
      status: execution.outcome === "partial" ? "partial" : "queued",
      sceneId: execution.scene.id,
      sceneName: execution.scene.name,
      queuedCount: execution.queuedCount,
      failedCount: execution.failedCount,
      idempotentReplayCount: execution.idempotentReplayCount,
      hardwareConfirmed: false,
      note: "Scene commands have been queued for ESP32 execution; physical reportedState updates only after hardware ACK.",
      results: execution.results,
      devices: execution.devices,
    };
  } catch (err) {
    return {
      executed: false,
      status: "failed",
      sceneId: normalized,
      error: err?.message || "Failed to execute smart scene",
      details: Array.isArray(err?.errors) ? err.errors : [],
    };
  }
}

