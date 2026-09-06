/** localStorage persistence with defensive parsing. */
const KEY = "circuitcoder.v1";

export function defaultSave() {
  return { unlocked: 1, stars: {}, sandbox: null };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return defaultSave();
    return {
      unlocked: Math.max(1, Math.min(500, data.unlocked | 0 || 1)),
      stars: data.stars && typeof data.stars === "object" ? data.stars : {},
      sandbox: data.sandbox ?? null,
    };
  } catch {
    return defaultSave();
  }
}

export function persistSave(save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // storage full / private mode — game still works in-memory
  }
}
