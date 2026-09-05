import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Exercise the actual inline pose function with a lightweight rig, without WebGL.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = html.slice(html.indexOf('    function applyEmotionPose('), html.indexOf('    function applyCreatureStatePose('));
const apply = new Function('bones', 'face', 'character', 'creature', 'currentEmotion', 'snap', 'holdBurst', `${source}\napplyEmotionPose(1.25);`);
function node() {
  const vector = (initial) => ({ x: initial, y: initial, z: initial,
    set(x, y, z) { this.x = x; this.y = y; this.z = z; } });
  return { position: vector(0), rotation: vector(0), scale: vector(1), material: { opacity: 0.15 } };
}
function pose(displayEmotion, stateEmotion) {
  const bones = new Proxy({}, { get: (target, key) => target[key] ||= node() });
  const face = new Proxy({}, { get: (target, key) => target[key] ||= node() });
  const character = node();
  apply(bones, face, character, { currentEmotion: stateEmotion }, displayEmotion,
    (value, power = 1) => Math.tanh(value * power), () => 0);
  return JSON.parse(JSON.stringify({ bones: { ...bones }, face: { ...face }, character }));
}

test('dance display emotion does not snap the underlying pose at crossfade boundaries', () => {
  for (const emotion of ['calm', 'sad', 'anger', 'surprise', 'confusion', 'joy']) {
    assert.deepEqual(pose('joy', emotion), pose(emotion, emotion));
  }
});
