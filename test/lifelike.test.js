import test from "node:test";
import assert from "node:assert/strict";
import { createLifeState, registerPointer, registerTap } from "../src/lifelike-state.js";
import { chooseAction, scoreActions } from "../src/lifelike-brain.js";

test("low energy deterministically selects rest", () => {
  const state = createLifeState(0);
  state.needs.energy = 0.1;
  assert.equal(chooseAction(state, { now: 1, random: () => 0 }), "rest");
});

test("fast close pointer triggers startle reflex", () => {
  const state = createLifeState(0);
  registerPointer(state, { near: true, speed: 2, distance: 0.1, now: 10 });
  assert.equal(chooseAction(state, { now: 11, random: () => 0 }), "startle");
});

test("repeated pointer exposure reduces novelty", () => {
  const state = createLifeState(0);
  registerPointer(state, { near: true, speed: 0.1, distance: 0.2, now: 1 });
  const first = state.stimulus.novelty;
  for (let i = 0; i < 60; i++) {
    registerPointer(state, { near: true, speed: 0.1, distance: 0.2, now: 2 + i });
  }
  assert.ok(state.stimulus.novelty < first);
});

test("repeated taps raise stress after tolerance is exceeded", () => {
  const state = createLifeState(0);
  const initial = state.needs.stress;
  for (let i = 0; i < 6; i++) registerTap(state, i * 100);
  assert.ok(state.needs.stress > initial);
});

test("action scores remain bounded", () => {
  const state = createLifeState(0);
  const scores = scoreActions(state);
  for (const value of Object.values(scores)) {
    assert.ok(value >= 0 && value <= 1);
  }
});
