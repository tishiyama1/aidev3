// 百人の私を描く群衆キャンバスと、並びを区切る帯。
import { worth } from './sim.js';

export const PATH_COLORS = ['#e0694c', '#58a3dc', '#7cbf86'];
const INK = [201, 195, 217];
const GOLD = [243, 197, 90];
const STONE = '#77748a';
const CURSE = '#b98ad8';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

export const snap = (s) => ({ w: worth(s), form: s.form, doll: s.items.includes('doll'), king: s.king });

function wealthColor(w, alpha = 1) {
  const t = clamp(Math.log10(w + 1) / 3.3, 0, 1);
  const [r, g, b] = mix(INK, GOLD, t);
  return `rgba(${r},${g},${b},${alpha})`;
}

function setupCanvas(canvas, w, h) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const W = Math.round(w * dpr), H = Math.round(h * dpr);
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

// 一人の私を描く。c はマスの大きさ。
export function drawFigure(ctx, x, y, c, shown, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const col = wealthColor(shown.w);
  if (shown.w >= 800) {
    ctx.shadowColor = 'rgba(243,197,90,0.8)';
    ctx.shadowBlur = c * 0.35;
  }
  ctx.fillStyle = col;
  ctx.strokeStyle = col;
  const hr = c * 0.13;
  if (shown.form === 'stone') {
    ctx.fillStyle = STONE;
    ctx.beginPath();
    ctx.roundRect(x - c * 0.2, y - c * 0.3, c * 0.4, c * 0.62, c * 0.12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = Math.max(1, c * 0.03);
    ctx.beginPath();
    ctx.moveTo(x - c * 0.05, y - c * 0.25);
    ctx.lineTo(x + c * 0.04, y - c * 0.05);
    ctx.lineTo(x - c * 0.03, y + c * 0.12);
    ctx.stroke();
  } else if (shown.form === 'cat') {
    ctx.beginPath();
    ctx.ellipse(x, y + c * 0.16, c * 0.2, c * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y - c * 0.08, hr * 1.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - hr * 0.95, y - c * 0.1);
    ctx.lineTo(x - hr * 0.75, y - c * 0.32);
    ctx.lineTo(x - hr * 0.15, y - c * 0.18);
    ctx.moveTo(x + hr * 0.95, y - c * 0.1);
    ctx.lineTo(x + hr * 0.75, y - c * 0.32);
    ctx.lineTo(x + hr * 0.15, y - c * 0.18);
    ctx.fill();
    ctx.lineWidth = Math.max(1, c * 0.045);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + c * 0.18, y + c * 0.22);
    ctx.quadraticCurveTo(x + c * 0.38, y + c * 0.18, x + c * 0.32, y - c * 0.02);
    ctx.stroke();
  } else if (shown.form === 'bird') {
    ctx.beginPath();
    ctx.ellipse(x, y + c * 0.04, c * 0.12, c * 0.17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(1, c * 0.06);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - c * 0.06, y);
    ctx.quadraticCurveTo(x - c * 0.25, y - c * 0.25, x - c * 0.38, y - c * 0.08);
    ctx.moveTo(x + c * 0.06, y);
    ctx.quadraticCurveTo(x + c * 0.25, y - c * 0.25, x + c * 0.38, y - c * 0.08);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y - c * 0.17, hr * 0.8, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(x - c * 0.1, y - c * 0.02);
    ctx.lineTo(x + c * 0.1, y - c * 0.02);
    ctx.lineTo(x + c * 0.22, y + c * 0.32);
    ctx.lineTo(x - c * 0.22, y + c * 0.32);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y - c * 0.17, hr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  if (shown.king) {
    ctx.fillStyle = '#f7d675';
    const cy = y - c * 0.36, w = c * 0.12;
    ctx.beginPath();
    ctx.moveTo(x - w, cy + w * 0.6);
    ctx.lineTo(x - w, cy - w * 0.4);
    ctx.lineTo(x - w * 0.5, cy + w * 0.1);
    ctx.lineTo(x, cy - w * 0.6);
    ctx.lineTo(x + w * 0.5, cy + w * 0.1);
    ctx.lineTo(x + w, cy - w * 0.4);
    ctx.lineTo(x + w, cy + w * 0.6);
    ctx.closePath();
    ctx.fill();
  }
  if (shown.doll) {
    ctx.fillStyle = CURSE;
    ctx.beginPath();
    ctx.arc(x + c * 0.27, y + c * 0.27, Math.max(1.5, c * 0.06), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export class Crowd {
  // opts.snap: 私から描画用の状態を作る / opts.draw: 一人を描く(別のゲームで差し替えられる)
  constructor(canvas, onPick, opts = {}) {
    this.canvas = canvas;
    this.onPick = onPick;
    this.snap = opts.snap || snap;
    this.drawOne = opts.draw || drawFigure;
    this.sprites = new Map();
    this.order = [];
    this.floats = [];
    this.rings = [];
    this.assign = new Map();
    this.highlight = null;
    this.selected = null;
    this.dim = 0;
    this.width = canvas.parentElement.clientWidth || 360;
    this.cell = 20;
    this.cols = 20;
    this.height = 100;
    canvas.addEventListener('click', (e) => this.click(e));
    new ResizeObserver(() => {
      const w = canvas.parentElement.clientWidth;
      if (w && Math.abs(w - this.width) > 1) {
        this.width = w;
        this.relayout(true);
      }
    }).observe(canvas.parentElement);
  }

  geometry(n) {
    const cell = clamp(this.width / 20, 16, 36);
    const cols = Math.max(8, Math.floor(this.width / cell));
    this.cols = cols;
    this.cell = this.width / cols;
    const rows = Math.max(5, Math.ceil(n / cols));
    this.height = rows * this.cell;
  }

  pos(i) {
    const c = this.cell;
    return [(i % this.cols) * c + c / 2, Math.floor(i / this.cols) * c + c / 2];
  }

  // list の順にマスへ並べる。消えた私の絵は消滅の演出が終わるまで残す。
  layout(list, { instant = false, burst = false } = {}) {
    this.order = list.map((s) => s.id);
    this.geometry(list.length);
    const now = performance.now();
    const keep = new Set(this.order);
    for (const [id, sp] of this.sprites) if (!keep.has(id) && !sp.dieAt) this.sprites.delete(id);
    list.forEach((s, i) => {
      const [x, y] = this.pos(i);
      let sp = this.sprites.get(s.id);
      if (!sp) {
        sp = { id: s.id, s, x, y, tx: x, ty: y, shown: this.snap(s), appearAt: 0 };
        this.sprites.set(s.id, sp);
      }
      sp.s = s;
      sp.tx = x;
      sp.ty = y;
      if (instant) { sp.x = x; sp.y = y; }
      if (burst) {
        sp.x = this.width / 2;
        sp.y = this.height / 2;
        sp.appearAt = now + i * 9;
        sp.shown = this.snap(s);
      }
    });
  }

  relayout(instant) {
    const list = this.order.map((id) => this.sprites.get(id)).filter(Boolean).map((sp) => sp.s);
    this.layout(list, { instant });
  }

  sprite(id) { return this.sprites.get(id); }

  refresh(id) {
    const sp = this.sprites.get(id);
    if (sp) sp.shown = this.snap(sp.s);
  }

  float(id, text, color, big = false, stack = 0) {
    const sp = this.sprites.get(id);
    if (!sp) return;
    const y = sp.y - this.cell * (0.3 + stack * 0.45);
    this.floats.push({ x: sp.x, y, text, color, t0: performance.now() + stack * 120, dur: big ? 2200 : 1300, big });
  }

  ring(id, color) {
    const sp = this.sprites.get(id);
    if (sp) this.rings.push({ x: sp.x, y: sp.y, color, t0: performance.now() });
  }

  die(id) {
    const sp = this.sprites.get(id);
    if (!sp) return;
    sp.dieAt = performance.now();
    this.ring(id, 'rgba(196,80,94,0.9)');
  }

  born(id, s, fromId) {
    const from = fromId != null ? this.sprites.get(fromId) : null;
    const x = from ? from.x : this.width / 2;
    const y = from ? from.y : this.height / 2;
    const sp = { id, s, x, y, tx: x, ty: y, shown: this.snap(s), appearAt: 0, bornAt: performance.now() };
    this.sprites.set(id, sp);
    this.ring(id, 'rgba(236,228,207,0.8)');
  }

  click(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, bd = Infinity;
    for (const sp of this.sprites.values()) {
      if (sp.dieAt) continue;
      const d = Math.hypot(sp.x - x, sp.y - y);
      if (d < bd) { bd = d; best = sp; }
    }
    if (best && bd < this.cell * 0.7) this.onPick?.(best.s);
  }

  draw(now) {
    const ctx = setupCanvas(this.canvas, this.width, this.height);
    ctx.clearRect(0, 0, this.width, this.height);
    const c = this.cell;
    for (const sp of this.sprites.values()) {
      sp.x += (sp.tx - sp.x) * 0.16;
      sp.y += (sp.ty - sp.y) * 0.16;
      if (sp.dieAt && now - sp.dieAt > 900) this.sprites.delete(sp.id);
    }
    // 振り分けの色
    if (this.assign.size) {
      for (const sp of this.sprites.values()) {
        const p = this.assign.get(sp.id);
        if (p == null || sp.dieAt) continue;
        ctx.fillStyle = PATH_COLORS[p];
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.roundRect(sp.x - c * 0.46, sp.y - c * 0.46, c * 0.92, c * 0.92, c * 0.18);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (this.highlight != null) {
      const sp = this.sprites.get(this.highlight);
      if (sp) {
        ctx.save();
        ctx.shadowColor = 'rgba(243,197,90,0.9)';
        ctx.shadowBlur = c * 0.6;
        ctx.strokeStyle = '#f3c55a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, c * 0.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    for (const sp of this.sprites.values()) {
      if (sp.appearAt && now < sp.appearAt) continue;
      let a = 1;
      let scale = 1;
      if (sp.appearAt) a = clamp((now - sp.appearAt) / 300, 0, 1);
      if (sp.bornAt) scale = ease((now - sp.bornAt) / 500);
      if (sp.dieAt) a = 1 - clamp((now - sp.dieAt) / 800, 0, 1);
      if (this.dim && sp.id !== this.highlight) a *= 1 - this.dim * 0.8;
      if (scale <= 0.01 || a <= 0.01) continue;
      this.drawOne(ctx, sp.x, sp.y, c * scale, sp.shown, a);
      if (sp.id === this.selected) {
        ctx.strokeStyle = 'rgba(236,228,207,0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, c * 0.48, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    this.rings = this.rings.filter((r) => now - r.t0 < 800);
    for (const r of this.rings) {
      const t = (now - r.t0) / 800;
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = 1 - t;
      ctx.lineWidth = 2 * (1 - t) + 0.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, c * (0.25 + t * 0.6), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this.floats = this.floats.filter((f) => now - f.t0 < f.dur);
    this.floats.sort((a, b) => a.big - b.big);
    ctx.textAlign = 'center';
    for (const f of this.floats) {
      if (now < f.t0) continue;
      const t = (now - f.t0) / f.dur;
      ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      ctx.fillStyle = f.color;
      const size = f.big ? Math.max(14, c * 0.6) : Math.max(10, c * 0.4);
      ctx.font = `700 ${size}px 'Zen Old Mincho', serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(18,19,39,0.85)';
      const y = f.y - t * c * (f.big ? 1.2 : 0.9);
      ctx.strokeText(f.text, f.x, y);
      ctx.fillText(f.text, f.x, y);
    }
    ctx.globalAlpha = 1;
  }
}

// 並び順の帯。棒の高さが財産、仕切りで道を分ける。
export class Strip {
  // opts.value: 棒の高さに使う値
  constructor(canvas, onChange, opts = {}) {
    this.canvas = canvas;
    this.onChange = onChange;
    this.value = opts.value || worth;
    this.list = [];
    this.cuts = [];
    this.locked = false;
    this.drag = -1;
    this.hint = 0;
    this.height = 76;
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    const up = () => { this.drag = -1; };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  }

  set(list, cuts) {
    this.list = list;
    this.cuts = cuts;
  }

  get width() { return this.canvas.parentElement.clientWidth || 360; }

  xOf(f) {
    const n = Math.max(1, this.list.length);
    return (Math.round(f * n) / n) * this.width;
  }

  fracAt(e) {
    const r = this.canvas.getBoundingClientRect();
    return clamp((e.clientX - r.left) / r.width, 0, 1);
  }

  down(e) {
    if (this.locked || !this.cuts.length) return;
    const f = this.fracAt(e);
    const x = f * this.width;
    let best = 0, bd = Infinity;
    this.cuts.forEach((c, i) => {
      const d = Math.abs(this.xOf(c) - x);
      // 重なった仕切りは、押した側に動かせる方を選ぶ
      if (d < bd || (d === bd && f > c)) { bd = d; best = i; }
    });
    this.drag = best;
    this.canvas.setPointerCapture(e.pointerId);
    this.update(f);
  }

  move(e) {
    if (this.drag < 0 || this.locked) return;
    this.update(this.fracAt(e));
  }

  update(f) {
    const i = this.drag;
    const n = Math.max(1, this.list.length);
    const lo = i > 0 ? this.cuts[i - 1] : 0;
    const hi = i < this.cuts.length - 1 ? this.cuts[i + 1] : 1;
    const v = clamp(Math.round(f * n) / n, lo, hi);
    if (v !== this.cuts[i]) {
      this.cuts = this.cuts.slice();
      this.cuts[i] = v;
      this.hint = 0;
      this.onChange(this.cuts);
    }
  }

  draw(now) {
    const W = this.width, H = this.height;
    const ctx = setupCanvas(this.canvas, W, H);
    ctx.clearRect(0, 0, W, H);
    const n = this.list.length;
    if (!n) return;
    const top = 18, base = H - 16;
    const bw = W / n;
    const maxW = Math.max(1, ...this.list.map((s) => this.value(s)));
    const bounds = [0, ...this.cuts.map((f) => Math.round(f * n)), n];
    for (let p = 0; p < bounds.length - 1; p++) {
      const a = bounds[p], b = bounds[p + 1];
      if (b <= a) continue;
      ctx.fillStyle = PATH_COLORS[p];
      ctx.globalAlpha = 0.1;
      ctx.fillRect(a * bw, top - 4, (b - a) * bw, base - top + 4);
      ctx.globalAlpha = 0.9;
      ctx.font = `700 12px 'Zen Old Mincho', serif`;
      ctx.textAlign = 'center';
      ctx.fillText(String(b - a), ((a + b) / 2) * bw, 12);
      ctx.globalAlpha = 1;
      for (let i = a; i < b; i++) {
        const w = this.value(this.list[i]);
        const h = w > 0 ? 3 + (base - top - 3) * Math.sqrt(w / maxW) : 1.5;
        ctx.fillStyle = PATH_COLORS[p];
        ctx.fillRect(i * bw + (bw > 3 ? 0.5 : 0), base - h, Math.max(0.8, bw - (bw > 3 ? 1 : 0)), h);
      }
    }
    ctx.fillStyle = 'rgba(236,228,207,0.15)';
    ctx.fillRect(0, base, W, 1);
    // 仕切り
    this.hint += 0.016;
    this.cuts.forEach((f, i) => {
      const x = clamp(this.xOf(f), 1, W - 1);
      const active = this.drag === i;
      ctx.strokeStyle = '#ece4cf';
      ctx.lineWidth = active ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.moveTo(x, top - 6);
      ctx.lineTo(x, base + 2);
      ctx.stroke();
      const pulse = this.locked ? 0 : Math.max(0, Math.sin(now / 380 + i)) * Math.max(0, 1 - this.hint / 6);
      ctx.fillStyle = '#ece4cf';
      ctx.beginPath();
      ctx.arc(x, base + 7, (active ? 8 : 6.5) + pulse * 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(18,19,39,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 2, base + 4); ctx.lineTo(x - 2, base + 10);
      ctx.moveTo(x + 2, base + 4); ctx.lineTo(x + 2, base + 10);
      ctx.stroke();
    });
  }
}
