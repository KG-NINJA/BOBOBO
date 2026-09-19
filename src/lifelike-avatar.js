import {
  ageStimulus,
  createLifeState,
  registerPointer,
  registerTap,
  snapshot,
  updateNeeds,
} from "./lifelike-state.js";
import { chooseAction } from "./lifelike-brain.js";

export class LifelikeAvatar {
  constructor(canvas, { now = () => performance.now(), random = Math.random } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.now = now;
    this.random = random;
    this.state = createLifeState(now());
    this.lastFrame = now();
    this.lastDecision = now();
    this.pointer = { x: 0.5, y: 0.5, previousX: 0.5, previousY: 0.5, previousAt: now() };
    this.body = { x: 0.5, y: 0.58, vx: 0, vy: 0, blink: 0, blinkClock: 1 + random() * 3, breathe: 0 };
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastFrame = this.now();
    requestAnimationFrame(() => this.frame());
  }

  stop() {
    this.running = false;
  }

  tap() {
    registerTap(this.state, this.now());
    this.state.action = "play";
    this.lastDecision = 0;
  }

  pointerMove(x, y) {
    const now = this.now();
    const rect = this.canvas.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (x - rect.left) / Math.max(1, rect.width)));
    const ny = Math.max(0, Math.min(1, (y - rect.top) / Math.max(1, rect.height)));
    const dt = Math.max(16, now - this.pointer.previousAt) / 1000;
    const speed = Math.hypot(nx - this.pointer.previousX, ny - this.pointer.previousY) / dt;
    const distance = Math.min(1, Math.hypot(nx - this.body.x, ny - this.body.y));
    registerPointer(this.state, { near: distance < 0.42, speed, distance, now });
    this.pointer = { x: nx, y: ny, previousX: nx, previousY: ny, previousAt: now };
  }

  snapshot() {
    return snapshot(this.state);
  }

  frame() {
    if (!this.running) return;
    const now = this.now();
    const dtMs = Math.min(80, Math.max(0, now - this.lastFrame));
    const dt = dtMs / 1000;
    this.lastFrame = now;

    updateNeeds(this.state, dt);
    ageStimulus(this.state, dtMs);

    if (now - this.lastDecision > 650 + this.random() * 500) {
      chooseAction(this.state, { now, random: this.random });
      this.lastDecision = now;
    }

    this.animate(dt, now);
    this.draw(now);
    requestAnimationFrame(() => this.frame());
  }

  animate(dt, now) {
    const action = this.state.action;
    const target = { x: 0.5, y: 0.58 };
    if (action === "approach") {
      target.x = 0.5 + (this.pointer.x - 0.5) * 0.34;
      target.y = 0.58 + (this.pointer.y - 0.58) * 0.18;
    } else if (action === "retreat" || action === "startle") {
      target.x = 0.5 - (this.pointer.x - 0.5) * 0.22;
      target.y = 0.6;
    } else if (action === "play") {
      target.x = 0.5 + Math.sin(now / 330) * 0.055;
      target.y = 0.55 + Math.cos(now / 260) * 0.025;
    } else if (action === "rest") {
      target.y = 0.64;
    } else if (action === "observe") {
      target.x = 0.5 + (this.pointer.x - 0.5) * 0.08;
    }

    const spring = action === "startle" ? 18 : 7;
    this.body.vx += (target.x - this.body.x) * spring * dt;
    this.body.vy += (target.y - this.body.y) * spring * dt;
    this.body.vx *= Math.exp(-6 * dt);
    this.body.vy *= Math.exp(-6 * dt);
    this.body.x += this.body.vx;
    this.body.y += this.body.vy;
    this.body.breathe += dt * (action === "rest" ? 1.2 : 2.1);

    this.body.blinkClock -= dt;
    if (this.body.blinkClock <= 0) {
      this.body.blink = 1;
      this.body.blinkClock = 1.8 + this.random() * 4.2;
    }
    this.body.blink = Math.max(0, this.body.blink - dt * 8);
  }

  draw(now) {
    const { ctx, canvas } = this;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw; canvas.height = ph;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const x = this.body.x * w;
    const y = this.body.y * h;
    const energy = this.state.needs.energy;
    const stress = this.state.needs.stress;
    const breathe = Math.sin(this.body.breathe * Math.PI * 2) * 4;
    const squash = this.state.action === "startle" ? 0.92 : this.state.action === "rest" ? 0.82 : 1;
    const rx = Math.min(w, h) * (0.12 + breathe / 1500);
    const ry = rx * 1.18 * squash;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((this.pointer.x - this.body.x) * 0.08);

    const grad = ctx.createRadialGradient(-rx * 0.25, -ry * 0.35, rx * 0.15, 0, 0, ry * 1.2);
    grad.addColorStop(0, `hsl(${178 + energy * 42} 72% 72%)`);
    grad.addColorStop(1, `hsl(${210 + stress * 80} 58% 42%)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    const gazeX = Math.max(-1, Math.min(1, (this.pointer.x - this.body.x) * 4));
    const gazeY = Math.max(-1, Math.min(1, (this.pointer.y - this.body.y) * 4));
    const eyeY = -ry * 0.24;
    const eyeSep = rx * 0.34;
    const blinkScale = Math.max(0.06, 1 - this.body.blink * 1.8);
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * eyeSep, eyeY);
      ctx.scale(1, blinkScale);
      ctx.fillStyle = "rgba(248,252,255,.95)";
      ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.18, ry * 0.13, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#07151f";
      ctx.beginPath();
      ctx.arc(gazeX * rx * 0.045, gazeY * ry * 0.035, rx * 0.065, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.strokeStyle = "rgba(5,18,28,.75)";
    ctx.lineWidth = Math.max(2, rx * 0.035);
    ctx.lineCap = "round";
    ctx.beginPath();
    const smile = this.state.action === "play" || this.state.action === "approach" ? 0.08 : stress > 0.5 ? -0.06 : 0.02;
    ctx.moveTo(-rx * 0.2, ry * 0.2);
    ctx.quadraticCurveTo(0, ry * (0.2 + smile), rx * 0.2, ry * 0.2);
    ctx.stroke();

    ctx.restore();

    ctx.fillStyle = "rgba(255,255,255,.75)";
    ctx.font = "600 13px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(this.state.action.toUpperCase(), x, Math.min(h - 18, y + ry + 34));
  }
}
