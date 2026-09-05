/** A continuous beat clock; microphone jitter must not snap the skeleton. */
export class DanceMotion {
  constructor() {
    this.beats = 0;
    this.mix = 0;
    this.lastTime = -1;
    this.period = 500;
    this.intensity = 0.3;
    this.energetic = false;
    this.energy = 0;
  }

  /** Changes choreography only; the audio session and beat clock keep running.
   * @param {boolean} enabled */
  setEnergetic(enabled) {
    this.energetic = enabled;
  }

  /** @param {import('./rhythm-detector.js').Rhythm | null} rhythm @param {number} now */
  update(rhythm, now) {
    const dt = this.lastTime < 0 ? 0 : Math.max(0, Math.min(100, now - this.lastTime));
    this.lastTime = now;
    if (rhythm?.active) {
      this.period += (rhythm.periodMs - this.period) * (1 - Math.exp(-dt / 250));
      this.intensity += (rhythm.intensity - this.intensity) * (1 - Math.exp(-dt / 200));
    }
    this.beats += dt / this.period;
    if (rhythm?.active) {
      const phase = (now - rhythm.beatTimeMs) / rhythm.periodMs;
      const error = ((phase - this.beats) % 1 + 1.5) % 1 - 0.5;
      this.beats += error * (1 - Math.exp(-dt / 130));
    }
    this.mix += ((rhythm?.active ? 1 : 0) - this.mix) * (1 - Math.exp(-dt / 220));
    if (this.mix < 0.001) this.mix = 0;
    this.energy += ((this.energetic ? 1 : 0) - this.energy) * (1 - Math.exp(-dt / 360));
    return { beats: this.beats, mix: this.mix, intensity: this.intensity, energy: this.energy };
  }
}

/** @param {number} beats @param {number} intensity @param {number} energy */
export function getDancePose(beats, intensity, energy = 0) {
  const strength = 0.5 + Math.max(0, Math.min(1, intensity)) * 0.5;
  const pulse = (1 + Math.cos(beats * Math.PI * 2)) / 2;
  const side = Math.sin(beats * Math.PI);
  const phrase = beats / 8;
  const style = ((Math.floor(phrase) % 3) + 3) % 3;
  const next = (style + 1) % 3;
  const blend = (1 - Math.cos((phrase - Math.floor(phrase)) * Math.PI)) / 2;
  const reach = [0.15, 1.2, 0.5][style] * (1 - blend) + [0.15, 1.2, 0.5][next] * blend;
  const pose = {
    x: side * 0.16 * strength,
    y: -pulse * 0.08 * strength,
    yaw: side * 0.18 * strength,
    roll: side * 0.07 * strength,
    /** @type {Record<string, [number, number, number]>} */
    rotations: {
      hips: [0, -side * 0.12, 0],
      abdomen: [0.04 + pulse * 0.06, side * 0.1, -side * 0.08],
      chest: [-0.05, side * 0.18, side * 0.07],
      neck: [pulse * 0.08, 0, 0],
      head: [0.04 + pulse * 0.12, -side * 0.12, side * 0.1],
      leftShoulder: [side * 0.5, 0, 0.4 + reach + pulse * 0.2],
      rightShoulder: [-side * 0.5, 0, -0.4 - reach - pulse * 0.2],
      leftElbow: [-0.85 - side * 0.35, 0, 0],
      rightElbow: [-0.85 + side * 0.35, 0, 0],
      leftThigh: [-0.15 - pulse * 0.18 + side * 0.16, 0, 0.04],
      rightThigh: [-0.15 - pulse * 0.18 - side * 0.16, 0, -0.04],
      leftKnee: [0.2 + pulse * 0.3 - side * 0.08, 0, 0],
      rightKnee: [0.2 + pulse * 0.3 + side * 0.08, 0, 0],
      leftFoot: [-pulse * 0.08, 0, 0],
      rightFoot: [-pulse * 0.08, 0, 0],
    },
  };
  const power = Math.max(0, Math.min(1, energy));
  if (!power) return pose;

  // Three smoothly connected phrases: overhead pumps, alternating kicks, wide arm sweeps.
  const overhead = [2.35, 0.95, 2.6][style] * (1 - blend) + [2.35, 0.95, 2.6][next] * blend;
  const kicks = [0.3, 1.05, 0.55][style] * (1 - blend) + [0.3, 1.05, 0.55][next] * blend;
  const leftStep = Math.max(0, side) ** 2;
  const rightStep = Math.max(0, -side) ** 2;
  const jump = Math.sin(beats * Math.PI) ** 2;
  const pump = Math.sin(beats * Math.PI * 2);
  const energetic = {
    x: side * 0.28 * strength,
    y: jump * (0.3 + 0.1 * strength) - pulse * 0.035,
    yaw: side * 0.48 * strength,
    roll: side * 0.13 * strength,
    /** @type {Record<string, [number, number, number]>} */
    rotations: {
      hips: [0.04 + pulse * 0.1, -side * 0.3, side * 0.06],
      abdomen: [0.08 + pulse * 0.16, side * 0.18, -side * 0.15],
      chest: [-0.12 + pump * 0.12, side * 0.4, side * 0.13],
      neck: [pulse * 0.14, 0, -side * 0.06],
      head: [-0.06 + pulse * 0.34, -side * 0.3, side * 0.15],
      leftShoulder: [-0.2 + side * 1.0, side * 0.18, overhead + pump * 0.3],
      rightShoulder: [-0.2 - side * 1.0, -side * 0.18, -overhead - pump * 0.3],
      leftElbow: [-1.1 - side * 0.55, 0, 0],
      rightElbow: [-1.1 + side * 0.55, 0, 0],
      leftThigh: [-0.12 - pulse * 0.22 - leftStep * kicks, 0, 0.09 + leftStep * 0.18],
      rightThigh: [-0.12 - pulse * 0.22 - rightStep * kicks, 0, -0.09 - rightStep * 0.18],
      leftKnee: [0.24 + pulse * 0.42 + leftStep * 0.2, 0, 0],
      rightKnee: [0.24 + pulse * 0.42 + rightStep * 0.2, 0, 0],
      leftFoot: [-pulse * 0.13 - leftStep * 0.2, 0, 0],
      rightFoot: [-pulse * 0.13 - rightStep * 0.2, 0, 0],
    },
  };
  for (const key of /** @type {const} */ (['x', 'y', 'yaw', 'roll'])) {
    pose[key] += (energetic[key] - pose[key]) * power;
  }
  for (const name of Object.keys(pose.rotations)) {
    for (let axis = 0; axis < 3; axis++) {
      pose.rotations[name][axis] += (energetic.rotations[name][axis] - pose.rotations[name][axis]) * power;
    }
  }
  return pose;
}
