import test from "node:test";
import assert from "node:assert/strict";
import { CreatureController } from "../src/creature-controller.js";
import {
  INITIAL_STATS,
  applyStatChanges,
  loadMemory,
} from "../src/creature-state.js";

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function harness(random = () => 0.5) {
  let time = 1_000_000;
  const controller = new CreatureController({
    storage: storage(),
    now: () => time,
    random,
  });
  return {
    controller,
    advance(ms) {
      time += ms;
      return time;
    },
  };
}

test("stats are always clamped to 0..100", () => {
  const changed = applyStatChanges(INITIAL_STATS, { mood: 500, energy: -500 });
  assert.equal(changed.mood, 100);
  assert.equal(changed.energy, 0);
});

test("low energy becomes sleepy", () => {
  const h = harness();
  h.controller.memory.stats.energy = 20;
  h.controller.tick(h.advance(5000));
  assert.equal(h.controller.currentState, "sleepy");
});

test("sleeping restores energy", () => {
  const h = harness();
  h.controller.memory.stats.energy = 5;
  h.controller.memory.currentState = "sleeping";
  h.controller.tick(h.advance(100_000));
  assert.ok(h.controller.stats.energy > 5);
});

test("rapid taps under high stress become annoyed", () => {
  const h = harness(() => 0.2);
  h.controller.memory.stats.stress = 75;
  h.controller.handleTap();
  assert.equal(h.controller.currentState, "annoyed");
});

test("being left alone increases loneliness", () => {
  const h = harness();
  const before = h.controller.stats.loneliness;
  h.controller.tick(h.advance(60_000));
  assert.ok(h.controller.stats.loneliness > before);
});

test("returning produces a state-aware reaction", () => {
  const h = harness(() => 0.1);
  h.controller.memory.stats.trust = 80;
  h.controller.handleHidden();
  h.advance(20_000);
  h.controller.handleVisible();
  assert.equal(h.controller.currentState, "happy");
});

test("the same tap can produce varied reactions", () => {
  const happy = harness(() => 0.1).controller.handleTap();
  const curious = harness(() => 0.8).controller.handleTap();
  assert.notEqual(happy, curious);
});

test("corrupt localStorage falls back to safe defaults", () => {
  const broken = storage({ "bobobo.creature.memory.v1": "{broken" });
  assert.deepEqual(loadMemory(broken, 123).stats, INITIAL_STATS);
});
