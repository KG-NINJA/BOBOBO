import test from 'node:test';
import assert from 'node:assert/strict';
import { getBeatIndicatorFrame, getBeatLevel } from '../src/beat-indicator.js';
import { RhythmDetector } from '../src/rhythm-detector.js';

const rhythm = { bpm: 120, periodMs: 500, confidence: 1, beatTimeMs: 0, intensity: 0.7, active: true };

test('beat indicator is off without music capture, even with a recent onset', () => {
  assert.deepEqual(getBeatIndicatorFrame(null, 1000, 1000), { state: 'off', pulse: 0 });
});

test('searching indicates real onsets without claiming a tempo lock', () => {
  const searching = { ...rhythm, active: false, bpm: 0 };
  assert.deepEqual(getBeatIndicatorFrame(searching, -Infinity, 1000), { state: 'searching', pulse: 0 });
  assert.deepEqual(getBeatIndicatorFrame(searching, 1000, 1000), { state: 'searching', pulse: 1 });
});

test('a detected onset pulses once, decays, and does not repeat on the BPM grid', () => {
  assert.equal(getBeatIndicatorFrame(rhythm, 1000, 1000).pulse, 1);
  assert.ok(getBeatIndicatorFrame(rhythm, 1000, 1120).pulse < 0.4);
  assert.ok(getBeatIndicatorFrame(rhythm, 1000, 1500).pulse < 0.02);
  assert.equal(getBeatIndicatorFrame(rhythm, 1000, 1600).pulse, 0);
  assert.equal(getBeatIndicatorFrame(rhythm, 1000, 2000).pulse, 0);
  assert.equal(getBeatIndicatorFrame(rhythm, 2000, 2000).pulse, 1);
});

test('invalid or future onset times cannot light the indicator', () => {
  for (const onset of [-Infinity, Infinity, NaN, 1001]) {
    assert.equal(getBeatIndicatorFrame(rhythm, onset, 1000).pulse, 0);
  }
  assert.equal(getBeatIndicatorFrame(rhythm, 1000, NaN).pulse, 0);
});

test('indicator follows actual detector onsets and stops on silence or reset', () => {
  const detector = new RhythmDetector();
  let result;
  let pulses = 0;
  for (let now = 0; now <= 5000; now += 20) {
    const amplitude = now < 3000 && now % 500 === 0 ? 0.2 : 0;
    const spectrum = new Float32Array(1024).fill(-90);
    if (amplitude) spectrum.fill(20 * Math.log10(amplitude), 2, 11);
    const detected = detector.update(spectrum, amplitude, 48000, now);
    result = getBeatIndicatorFrame(detected, detector.lastOnset, now);
    if (result.pulse === 1) pulses++;
    if (now === 2000) assert.equal(result.state, 'tracking');
    if (now >= 3200) assert.equal(result.pulse, 0);
  }
  assert.equal(pulses, 6);
  assert.equal(result.state, 'searching');
  detector.reset();
  assert.deepEqual(getBeatIndicatorFrame(detector.snapshot(5100), detector.lastOnset, 5100), { state: 'searching', pulse: 0 });
});

test('beat level distinguishes onset strengths and follows the pulse decay', () => {
  const weak = getBeatLevel(0.008, 1);
  const strong = getBeatLevel(0.12, 1);
  assert.ok(weak > 0 && weak < strong && strong < 100);
  assert.equal(getBeatLevel(0.12, 0), 0);
  assert.ok(getBeatLevel(0.12, 0.4) < strong / 2);
  assert.equal(getBeatLevel(0.18, 1), 100);
});

test('beat level clamps overflow and rejects missing or invalid input', () => {
  assert.equal(getBeatLevel(1000, 5), 100);
  for (const invalid of [NaN, Infinity, -Infinity, -1, 0]) {
    assert.equal(getBeatLevel(invalid, 1), 0);
    assert.equal(getBeatLevel(0.1, invalid), 0);
  }
});
