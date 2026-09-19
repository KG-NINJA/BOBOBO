import { ACTIONS, clamp01 } from "./lifelike-state.js";

function remember(state, action, now) {
  state.action = ACTIONS.includes(action) ? action : "idle";
  state.actionUntil = now;
  state.memory.lastActionAt = now;
  state.memory.recentActions.push(state.action);
  state.memory.recentActions = state.memory.recentActions.slice(-8);
  return state.action;
}

export function scoreActions(state) {
  const n = state.needs;
  const t = state.temperament;
  const s = state.stimulus;
  const repeated = state.memory.recentActions;
  const repetitionPenalty = action =>
    repeated.slice(-3).filter(item => item === action).length * 0.12;

  const scores = {
    idle: 0.26 + n.safety * 0.18 + (1 - n.arousal) * 0.18,
    observe: 0.12 + s.novelty * 0.52 + n.curiosity * 0.36 + (s.pointerNear ? 0.18 : 0),
    approach: 0.05 + (s.pointerNear ? 0.2 : 0) + n.curiosity * 0.28 + t.boldness * 0.24 + t.sociability * 0.18 - n.stress * 0.52,
    retreat: 0.02 + n.stress * 0.72 + (1 - n.safety) * 0.58 + Math.min(0.3, s.pointerSpeed * 0.18),
    play: 0.03 + t.playfulness * 0.32 + n.energy * 0.22 + n.arousal * 0.22 + (s.taps > 0 ? 0.18 : 0) - n.stress * 0.38,
    rest: 0.02 + (1 - n.energy) * 0.9 + (1 - n.arousal) * 0.12,
    startle: s.pointerNear && s.pointerSpeed > 1.1 && s.distance < 0.35
      ? 0.78 + t.sensitivity * 0.18
      : 0,
  };

  for (const action of Object.keys(scores)) {
    scores[action] = clamp01(scores[action] - repetitionPenalty(action));
  }
  return scores;
}

export function chooseAction(state, { now = performance.now?.() ?? Date.now(), random = Math.random } = {}) {
  const scores = scoreActions(state);

  // Hard physiological/safety reflexes remain deterministic.
  if (state.needs.energy < 0.16) return remember(state, "rest", now);
  if (scores.startle > 0.8) return remember(state, "startle", now);
  if (state.needs.stress > 0.72) return remember(state, "retreat", now);

  const candidates = Object.entries(scores)
    .filter(([action]) => action !== "startle")
    .sort((a, b) => b[1] - a[1]);

  // Soft stochasticity prevents repetitive mechanical behavior while staying state-driven.
  const top = candidates.slice(0, 3);
  const weights = top.map(([, score], index) => Math.max(0.02, score - index * 0.04));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = random() * total;
  for (let i = 0; i < top.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return remember(state, top[i][0], now);
  }
  return remember(state, top[0]?.[0] ?? "idle", now);
}

export async function chooseActionWithAdvisor(state, advisor, options = {}) {
  if (typeof advisor !== "function") return chooseAction(state, options);
  const scores = scoreActions(state);
  const allowed = Object.keys(scores).filter(action => action !== "startle");
  try {
    const proposed = await advisor({
      state: structuredClone ? structuredClone(state) : JSON.parse(JSON.stringify(state)),
      candidates: allowed.map(action => ({ action, localScore: scores[action] })),
    });
    if (allowed.includes(proposed?.action) && state.needs.stress < 0.72 && state.needs.energy >= 0.16) {
      return remember(state, proposed.action, options.now ?? Date.now());
    }
  } catch {}
  return chooseAction(state, options);
}
