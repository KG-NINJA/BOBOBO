export const STAT_KEYS = Object.freeze([
  "mood",
  "energy",
  "curiosity",
  "trust",
  "stress",
  "loneliness",
]);

export const CREATURE_STATES = Object.freeze([
  "idle",
  "curious",
  "happy",
  "startled",
  "annoyed",
  "lonely",
  "sleepy",
  "sleeping",
  "wandering",
  "watching",
  "excited",
]);

export const INITIAL_STATS = Object.freeze({
  mood: 60,
  energy: 75,
  curiosity: 65,
  trust: 20,
  stress: 10,
  loneliness: 20,
});

export const STATE_TO_EMOTION = Object.freeze({
  idle: "calm",
  curious: "confusion",
  happy: "joy",
  startled: "surprise",
  annoyed: "anger",
  lonely: "sad",
  sleepy: "calm",
  sleeping: "calm",
  wandering: "calm",
  watching: "confusion",
  excited: "joy",
});

export const STATE_LABELS = Object.freeze({
  idle: "のんびりしている",
  curious: "気になっている",
  happy: "うれしそう",
  startled: "びっくりした",
  annoyed: "少し警戒している",
  lonely: "さみしそう",
  sleepy: "ねむそう",
  sleeping: "眠っている",
  wandering: "ぶらぶらしている",
  watching: "こちらを見ている",
  excited: "大よろこび",
});

const MEMORY_KEY = "bobobo.creature.memory.v1";

export function clamp(value, min = 0, max = 100) {
  const number = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(number) ? number : min));
}

export function clampStats(stats = {}) {
  return Object.fromEntries(
    STAT_KEYS.map((key) => [key, clamp(stats[key] ?? INITIAL_STATS[key])]),
  );
}

export function createDefaultMemory(now = Date.now()) {
  return {
    version: 1,
    stats: { ...INITIAL_STATS },
    currentState: "idle",
    lastVisitAt: now,
    totalInteractions: 0,
    recentEvents: [],
  };
}

export function sanitizeMemory(value, now = Date.now()) {
  if (!value || value.version !== 1 || typeof value !== "object") {
    return createDefaultMemory(now);
  }
  const recentEvents = Array.isArray(value.recentEvents)
    ? value.recentEvents
        .filter(
          (event) =>
            event &&
            typeof event.type === "string" &&
            /^[a-z0-9_]{1,32}$/.test(event.type) &&
            Number.isFinite(event.timestamp),
        )
        .slice(-10)
        .map(({ type, timestamp }) => ({ type, timestamp }))
    : [];
  return {
    version: 1,
    stats: clampStats(value.stats),
    currentState: CREATURE_STATES.includes(value.currentState)
      ? value.currentState
      : "idle",
    lastVisitAt: Number.isFinite(value.lastVisitAt) ? value.lastVisitAt : now,
    totalInteractions: Math.max(
      0,
      Math.floor(Number(value.totalInteractions) || 0),
    ),
    recentEvents,
  };
}

export function loadMemory(storage = globalThis.localStorage, now = Date.now()) {
  try {
    const raw = storage?.getItem(MEMORY_KEY);
    return raw ? sanitizeMemory(JSON.parse(raw), now) : createDefaultMemory(now);
  } catch {
    return createDefaultMemory(now);
  }
}

export function saveMemory(memory, storage = globalThis.localStorage) {
  try {
    storage?.setItem(MEMORY_KEY, JSON.stringify(sanitizeMemory(memory)));
    return true;
  } catch {
    return false;
  }
}

export function clearMemory(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(MEMORY_KEY);
    return true;
  } catch {
    return false;
  }
}

export function applyStatChanges(stats, changes = {}) {
  const next = { ...stats };
  for (const key of STAT_KEYS) {
    if (Number.isFinite(changes[key])) {
      next[key] = clamp(next[key] + changes[key]);
    }
  }
  return next;
}

export { MEMORY_KEY };
