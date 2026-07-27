import {
  CREATURE_STATES,
  STATE_TO_EMOTION,
  applyStatChanges,
  clearMemory,
  createDefaultMemory,
  loadMemory,
  saveMemory,
} from "./creature-state.js";

const EVENT_LIFETIME_MS = 10 * 60_000;

export class CreatureController {
  constructor({
    storage = globalThis.localStorage,
    now = () => Date.now(),
    random = Math.random,
    onChange = () => {},
  } = {}) {
    this.storage = storage;
    this.now = now;
    this.random = random;
    this.onChange = onChange;
    this.memory = loadMemory(storage, now());
    this.stateUntil = 0;
    this.lastTickAt = now();
    this.lastInteractionAt = now();
    this.hiddenAt = null;
    this.tapTimes = [];
    this.lastLoudSoundAt = 0;
    this.lastSource = "local";
    this.lastEvent = this.memory.recentEvents.at(-1)?.type ?? "page_load";
    this.pointer = { x: 0, y: 0, near: false };
  }

  get stats() {
    return this.memory.stats;
  }

  get currentState() {
    return this.memory.currentState;
  }

  get currentEmotion() {
    return STATE_TO_EMOTION[this.currentState];
  }

  snapshot() {
    return {
      currentState: this.currentState,
      currentEmotion: this.currentEmotion,
      stats: { ...this.stats },
      recentEvents: this.memory.recentEvents.map((event) => ({
        type: event.type,
        ageSeconds: Math.max(0, Math.round((this.now() - event.timestamp) / 1000)),
      })),
      totalInteractions: this.memory.totalInteractions,
      lastEvent: this.lastEvent,
      source: this.lastSource,
      pointer: { ...this.pointer },
    };
  }

  emit() {
    this.memory.lastVisitAt = this.now();
    saveMemory(this.memory, this.storage);
    this.onChange(this.snapshot());
  }

  addEvent(type) {
    const timestamp = this.now();
    this.lastEvent = type;
    this.memory.recentEvents = this.memory.recentEvents
      .filter((event) => timestamp - event.timestamp < EVENT_LIFETIME_MS)
      .concat({ type, timestamp })
      .slice(-10);
  }

  adjust(changes) {
    this.memory.stats = applyStatChanges(this.stats, changes);
  }

  transition(state, durationMs = 3500, source = "local") {
    if (!CREATURE_STATES.includes(state)) state = "idle";
    this.memory.currentState = state;
    this.stateUntil = this.now() + Math.max(1000, Math.min(10_000, durationMs));
    this.lastSource = source;
    this.emit();
    return state;
  }

  handleTap() {
    const now = this.now();
    this.tapTimes = this.tapTimes.filter((time) => now - time < 2400);
    this.tapTimes.push(now);
    const taps = this.tapTimes.length;
    this.lastInteractionAt = now;
    this.memory.totalInteractions += 1;
    this.addEvent(taps >= 3 ? "rapid_tap" : "tap");
    this.adjust({
      trust: taps > 5 ? 0 : 1.5,
      loneliness: -3,
      mood: taps > 6 ? -1 : 1,
      stress: taps >= 3 ? 1 + taps * 0.9 : -0.5,
    });

    let state;
    const annoyanceThreshold = 5 + Math.floor(this.random() * 3);
    if (this.stats.stress > 70 || taps >= annoyanceThreshold) {
      state = "annoyed";
    } else if (this.stats.energy < 20) {
      state = "sleepy";
    } else {
      const roll = this.random();
      const happyChance = this.stats.trust > 60 ? 0.72 : 0.62;
      state = roll < happyChance ? "happy" : roll < 0.9 ? "curious" : "annoyed";
    }
    return this.transition(state, 2600 + this.random() * 1800);
  }

  setPointer({ x, y, near }) {
    this.pointer = {
      x: Math.max(-1, Math.min(1, Number(x) || 0)),
      y: Math.max(-1, Math.min(1, Number(y) || 0)),
      near: Boolean(near),
    };
    if (near && this.lastEvent !== "pointer_near") {
      this.addEvent("pointer_near");
    }
  }

  handleLoudSound(volume) {
    const now = this.now();
    if (now - this.lastLoudSoundAt < 5000) return false;
    this.lastLoudSoundAt = now;
    this.addEvent("loud_sound");
    this.adjust({ stress: 8 + Math.min(5, volume * 10), mood: -2 });
    this.transition("startled", 2600);
    return true;
  }

  handleMicrophoneDenied() {
    this.addEvent("microphone_denied");
    this.emit();
  }

  handleHidden() {
    this.hiddenAt = this.now();
    this.addEvent("tab_hidden");
    this.emit();
  }

  handleVisible() {
    const now = this.now();
    const awayMs = this.hiddenAt ? now - this.hiddenAt : now - this.memory.lastVisitAt;
    this.hiddenAt = null;
    this.addEvent("window_return");
    if (awayMs > 10_000) {
      this.adjust({
        loneliness: Math.min(8, awayMs / 120_000),
        energy: this.currentState === "sleeping" ? Math.min(12, awayMs / 60_000) : 0,
      });
      const state =
        this.stats.loneliness > 65
          ? "excited"
          : this.stats.trust > 55 && this.random() < 0.75
            ? "happy"
            : this.currentState === "sleeping"
              ? "sleepy"
              : "watching";
      this.transition(state, 3500 + this.random() * 1800);
    } else {
      this.emit();
    }
  }

  tick(now = this.now()) {
    const elapsedSeconds = Math.max(0, Math.min(300, (now - this.lastTickAt) / 1000));
    this.lastTickAt = now;
    if (!elapsedSeconds) return this.currentState;

    const sleeping = this.currentState === "sleeping";
    const idleSeconds = Math.max(0, (now - this.lastInteractionAt) / 1000);
    this.adjust({
      energy: sleeping ? elapsedSeconds * 0.12 : -elapsedSeconds * 0.018,
      loneliness: idleSeconds > 20 ? elapsedSeconds * 0.025 : 0,
      stress: -elapsedSeconds * 0.025,
      curiosity: (this.random() - 0.5) * elapsedSeconds * 0.018,
    });

    if (now < this.stateUntil) {
      this.emit();
      return this.currentState;
    }

    let next = "idle";
    if (this.stats.energy < 12) next = "sleeping";
    else if (this.stats.energy < 25) next = "sleepy";
    else if (this.stats.loneliness > 72) next = "lonely";
    else if (idleSeconds > 45) {
      const roll = this.random();
      next = roll < 0.38 ? "wandering" : roll < 0.7 ? "watching" : "idle";
      this.addEvent("idle");
    } else if (this.pointer.near && this.stats.curiosity > 55 && this.random() < 0.35) {
      next = "watching";
    }
    this.transition(next, next === "sleeping" ? 10_000 : 3000 + this.random() * 4000);
    return next;
  }

  applyDecision(decision) {
    this.adjust(decision.statChanges);
    this.addEvent("ai_decision");
    return this.transition(decision.action, decision.durationMs, "ai");
  }

  resetState() {
    this.memory.currentState = "idle";
    this.stateUntil = 0;
    this.lastSource = "local";
    this.addEvent("state_reset");
    this.emit();
  }

  resetMemory() {
    clearMemory(this.storage);
    this.memory = createDefaultMemory(this.now());
    this.tapTimes = [];
    this.addEvent("memory_reset");
    this.emit();
  }
}
