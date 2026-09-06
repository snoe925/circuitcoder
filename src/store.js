/** localStorage persistence with defensive parsing. */
const KEY = "circuitcoder.v1";

export function defaultSave() {
  return {
    unlocked: 1, stars: {}, sandbox: null, freePlay: false,
    cmos: { unlocked: 1, stars: {}, playground: null },
    analog: { unlocked: 1, stars: {}, playground: null },
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return defaultSave();
    const cmos = data.cmos && typeof data.cmos === "object" ? data.cmos : {};
    const analog = data.analog && typeof data.analog === "object" ? data.analog : {};
    const sub = (s) => ({
      unlocked: Math.max(1, Math.min(500, s.unlocked | 0 || 1)),
      stars: s.stars && typeof s.stars === "object" ? s.stars : {},
      playground: s.playground ?? null,
    });
    return {
      unlocked: Math.max(1, Math.min(500, data.unlocked | 0 || 1)),
      stars: data.stars && typeof data.stars === "object" ? data.stars : {},
      sandbox: data.sandbox ?? null,
      freePlay: data.freePlay === true,
      cmos: sub(cmos),
      analog: sub(analog),
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
