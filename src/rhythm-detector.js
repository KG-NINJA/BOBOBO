// No audio history is retained: only band levels and at most 24 onset times.
const MIN_PERIOD = 300; // 200 BPM
const MAX_PERIOD = 1000; // 60 BPM
const clamp01 = (/** @type {number} */ value) => Math.max(0, Math.min(1, value));

/** @typedef {{ time: number, strength: number }} Onset */
/** @typedef {{ bpm: number, confidence: number, periodMs: number, beatTimeMs: number, intensity: number, active: boolean }} Rhythm */

export class RhythmDetector {
  constructor() {
    this.lastTime = -Infinity;
    this.lastOnset = -Infinity;
    this.lastSound = -Infinity;
    this.previousBands = [0, 0, 0];
    this.fluxMean = 0;
    this.fluxDeviation = 0;
    this.level = 0;
    this.period = 0;
    this.confidence = 0;
    this.beatTime = 0;
    /** @type {Onset[]} */
    this.onsets = [];
  }

  reset() {
    this.lastTime = this.lastOnset = this.lastSound = -Infinity;
    this.previousBands.fill(0);
    this.fluxMean = this.fluxDeviation = this.level = 0;
    this.period = this.confidence = this.beatTime = 0;
    this.onsets.length = 0;
  }

  /** @param {Float32Array} spectrum Decibels, as returned by AnalyserNode.
   * @param {number} rms @param {number} sampleRate @param {number} now */
  update(spectrum, rms, sampleRate, now) {
    if (!Number.isFinite(now) || !Number.isFinite(rms) || !Number.isFinite(sampleRate) || sampleRate <= 0) {
      return this.snapshot(this.lastTime);
    }
    if (now <= this.lastTime) return this.snapshot(this.lastTime);
    // A background tab / interrupted input must acquire a new beat, not reuse it.
    if (now - this.lastTime > 1000) this.reset();
    const dt = Number.isFinite(this.lastTime) ? now - this.lastTime : 20;
    this.lastTime = now;
    const bands = this.bandLevels(spectrum, sampleRate);
    const flux = bands.reduce((sum, value, i) =>
      sum + Math.max(0, value - this.previousBands[i]) * [3, 1, 0.3][i], 0);
    this.previousBands = bands;
    const threshold = Math.max(0.004, this.fluxMean * 1.5 + this.fluxDeviation * 0.7);
    const smoothing = 1 - Math.exp(-dt / 700);
    this.fluxDeviation += (Math.abs(flux - this.fluxMean) - this.fluxDeviation) * smoothing;
    this.fluxMean += (flux - this.fluxMean) * smoothing;
    this.level += (clamp01(rms * 6) - this.level) * (1 - Math.exp(-dt / 180));
    if (rms >= 0.006) this.lastSound = now;
    if (rms >= 0.006 && flux > threshold && now - this.lastOnset >= 230) {
      this.lastOnset = now;
      this.onsets = this.onsets.filter((onset) => now - onset.time < 8000);
      this.onsets.push({ time: now, strength: flux });
      this.onsets = this.onsets.slice(-24);
      this.estimateTempo(now);
    }
    if (now - this.lastOnset > 2400 || now - this.lastSound > Math.max(1000, this.period * 2)) {
      this.period = 0;
      this.confidence = 0;
      this.onsets = [];
    }
    return this.snapshot(now);
  }

  /** @param {Float32Array} spectrum @param {number} sampleRate */
  bandLevels(spectrum, sampleRate) {
    const sums = [0, 0, 0];
    const counts = [0, 0, 0];
    const binHz = sampleRate / (2 * spectrum.length);
    for (let i = Math.max(1, Math.ceil(40 / binHz)); i < spectrum.length; i++) {
      const hz = i * binHz;
      if (hz > 8000) break;
      const band = hz < 250 ? 0 : hz < 2000 ? 1 : 2;
      const db = spectrum[i];
      const amplitude = Number.isFinite(db) ? 10 ** (Math.min(0, db) / 20) : 0;
      sums[band] += amplitude * amplitude;
      counts[band]++;
    }
    return sums.map((sum, i) => Math.sqrt(sum / Math.max(1, counts[i])));
  }

  /** @param {number} now */
  estimateTempo(now) {
    const recent = this.onsets.slice(-9);
    if (recent.length < 4) return;
    const intervals = recent.slice(1).map((onset, i) => ({
      gap: onset.time - recent[i].time,
      weight: Math.sqrt(onset.strength * recent[i].strength),
    }));
    let bestScore = -Infinity;
    let bestPeriod = 0;
    let bestConfidence = 0;
    for (const interval of intervals) {
      for (let divisor = 1; divisor <= 3; divisor++) {
        const candidate = interval.gap / divisor;
        if (candidate < MIN_PERIOD - 20 || candidate > MAX_PERIOD + 20) continue;
        let support = 0;
        let total = 0;
        let matches = 0;
        for (const { gap, weight } of intervals) {
          const multiple = Math.max(1, Math.round(gap / candidate));
          const error = Math.abs(gap - multiple * candidate) / candidate;
          const fit = error < 0.12 && multiple <= 3 ? (1 - error / 0.12) / Math.sqrt(multiple) : 0;
          support += fit * weight;
          total += weight;
          if (fit > 0.45) matches++;
        }
        const confidence = support / Math.max(total, 0.00001);
        const continuity = this.period && Math.abs(candidate - this.period) / this.period < 0.08 ? 0.04 : 0;
        if (matches >= 3 && confidence + continuity > bestScore) {
          bestScore = confidence + continuity;
          bestConfidence = confidence;
          bestPeriod = Math.max(MIN_PERIOD, Math.min(MAX_PERIOD, candidate));
        }
      }
    }
    if (bestConfidence < 0.66) {
      this.confidence *= 0.8;
      return;
    }
    const previous = this.period;
    this.period = previous && Math.abs(bestPeriod - previous) / previous < 0.12
      ? previous * 0.75 + bestPeriod * 0.25 : bestPeriod;
    this.confidence = bestConfidence;
    if (!previous || Math.abs(previous - this.period) / previous > 0.12) {
      this.beatTime = now;
    } else {
      const predicted = this.beatTime + Math.round((now - this.beatTime) / this.period) * this.period;
      if (Math.abs(now - predicted) < this.period * 0.18) {
        this.beatTime = predicted + (now - predicted) * 0.35;
      }
    }
  }

  /** @param {number} now @returns {Rhythm} */
  snapshot(now) {
    return {
      bpm: this.period ? Math.round(60000 / this.period) : 0,
      confidence: this.confidence,
      periodMs: this.period,
      beatTimeMs: this.beatTime,
      intensity: Math.max(0.25, this.level),
      active: this.period > 0 && this.confidence >= 0.6 &&
        now - this.lastOnset < Math.min(2200, this.period * 2.5) && now - this.lastSound < Math.max(650, this.period * 1.6),
    };
  }
}
