// 隊列の物差し。強さ順に並んだ冒険者を棒で表し、真鍮の仕切りで扉ごとに分ける。
import { PATH_TINTS } from './art.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Ruler {
  constructor(canvas, { value, onChange, onTick }) {
    this.canvas = canvas;
    this.value = value;
    this.onChange = onChange;
    this.onTick = onTick;
    this.list = [];
    this.cuts = [];
    this.locked = false;
    this.drag = -1;
    this.hintT = 0;
    this.focus = 0;
    this.H = 64;
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'slider');
    canvas.setAttribute('aria-label', '隊列の仕切り');
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    const up = () => { this.drag = -1; this.dirty = true; };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('keydown', (e) => this.key(e));
    const loop = (t) => { this.draw(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  set(list, cuts) { this.list = list; this.cuts = cuts; this.dirty = true; }
  get W() { return this.canvas.parentElement.clientWidth || 360; }
  frac(e) { const r = this.canvas.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1); }
  xOf(f) { const n = Math.max(1, this.list.length); return (Math.round(f * n) / n) * this.W; }

  down(e) {
    if (this.locked || !this.cuts.length) return;
    const f = this.frac(e);
    let best = 0, bd = Infinity;
    this.cuts.forEach((c, i) => {
      const d = Math.abs(this.xOf(c) - f * this.W);
      if (d < bd || (d === bd && f > c)) { bd = d; best = i; }
    });
    this.drag = best;
    this.focus = best;
    this.canvas.setPointerCapture(e.pointerId);
    this.update(f);
  }
  move(e) { if (this.drag >= 0 && !this.locked) this.update(this.frac(e)); }

  update(f, i = this.drag) {
    const n = Math.max(1, this.list.length);
    const lo = i > 0 ? this.cuts[i - 1] : 0;
    const hi = i < this.cuts.length - 1 ? this.cuts[i + 1] : 1;
    const v = clamp(Math.round(f * n) / n, lo, hi);
    if (v !== this.cuts[i]) {
      this.cuts = this.cuts.slice();
      this.cuts[i] = v;
      this.hintT = 99;
      this.onTick?.();
      this.onChange(this.cuts);
    }
  }

  // キーボードでも動かせる(Tab で選び、← → で一人ずつ、Shift で五人ずつ)
  key(e) {
    if (this.locked || !this.cuts.length) return;
    const n = Math.max(1, this.list.length);
    if (e.key === 'Tab' && this.cuts.length > 1 && !e.shiftKey && this.focus < this.cuts.length - 1) { this.focus++; e.preventDefault(); return; }
    const step = (e.shiftKey ? 5 : 1) / n;
    if (e.key === 'ArrowLeft') { this.update(this.cuts[this.focus] - step, this.focus); e.preventDefault(); }
    if (e.key === 'ArrowRight') { this.update(this.cuts[this.focus] + step, this.focus); e.preventDefault(); }
  }

  draw(now) {
    const W = this.W, H = this.H;
    const d = Math.min(window.devicePixelRatio || 1, 2);
    if (this.canvas.width !== Math.round(W * d) || this.canvas.height !== Math.round(H * d)) {
      this.canvas.width = Math.round(W * d);
      this.canvas.height = Math.round(H * d);
      this.canvas.style.height = `${H}px`;
    }
    const x = this.canvas.getContext('2d');
    x.setTransform(d, 0, 0, d, 0, 0);
    x.clearRect(0, 0, W, H);
    const n = this.list.length;
    if (!n) return;
    const top = 6, base = H - 20;
    // 物差しの台
    const bg = x.createLinearGradient(0, base, 0, H);
    bg.addColorStop(0, '#8a6a3a');
    bg.addColorStop(0.5, '#c8a060');
    bg.addColorStop(1, '#6a4e2a');
    x.fillStyle = bg;
    x.fillRect(0, base, W, 8);
    x.fillStyle = 'rgba(30,20,10,0.6)';
    for (let i = 0; i <= n; i += 5) {
      const tx = (i / n) * W;
      x.fillRect(tx, base, 1, i % 10 === 0 ? 8 : 4);
    }
    const bw = W / n;
    const maxV = Math.max(1, ...this.list.map(this.value));
    const bounds = [0, ...this.cuts.map((f) => Math.round(f * n)), n];
    for (let p = 0; p < bounds.length - 1; p++) {
      const a = bounds[p], b = bounds[p + 1];
      if (b <= a) continue;
      const tint = PATH_TINTS[p];
      x.fillStyle = tint;
      x.globalAlpha = 0.08;
      x.fillRect(a * bw, top, (b - a) * bw, base - top);
      x.globalAlpha = 1;
      for (let i = a; i < b; i++) {
        const v = this.value(this.list[i]);
        const h = 2 + (base - top - 4) * Math.sqrt(v / maxV);
        x.fillStyle = tint;
        x.globalAlpha = this.list[i].skill ? 1 : 0.78;
        x.fillRect(i * bw + (bw > 3 ? 0.5 : 0), base - h, Math.max(0.8, bw - (bw > 3 ? 1 : 0)), h);
        if (this.list[i].skill) {
          x.fillStyle = '#ffe6a8';
          x.fillRect(i * bw + (bw > 3 ? 0.5 : 0), base - h - 2, Math.max(0.8, bw - (bw > 3 ? 1 : 0)), 2);
        }
      }
      x.globalAlpha = 1;
    }
    // 真鍮の仕切り
    const pulse = this.locked || this.hintT > 6 ? 0 : Math.max(0, Math.sin(now / 320)) * 3;
    this.hintT += 0.016;
    this.cuts.forEach((f, i) => {
      const cx = clamp(this.xOf(f), 6, W - 6);
      const active = this.drag === i;
      x.strokeStyle = '#f0d49a';
      x.lineWidth = active ? 2.5 : 1.8;
      x.beginPath(); x.moveTo(cx, top - 2); x.lineTo(cx, base + 2); x.stroke();
      const g = x.createLinearGradient(cx - 9, 0, cx + 9, 0);
      g.addColorStop(0, '#8a6430');
      g.addColorStop(0.5, '#f2d08a');
      g.addColorStop(1, '#8a6430');
      x.fillStyle = g;
      x.beginPath();
      const r = (active ? 10 : 8.5) + pulse;
      x.moveTo(cx, base + 1);
      x.lineTo(cx + r * 0.9, base + r * 0.9 + 2);
      x.lineTo(cx + r * 0.9, H - 1);
      x.lineTo(cx - r * 0.9, H - 1);
      x.lineTo(cx - r * 0.9, base + r * 0.9 + 2);
      x.closePath();
      x.fill();
      x.strokeStyle = 'rgba(40,24,8,0.6)';
      x.lineWidth = 1;
      x.beginPath(); x.moveTo(cx - 2.5, H - 9); x.lineTo(cx - 2.5, H - 4); x.moveTo(cx + 2.5, H - 9); x.lineTo(cx + 2.5, H - 4); x.stroke();
      if (document.activeElement === this.canvas && i === this.focus) {
        x.strokeStyle = '#ffe6a8';
        x.lineWidth = 1.5;
        x.strokeRect(cx - r, base, r * 2, H - base - 1);
      }
    });
  }
}
