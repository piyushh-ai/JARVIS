const globalForVoice = globalThis;
if (!globalForVoice._jarvisEsp32VoiceCatalogCache) globalForVoice._jarvisEsp32VoiceCatalogCache = new Map();
const cache = globalForVoice._jarvisEsp32VoiceCatalogCache;
const TTL_MS = 30000;

export function getCachedVoiceCatalog(homeId) {
  const entry = cache.get(String(homeId));
  if (!entry || entry.expiresAt <= Date.now()) {
    cache.delete(String(homeId));
    return null;
  }
  return entry.value;
}

export function setCachedVoiceCatalog(homeId, value) {
  cache.set(String(homeId), { value, expiresAt: Date.now() + TTL_MS });
  return value;
}

export function invalidateVoiceCatalog(homeId) {
  if (homeId) cache.delete(String(homeId));
  else cache.clear();
}
