import { CREATURE_STATES, STAT_KEYS } from "./creature-state.js";

function formatTime(value) {
  return value ? new Date(value).toLocaleTimeString("ja-JP") : "未実行";
}

export function createDebugPanel({ controller, aiClient, onRunAi }) {
  if (new URLSearchParams(location.search).get("debug") !== "1") {
    return { update() {} };
  }
  const panel = document.createElement("details");
  panel.id = "debug-panel";
  panel.innerHTML = `
    <summary>BOBOBO 開発情報</summary>
    <div class="debug-grid"></div>
    <label>Worker URL
      <input id="debug-worker-url" type="url" placeholder="https://...workers.dev">
    </label>
    <div class="debug-actions">
      <button id="debug-run-ai">AI手動実行</button>
      <button id="debug-reset-state">状態リセット</button>
      <button id="debug-reset-memory">記憶をリセット</button>
    </div>
    <div id="debug-message" role="status"></div>
  `;
  document.body.appendChild(panel);
  const grid = panel.querySelector(".debug-grid");
  const input = panel.querySelector("#debug-worker-url");
  const message = panel.querySelector("#debug-message");
  input.value = aiClient.workerUrl;
  input.addEventListener("change", () => {
    aiClient.setWorkerUrl(input.value);
    message.textContent = aiClient.workerUrl ? "Worker URLを保存しました" : "ローカル動作のみです";
    update();
  });
  panel.querySelector("#debug-run-ai").addEventListener("click", async () => {
    message.textContent = "AI判定中…";
    try {
      await onRunAi(true);
      message.textContent = "AI判定を反映しました";
    } catch (error) {
      message.textContent = `ローカル動作を継続: ${error.message}`;
    }
    update();
  });
  panel.querySelector("#debug-reset-state").addEventListener("click", () => {
    controller.resetState();
    message.textContent = "行動状態をリセットしました";
  });
  panel.querySelector("#debug-reset-memory").addEventListener("click", () => {
    if (confirm("BOBOBOの記憶と内部状態をリセットしますか？")) {
      controller.resetMemory();
      message.textContent = "記憶をリセットしました";
    }
  });

  function update() {
    const snapshot = controller.snapshot();
    const rows = [
      ["currentState", snapshot.currentState],
      ["currentEmotion", snapshot.currentEmotion],
      ...STAT_KEYS.map((key) => [key, snapshot.stats[key].toFixed(1)]),
      ["最後の入力", snapshot.lastEvent],
      ["AI呼出時刻", formatTime(aiClient.lastCallAt)],
      ["AI判定", aiClient.lastResult ? JSON.stringify(aiClient.lastResult) : "なし"],
      ["AI接続", aiClient.status],
      ["判定元", snapshot.source],
    ];
    grid.innerHTML = rows
      .map(([name, value]) => `<span>${name}</span><output>${String(value)}</output>`)
      .join("");
    input.value = aiClient.workerUrl;
  }
  update();
  return { update };
}
