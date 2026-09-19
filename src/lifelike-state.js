export const ACTIONS = Object.freeze([
  "idle",
  "observe",
  "approach",
  "retreat",
  "play",
  "rest",
  "startle",
]);

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));

export function createLifeState(now = performance.now?.() ?? Date.now()) {
  return {
    version: 1,
    action: "idle",
    actionUntil: now,
    needs: {
      energy: 0.78,
      safety: 0.86,
      curiosity: 0.72,
      social: 0.48,
      arousal: 0.24,
      stress: 0.08,
    },
    temperament: {
      boldness: 0.56,
      sociability: 0.62,
      playfulness: 0.74,
      sensitivity: 0.52,
    },
    stimulus: {
      pointerNear: false,
      pointerSpeed: 0,
      distance: 1,
      taps: 0,
      lastTapAgeMs: Infinity,
      novelty: 0,
    },
    memory: {
      interactionCount: 0,
      repeatedPointerExposure: 0,
      lastStimulusAt: now,
      lastActionAt: now,
      recentActions: [],
    },
  };
}

export function updateNeeds(state, dtSec) {
  const n = state.needs;
  const resting = state.action === "rest";
  n.energy = clamp01(n.energy + (resting ? 0.035 : -0.0045) * dtSec);
  n.arousal = clamp01(n.arousal - 0.08 * dtSec);
  n.stress = clamp01(n.stress - 0.025 * dtSec);
  n.curiosity = clamp01(n.curiosity + 0.012 * dtSec);
  n.social = clamp01(n.social + 0.004 * dtSec);
  n.safety = clamp01(n.safety + 0.02 * dtSec);
  return state;
}

export function registerPointer(state, { near, speed = 0, distance = 1, now }) {
  const s = state.stimulus;
  const wasNear = s.pointerNear;
  s.pointerNear = Boolean(near);
  s.pointerSpeed = Math.max(0, Number(speed) || 0);
  s.distance = clamp01(distance);

  if (s.pointerNear) {
    state.memory.repeatedPointerExposure = Math.min(100, state.memory.repeatedPointerExposure + 1);
    const habituation = Math.min(0.8, state.memory.repeatedPointerExposure / 80);
    s.novelty = clamp01((wasNear ? 0.35 : 0.9) * (1 - habituation));
    state.needs.arousal = clamp01(state.needs.arousal + s.novelty * 0.18 + Math.min(0.25, s.pointerSpeed * 0.12));
    state.needs.curiosity = clamp01(state.needs.curiosity + s.novelty * 0.08);
    state.memory.lastStimulusAt = now;
  } else {
    s.novelty = clamp01(s.novelty - 0.08);
    state.memory.repeatedPointerExposure = Math.max(0, state.memory.repeatedPointerExposure - 0.08);
  }

  if (s.pointerSpeed > 1.1 && s.distance < 0.35) {
    state.needs.stress = clamp01(state.needs.stress + 0.28 * state.temperament.sensitivity);
    state.needs.safety = clamp01(state.needs.safety - 0.2);
  }
  return state;
}

export function registerTap(state, now) {
  state.stimulus.taps = Math.min(12, state.stimulus.taps + 1);
  state.stimulus.lastTapAgeMs = 0;
  state.memory.interactionCount += 1;
  state.memory.lastStimulusAt = now;
  state.needs.social = clamp01(state.needs.social - 0.08);
  state.needs.arousal = clamp01(state.needs.arousal + 0.16);
  if (state.stimulus.taps >= 4) {
    state.needs.stress = clamp01(state.needs.stress + 0.08);
    state.needs.safety = clamp01(state.needs.safety - 0.07);
  }
  return state;
}

export function ageStimulus(state, dtMs) {
  state.stimulus.lastTapAgeMs += dtMs;
  if (state.stimulus.lastTapAgeMs > 1800) {
    state.stimulus.taps = Math.max(0, state.stimulus.taps - dtMs / 1400);
  }
  state.stimulus.novelty = clamp01(state.stimulus.novelty - dtMs / 18000);
  return state;
}

export function snapshot(state) {
  return JSON.parse(JSON.stringify(state));
}

export { clamp01 };
