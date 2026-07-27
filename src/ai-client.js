import { CONFIG } from "./config.js";
import { CREATURE_STATES } from "./creature-state.js";

const CLIENT_ID_KEY = "bobobo.anonymous-client-id";
const WORKER_URL_KEY = "bobobo.worker-url";

function getOrCreateClientId(storage = globalThis.localStorage) {
  try {
    let id = storage?.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = globalThis.crypto?.randomUUID?.() ?? `anon-${Math.random().toString(36).slice(2)}`;
      storage?.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return globalThis.crypto?.randomUUID?.() ?? "anonymous";
  }
}

export class CreatureAiClient {
  constructor({
    storage = globalThis.localStorage,
    fetchImpl = globalThis.fetch?.bind(globalThis),
    workerUrl,
  } = {}) {
    this.storage = storage;
    this.fetchImpl = fetchImpl;
    let savedWorkerUrl = "";
    try {
      savedWorkerUrl = storage?.getItem(WORKER_URL_KEY) ?? "";
    } catch {}
    this.workerUrl = workerUrl ?? savedWorkerUrl ?? CONFIG.workerUrl;
    this.clientId = getOrCreateClientId(storage);
    this.lastCallAt = 0;
    this.lastSignature = "";
    this.lastResult = null;
    this.status = this.workerUrl ? "ready" : "disabled";
  }

  setWorkerUrl(value) {
    this.workerUrl = String(value || "").trim().replace(/\/+$/, "");
    try {
      if (this.workerUrl) this.storage?.setItem(WORKER_URL_KEY, this.workerUrl);
      else this.storage?.removeItem(WORKER_URL_KEY);
    } catch {}
    this.status = this.workerUrl ? "ready" : "disabled";
  }

  makeInput(snapshot) {
    return {
      currentState: snapshot.currentState,
      stats: snapshot.stats,
      recentEvents: snapshot.recentEvents.slice(-10).map(({ type, ageSeconds }) => ({
        type,
        ageSeconds,
      })),
      allowedActions: [...CREATURE_STATES],
    };
  }

  async decide(snapshot, { manual = false } = {}) {
    if (!this.workerUrl || !this.fetchImpl) {
      this.status = "disabled";
      throw new Error("worker_not_configured");
    }
    if (globalThis.document?.visibilityState === "hidden") throw new Error("tab_hidden");

    const now = Date.now();
    if (now - this.lastCallAt < CONFIG.aiCooldownMs) {
      throw new Error("client_cooldown");
    }
    const input = this.makeInput(snapshot);
    const signature = JSON.stringify({
      currentState: input.currentState,
      stats: Object.fromEntries(
        Object.entries(input.stats).map(([key, value]) => [key, Math.round(value / 10)]),
      ),
      events: input.recentEvents.map((event) => event.type),
    });
    if (!manual && signature === this.lastSignature) throw new Error("unchanged_state");

    this.lastCallAt = now;
    this.lastSignature = signature;
    this.status = "connecting";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.aiTimeoutMs);
    try {
      const response = await this.fetchImpl(`${this.workerUrl}/decide`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bobobo-client-id": this.clientId,
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`worker_http_${response.status}`);
      const result = await response.json();
      if (!CREATURE_STATES.includes(result.action)) throw new Error("invalid_worker_result");
      this.lastResult = result;
      this.status = result.reasonCode?.includes("fallback") ? "fallback" : "connected";
      return result;
    } catch (error) {
      this.status = error?.name === "AbortError" ? "timeout" : "unavailable";
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export { CLIENT_ID_KEY, WORKER_URL_KEY };
