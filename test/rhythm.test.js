import test from 'node:test';
import assert from 'node:assert/strict';
import { RhythmDetector } from '../src/rhythm-detector.js';
import { DanceMotion, getDancePose } from '../src/dance-motion.js';

function spectrum(bass = 0, treble = 0) {
  const data = new Float32Array(1024).fill(-90);
  for (let i = 2; i < 11; i++) data[i] = bass > 0 ? 20 * Math.log10(bass) : -90;
  for (let i = 90; i < 130; i++) data[i] = treble > 0 ? 20 * Math.log10(treble) : -90;
  return data;
}

function play(detector, bpm, { start = 0, seconds = 10, step = 20, missed = false, hats = false } = {}) {
  const period = 60000 / bpm;
  let result;
  for (let offset = 0; offset < seconds * 1000; offset += step) {
    const phase = offset % period;
    const missing = missed && Math.floor(offset / period) % 7 === 5;
    const bass = !missing && phase < 160 ? 0.2 * Math.exp(-phase / 35) : 0;
    const treble = hats ? 0.012 * Math.exp(-(offset % (period / 2)) / 20) : 0;
    result = detector.update(spectrum(bass, treble), 0.01 + bass, 48000, start + offset);
  }
  return result;
}

for (const bpm of [60, 80, 90, 100, 120, 140, 160, 180, 200]) {
  test(`locks to a ${bpm} BPM rhythm`, () => {
    const result = play(new RhythmDetector(), bpm);
    assert.equal(result.active, true, JSON.stringify(result));
    assert.ok(Math.abs(result.bpm - bpm) <= 5, `${bpm}: ${JSON.stringify(result)}`);
  });
}

test('quiet offbeat hi-hats do not double the bass tempo', () => {
  const result = play(new RhythmDetector(), 100, { hats: true });
  assert.ok(Math.abs(result.bpm - 100) < 5, JSON.stringify(result));
});

test('a missing beat does not halve the tempo', () => {
  const result = play(new RhythmDetector(), 120, { missed: true });
  assert.equal(result.active, true);
  assert.ok(Math.abs(result.bpm - 120) < 5, JSON.stringify(result));
});

test('adapts when the song changes from 90 to 140 BPM', () => {
  const detector = new RhythmDetector();
  play(detector, 90);
  const result = play(detector, 140, { start: 10000, seconds: 10 });
  assert.ok(Math.abs(result.bpm - 140) < 5, JSON.stringify(result));
});

test('works at 30 FPS and with nonfinite silent bins', () => {
  const detector = new RhythmDetector();
  assert.equal(detector.update(new Float32Array(1024).fill(-Infinity), 0, 48000, 0).active, false);
  assert.ok(Math.abs(play(detector, 120, { start: 40, step: 1000 / 30 }).bpm - 120) < 5);
});

test('silence, steady noise, and isolated knocks do not start a dance', () => {
  for (const mode of ['silence', 'constant', 'knock']) {
    const detector = new RhythmDetector();
    for (let now = 0; now < 10000; now += 20) {
      const level = mode === 'constant' ? 0.08 : mode === 'knock' && now === 1000 ? 0.5 : 0;
      assert.equal(detector.update(spectrum(level), level, 48000, now).active, false, mode);
    }
  }
});

test('silence stops dancing and clears the previous tempo', () => {
  const detector = new RhythmDetector();
  play(detector, 120);
  let result;
  for (let now = 10000; now < 12500; now += 20) result = detector.update(spectrum(), 0, 48000, now);
  assert.equal(result.active, false);
  assert.equal(result.bpm, 0);
});

test('a time gap or manual reset requires reacquisition', () => {
  const detector = new RhythmDetector();
  play(detector, 120);
  assert.equal(detector.update(spectrum(0.2), 0.2, 48000, 30000).active, false);
  detector.reset();
  assert.equal(detector.snapshot(30000).bpm, 0);
  assert.equal(detector.onsets.length, 0);
});

test('dance clock follows the beat and fades back to the existing pose', () => {
  const motion = new DanceMotion();
  const rhythm = { bpm: 120, periodMs: 500, confidence: 1, beatTimeMs: 0, active: true, intensity: 0.6 };
  let result;
  for (let now = 0; now <= 5000; now += 20) result = motion.update(rhythm, now);
  assert.ok(result.mix > 0.99);
  assert.ok(Math.abs(result.beats - 10) < 0.1, `${result.beats}`);
  for (let now = 5020; now <= 7500; now += 20) result = motion.update(null, now);
  assert.equal(result.mix, 0);
});

test('joint angles stay bounded and choreography is continuous across phrases', () => {
  for (let beat = 0; beat < 48; beat += 0.125) {
    const pose = getDancePose(beat, 1);
    assert.ok(Math.abs(pose.x) <= 0.16);
    for (const values of Object.values(pose.rotations)) {
      assert.ok(values.every((angle) => Number.isFinite(angle) && Math.abs(angle) < Math.PI));
    }
  }
  for (const beat of [8, 16, 24]) {
    const before = getDancePose(beat - 0.00001, 1);
    const after = getDancePose(beat + 0.00001, 1);
    assert.ok(Math.abs(before.rotations.leftShoulder[2] - after.rotations.leftShoulder[2]) < 0.01);
  }
});

test('energetic choreography keeps the normal preset and clamps blend strength', () => {
  for (const beat of [0, 0.5, 4.25, 12.5, 20.75]) {
    assert.deepEqual(getDancePose(beat, 0.8), getDancePose(beat, 0.8, 0));
    assert.deepEqual(getDancePose(beat, 0.8, -1), getDancePose(beat, 0.8, 0));
    assert.deepEqual(getDancePose(beat, 0.8, 2), getDancePose(beat, 0.8, 1));
  }
});

test('energetic dance adds beat-timed jumps and alternating stronger kicks', () => {
  const landing = getDancePose(8, 1, 1);
  const left = getDancePose(8.5, 1, 1);
  const right = getDancePose(9.5, 1, 1);
  assert.ok(left.y - landing.y > 0.35);
  assert.ok(Math.abs(left.y - right.y) < 0.001, 'one jump per beat');
  assert.ok(left.rotations.leftThigh[0] < left.rotations.rightThigh[0] - 0.8);
  assert.ok(right.rotations.rightThigh[0] < right.rotations.leftThigh[0] - 0.8);
  assert.ok(Math.abs(left.yaw) > Math.abs(getDancePose(8.5, 1).yaw) * 2);
  assert.ok(getDancePose(0, 1, 1).rotations.leftShoulder[2] > 2, 'hands overhead');
});

test('energetic poses remain bounded and continuous through beats, phrases, and blends', () => {
  const values = pose => [pose.x, pose.y, pose.yaw, pose.roll, ...Object.values(pose.rotations).flat()];
  for (const energy of [0, 0.5, 1]) {
    for (let beat = 0; beat <= 48; beat += 0.125) {
      const pose = getDancePose(beat, 1, energy);
      assert.ok(Math.abs(pose.x) <= 0.281 && pose.y >= -0.081 && pose.y <= 0.401);
      assert.ok(values(pose).every(value => Number.isFinite(value) && Math.abs(value) < Math.PI));
    }
    for (let beat = 0; beat <= 48; beat++) {
      const before = values(getDancePose(beat - 0.00001, 1, energy));
      const after = values(getDancePose(beat + 0.00001, 1, energy));
      assert.ok(before.every((value, i) => Math.abs(value - after[i]) < 0.001), `boundary ${beat}`);
    }
  }
});

test('changing dance strength crossfades without resetting tempo, phase, or silence stopping', () => {
  const normal = new DanceMotion();
  const energetic = new DanceMotion();
  const rhythm = { bpm: 120, periodMs: 500, confidence: 1, beatTimeMs: 0, active: true, intensity: 0.6 };
  let previousEnergy = 0;
  for (let now = 0; now <= 8000; now += 20) {
    if (now === 2000) energetic.setEnergetic(true);
    if (now === 5000) energetic.setEnergetic(false);
    const input = now < 6000 ? rhythm : null;
    const baseline = normal.update(input, now);
    const result = energetic.update(input, now);
    assert.equal(result.beats, baseline.beats);
    assert.equal(result.mix, baseline.mix);
    assert.ok(Math.abs(result.energy - previousEnergy) < 0.06, 'no abrupt pose switch');
    previousEnergy = result.energy;
    if (now === 4000) assert.ok(result.energy > 0.99);
    if (now === 8000) { assert.ok(result.energy < 0.001); assert.equal(result.mix, 0); }
  }
});
