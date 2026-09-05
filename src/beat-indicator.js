/** One decaying pulse per detected onset, never a free-running BPM animation.
 * Pass null when the music microphone is not listening.
 * @param {import('./rhythm-detector.js').Rhythm | null} rhythm
 * @param {number} lastOnsetMs @param {number} now
 * @returns {{ state: 'off' | 'searching' | 'tracking', pulse: number }} */
export function getBeatIndicatorFrame(rhythm, lastOnsetMs, now) {
  if (!rhythm) return { state: 'off', pulse: 0 };
  const age = now - lastOnsetMs;
  const pulse = Number.isFinite(age) && age >= 0 && age < 600 ? Math.exp(-age / 120) : 0;
  return { state: rhythm.active ? 'tracking' : 'searching', pulse };
}

/** Relative onset strength, not calibrated loudness or tempo confidence.
 * @param {number} strength @param {number} pulse */
export function getBeatLevel(strength, pulse) {
  if (!Number.isFinite(strength) || !Number.isFinite(pulse) || strength <= 0 || pulse <= 0) return 0;
  const normalized = Math.min(1, Math.sqrt(strength / 0.18));
  return Math.round(normalized * Math.min(1, pulse) * 100);
}
