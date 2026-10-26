// 舞台:迷宮の一室を断面で描く。冒険者は振り分けに従って扉の前へ歩き、扉の闇へ入り、生き残りだけが戻る。
import * as art from './art.js';
import { hash } from './names.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const DPR = () => Math.min(window.devicePixelRatio || 1, 2);

export class Stage {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dark = document.createElement('canvas');
    this.dctx = this.dark.getContext('2d');
    this.onPick = opts.onPick;
    this.mode = 'title';
    this.floor = 1;
    this.doors = [];
    this.figs = new Map();
    this.candles = [];
    this.floats = [];
    this.pillars = [];
    this.particles = [];
    this.banners = [];
    this.flash = null;
    this.beam = null;
    this.bossId = null;
    this.bossRage = 0;
    this.bossHurt = 0;
    this.bossGone = 0;
    this.selected = null;
    this.heroes = new Set();
    this.speed = 1;
    this.reduced = false;
    this.descent = null;
    this.W = 360;
    this.H = 280;
    this.layoutOrder = [];
    this.assign = new Map();
    canvas.addEventListener('click', (e) => this.click(e));
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    for (let i = 0; i < 26; i++) this.particles.push(this.dust(true));
    const loop = (t) => { if (!document.hidden) this.draw(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  // ---------- 寸法 ----------
  resize() {
    const w = this.canvas.parentElement.clientWidth || 360;
    // 縦に短い画面では舞台を低くして、操作部まで一画面に収める
    // 横長の画面では舞台を左に置くので、高さは画面いっぱいまで使う
    const wide = window.innerWidth >= 1000 && window.innerWidth / window.innerHeight >= 1.25;
    const h = wide
      ? Math.round(clamp(Math.min(w * 0.62, window.innerHeight - 120), 360, 680))
      : Math.round(clamp(Math.min(w * 0.8, window.innerHeight * 0.5), 280, 520));
    if (w === this.W && h === this.H) return;
    this.W = w;
    this.H = h;
    const d = DPR();
    for (const c of [this.canvas, this.dark]) { c.width = Math.round(w * d); c.height = Math.round(h * d); }
    this.canvas.style.height = `${h}px`;
    this.relayout(true);
  }
  get horizon() { return this.H * 0.6; }
  get fs() { return clamp(this.W / 22, 15, 34); }

  doorGeom(i) {
    const k = this.doors.length || 1;
    const col = this.W / k;
    // 上端の主の情報の帯(約40px)に要石がかからない大きさにする
    const w = Math.min(col * 0.5, 170, (this.horizon - 44) / 1.85);
    return { x: (i + 0.5) * col, y: this.horizon + 2, w, h: w * 1.45, col };
  }

  // ---------- 状態の設定 ----------
  setFloor(f) { this.floor = f; }
  setMode(mode) {
    if (mode !== this.mode) { this.banners = []; this.floats = []; this.pillars = []; }
    if (mode === 'boss' && this.mode !== 'boss') { this.bossGone = 0; this.bossDying = false; this.bossRage = 0; }
    this.mode = mode;
    if (mode !== 'room') { this.doors = []; this.candles = []; }
    this.relayout();
  }
  setDoors(list) {
    this.doors = list.map((d) => ({ ...d, open: 0, target: 0, lit: 0 }));
    this.candles = [];
    this.relayout();
  }
  setBoss(id) { if (this.bossId !== id) { this.bossGone = 0; this.bossDying = false; } this.bossId = id; }

  // party: 表示する冒険者(並び順)。assign: id → 扉の番号
  setParty(party, assign = new Map(), heroes = []) {
    this.layoutOrder = party.map((a) => a.id);
    this.assign = assign;
    this.heroes = new Set(heroes);
    const keep = new Set(this.layoutOrder);
    for (const [id, f] of this.figs) if (!keep.has(id) && !f.leaving) this.figs.delete(id);
    for (const a of party) {
      let f = this.figs.get(a.id);
      if (!f) {
        f = { id: a.id, a, x: this.W / 2, y: this.H * 0.85, tx: 0, ty: 0, alpha: 0, ta: 1, walk: 0, seed: hash(a.id, 3) };
        this.figs.set(a.id, f);
      }
      f.a = a;
      f.hidden = false;
      f.ta = 1;
    }
    this.relayout();
  }

  refresh(a) { const f = this.figs.get(a.id); if (f) f.a = a; }

  relayout(instant = false) {
    const ids = this.layoutOrder.filter((id) => this.figs.has(id));
    const fs = this.fs;
    const H = this.H;
    const W = this.W;
    const place = (id, x, y) => {
      const f = this.figs.get(id);
      if (!f || f.inside) return;
      const j = f.seed;
      f.tx = x + (((j & 255) / 255) - 0.5) * fs * 0.35;
      f.ty = y + ((((j >>> 8) & 255) / 255) - 0.5) * fs * 0.2;
      if (instant || this.reduced) { f.x = f.tx; f.y = f.ty; }
    };
    if (this.mode === 'room' && this.doors.length) {
      const groups = this.doors.map(() => []);
      const free = [];
      for (const id of ids) {
        const g = this.assign.get(id);
        if (g == null || !groups[g]) free.push(id); else groups[g].push(id);
      }
      groups.forEach((g, i) => this.cluster(g, this.doorGeom(i).x, this.doorGeom(i).col * 0.92, this.horizon + fs * 1.15, H - fs * 0.3, place));
      if (free.length) this.cluster(free, W / 2, W * 0.9, this.horizon + fs * 1.15, H - fs * 0.3, place);
    } else if (this.mode === 'camp') {
      const cx = W / 2, cy = H * 0.74;
      let ring = 0, placed = 0;
      while (placed < ids.length) {
        const rx = W * (0.16 + ring * 0.085), ry = H * (0.075 + ring * 0.05);
        const n = Math.max(6, Math.floor((Math.PI * 2 * rx) / (fs * 0.85)));
        for (let k = 0; k < n && placed < ids.length; k++, placed++) {
          const a = (k / n) * Math.PI * 2 + ring * 0.3;
          place(ids[placed], cx + Math.cos(a) * rx, cy + Math.sin(a) * ry + fs * 0.5);
        }
        ring++;
      }
    } else if (this.mode === 'boss') {
      this.cluster(ids, W / 2, W * 0.94, H * 0.74, H - fs * 0.25, place);
    } else {
      this.cluster(ids, W / 2, W * 0.5, this.horizon + fs * 1.5, H - fs * 0.3, place);
    }
  }

  cluster(ids, cx, width, top, bottom, place) {
    const fs = this.fs;
    const n = ids.length;
    if (!n) return;
    let colW = fs * 0.82;
    let cols = Math.max(1, Math.floor(width / colW));
    let rows = Math.ceil(n / cols);
    let rowH = Math.min(fs * 0.95, (bottom - top) / Math.max(1, rows));
    if (rowH < fs * 0.3) { rowH = fs * 0.3; }
    ids.forEach((id, k) => {
      const r = Math.floor(k / cols);
      const inRow = Math.min(cols, n - r * cols);
      const c = k % cols;
      const x = cx + (c - (inRow - 1) / 2) * colW + (r % 2 ? colW * 0.25 : 0);
      place(id, x, top + r * rowH);
    });
  }

  // ---------- 演出 ----------
  wait(ms) { return new Promise((r) => setTimeout(r, ms * this.speed)); }

  float(id, text, color, big = false) {
    // 一度に浮かぶ文字が多すぎると読めないので、大事なもの以外は間引く
    const live = this.floats.filter((q) => performance.now() - q.t0 < q.dur).length;
    if (live > 14 && !big) return;
    const f = this.figs.get(id);
    const x = f ? f.x : this.W / 2;
    const y = f ? f.y - this.fs * 1.4 : this.H / 2;
    const n = this.floats.filter((q) => q.id === id && performance.now() - q.t0 < 600).length;
    this.floats.push({ id, x, y: y - n * this.fs * 0.55, text, color, big, t0: performance.now() + n * 110, dur: (big ? 2200 : 1400) * Math.max(0.6, this.speed) });
  }

  pillar(id, color = 'rgba(255,214,140,') {
    const f = this.figs.get(id);
    if (f) this.pillars.push({ id, color, t0: performance.now() });
    for (let i = 0; i < 18 && !this.reduced; i++) this.particles.push(this.spark(f ? f.x : this.W / 2, f ? f.y : this.H / 2));
  }

  banner(text, sub = '', color = '#efe3cc') {
    this.banners = [{ text, sub, color, t0: performance.now(), dur: 2000 * Math.max(0.7, this.speed) }];
  }

  // color は [r, g, b]
  flashScreen(color, ms = 500) { if (!this.reduced) this.flash = { color, t0: performance.now(), dur: ms }; }

  async enterDoors(groups) {
    this.doors.forEach((d, i) => { d.target = groups[i] && groups[i].length ? 1 : 0; });
    await this.wait(260);
    groups.forEach((g, i) => {
      const dg = this.doorGeom(i);
      g.forEach((id, k) => {
        const f = this.figs.get(id);
        if (!f) return;
        f.inside = true;
        f.delay = performance.now() + k * 14 * this.speed;
        f.tx = dg.x + (((f.seed & 15) / 15) - 0.5) * dg.w * 0.4;
        f.ty = dg.y - 2;
        f.ta = 0;
        if (this.reduced) { f.alpha = 0; }
      });
    });
    await this.wait(900 + Math.min(700, Math.max(...groups.map((g) => g.length), 0) * 14));
  }

  // 生き残りは扉から現れて元の場所へ。倒れた者の数だけ扉の前に灯がともる。
  async returnFrom(groups, aliveSet, deadByDoor, newcomers = []) {
    groups.forEach((g, i) => {
      const dg = this.doorGeom(i);
      g.forEach((id, k) => {
        const f = this.figs.get(id);
        if (!f) return;
        if (aliveSet.has(id)) {
          f.inside = false;
          f.x = dg.x;
          f.y = dg.y - 2;
          f.alpha = 0;
          f.ta = 1;
          f.delay = performance.now() + k * 10 * this.speed;
        } else {
          this.figs.delete(id);
        }
      });
      const n = deadByDoor[i] || 0;
      for (let c = 0; c < n; c++) this.candles.push({ door: i, k: c, t0: performance.now() + c * 90 });
    });
    for (const [id, door] of newcomers) {
      const f = this.figs.get(id);
      const dg = this.doorGeom(door);
      if (f) { f.x = dg.x; f.y = dg.y; f.alpha = 0; f.ta = 1; }
    }
    this.relayout();
    await this.wait(380);
    this.doors.forEach((d) => { d.target = 0; });
    await this.wait(500);
  }

  async descend(label, sub, nextFloor, onMid) {
    this.descent = { t0: performance.now(), dur: 1700 * this.speed, label, sub, swapped: false, nextFloor, onMid };
    await this.wait(1750);
  }

  async prophecy(sequence, heroId, onStep) {
    for (let i = 0; i < sequence.length; i++) {
      const f = this.figs.get(sequence[i]);
      if (f) this.beam = { x: f.x, id: f.id, t0: performance.now() };
      onStep?.(i);
      await this.wait(50 * Math.pow(1.13, i));
    }
    const f = this.figs.get(heroId);
    if (f) {
      this.beam = { x: f.x, id: heroId, t0: performance.now(), final: true };
      await this.wait(700);
      f.tx = this.W / 2;
      f.ty = this.H * 0.66;
      f.hero = true;
    }
  }

  clearBeam() {
    this.beam = null;
    for (const f of this.figs.values()) f.hero = false;
    this.relayout();
  }

  hurtBoss(k = 1) { this.bossHurt = Math.max(this.bossHurt, k); }
  killBoss() {
    this.bossDying = true;
    for (let i = 0; i < 80 && !this.reduced; i++) this.particles.push(this.spark(this.W / 2 + (Math.random() - 0.5) * this.W * 0.3, this.H * 0.45));
  }

  // ---------- 粒 ----------
  dust(anywhere) {
    return { kind: 'dust', x: Math.random() * this.W, y: anywhere ? Math.random() * this.H : this.H + 4, vx: (Math.random() - 0.5) * 0.08, vy: -0.05 - Math.random() * 0.12, life: 1, r: 0.6 + Math.random() * 1.2 };
  }
  spark(x, y) {
    const a = Math.random() * Math.PI * 2;
    return { kind: 'spark', x, y: y - this.fs * 0.7, vx: Math.cos(a) * 0.8, vy: -1 - Math.random() * 1.6, life: 1, r: 1 + Math.random() * 1.5 };
  }
  ember(x, y) {
    return { kind: 'ember', x: x + (Math.random() - 0.5) * 20, y, vx: (Math.random() - 0.5) * 0.4, vy: -0.6 - Math.random() * 0.9, life: 1, r: 0.8 + Math.random() * 1.2 };
  }

  click(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, bd = Infinity;
    for (const f of this.figs.values()) {
      if (f.inside || f.alpha < 0.5) continue;
      const d = Math.hypot(f.x - x, f.y - this.fs * 0.7 - y);
      if (d < bd) { bd = d; best = f; }
    }
    if (best && bd < this.fs * 0.9) this.onPick?.(best.a);
  }

  // ---------- 描画 ----------
  draw(now) {
    const x = this.ctx;
    const W = this.W, H = this.H, fs = this.fs;
    const d = DPR();
    x.setTransform(d, 0, 0, d, 0, 0);
    const desc = this.descent;
    let floor = this.floor;
    if (desc) {
      const t = (now - desc.t0) / desc.dur;
      if (t >= 0.5 && !desc.swapped) { desc.swapped = true; desc.onMid?.(); }
      if (t >= 1) this.descent = null;
    }
    const th = art.theme(this.mode === 'boss' ? 11 : floor);
    x.drawImage(art.wall(W, H, this.mode === 'boss' ? 11 : floor), 0, 0, W, H);

    const lights = [];
    // 壁の松明
    const torchY = this.horizon * 0.38;
    // 扉と扉の間に松明を掛ける
    const torchXs = this.mode === 'room' && this.doors.length
      ? Array.from({ length: this.doors.length + 1 }, (_, i) => clamp((i * W) / this.doors.length, W * 0.05, W * 0.95))
      : [W * 0.14, W * 0.86];
    torchXs.forEach((tx, i) => {
      art.sconce(x, tx, torchY, fs * 1.1, now, i * 1.7);
      lights.push({ x: tx, y: torchY - fs * 0.3, r: W * 0.32, k: 0.9 + 0.1 * Math.sin(now * 0.011 + i) });
    });

    if (this.mode === 'title') {
      art.gate(x, W / 2, this.horizon + 4, Math.min(W * 0.36, 220), this.horizon * 0.9, now);
      lights.push({ x: W / 2, y: this.horizon * 0.5, r: W * 0.18, k: 0.4 });
    }

    // 扉
    this.doors.forEach((dr, i) => {
      dr.open += (dr.target - dr.open) * (this.reduced ? 1 : 0.08);
      dr.lit += ((dr.hover || dr.target ? 1 : 0) - dr.lit) * 0.1;
      const g = this.doorGeom(i);
      art.door(x, g.x, g.y, g.w, g.h, dr.tint, dr.glyph, dr.open, dr.lit);
      lights.push({ x: g.x, y: g.y - g.h * 0.4, r: g.w * (0.9 + dr.open), k: 0.25 + dr.open * 0.5 });
    });

    // 戻らなかった者の灯
    for (const c of this.candles) {
      if (now < c.t0) continue;
      const g = this.doorGeom(c.door);
      const side = c.k % 2 ? 1 : -1;
      const n = Math.floor(c.k / 2);
      if (n > 7) continue;
      const cx = g.x + side * (g.w * 0.62 + fs * 0.35 + n * fs * 0.38);
      const cy = g.y + 2 + (n % 2) * 3;
      x.fillStyle = '#d8cdb8';
      x.fillRect(cx - 1.2, cy - fs * 0.35, 2.4, fs * 0.35);
      art.flame(x, cx, cy - fs * 0.35, fs * 0.12, now, c.k);
      lights.push({ x: cx, y: cy - fs * 0.4, r: fs * 1.2, k: 0.5 });
    }
    // 扉の前に溢れた灯の数
    this.doors.forEach((_, i) => {
      const n = this.candles.filter((c) => c.door === i && now >= c.t0).length;
      if (n > 16) {
        const g = this.doorGeom(i);
        x.fillStyle = 'rgba(239,227,204,0.8)';
        x.font = `${Math.round(fs * 0.55)}px 'Zen Old Mincho', serif`;
        x.textAlign = 'center';
        x.fillText(`灯 ${n}`, g.x, g.y + fs * 0.75);
      }
    });

    // 焚き火
    if (this.mode === 'camp') {
      const cx = W / 2, cy = H * 0.74;
      art.campfire(x, cx, cy, fs * 1.6, now);
      lights.push({ x: cx, y: cy - fs, r: W * 0.55, k: 1 + 0.08 * Math.sin(now * 0.02) });
      if (!this.reduced && Math.random() < 0.35) this.particles.push(this.ember(cx, cy - fs * 0.6));
    }

    // 迷宮の主
    if (this.bossDying) this.bossGone = Math.min(1, this.bossGone + 0.012);
    if (this.mode === 'boss' && this.bossId && this.bossGone < 1) {
      const s = Math.min(W * 0.28, H * 0.25);
      this.bossHurt *= 0.9;
      x.save();
      x.globalAlpha = 1 - this.bossGone;
      art.boss(x, this.bossId, W / 2, H * 0.36, s, now, this.bossRage, this.reduced ? 0 : this.bossHurt);
      x.restore();
      lights.push({ x: W / 2, y: H * 0.36, r: s * 1.8, k: 0.35 + this.bossRage * 0.3 });
    }

    // 冒険者(奥から手前へ)
    const figs = [...this.figs.values()].sort((a, b) => a.y - b.y);
    for (const f of figs) {
      if (f.delay && now < f.delay) continue;
      const sp = this.reduced ? 1 : 0.075;
      const dx = f.tx - f.x, dy = f.ty - f.y;
      const moving = Math.abs(dx) + Math.abs(dy) > 0.6;
      f.x += dx * sp;
      f.y += dy * sp;
      f.alpha += (f.ta - f.alpha) * (this.reduced ? 1 : 0.09);
      f.walk = moving ? f.walk + 0.25 : 0;
      if (f.alpha < 0.02) continue;
      const a = f.a;
      const bob = moving ? Math.abs(Math.sin(f.walk)) * fs * 0.08 : 0;
      const spr = art.sprite(a, fs);
      // 覚醒者の足元の光
      if (a.skill) {
        const p = 0.5 + 0.5 * Math.sin(now * 0.004 + f.seed);
        x.fillStyle = `rgba(242,166,74,${(0.18 + p * 0.22) * f.alpha})`;
        x.beginPath(); x.ellipse(f.x, f.y, fs * 0.6, fs * 0.2, 0, 0, Math.PI * 2); x.fill();
        if (!this.reduced && Math.random() < 0.02) this.particles.push(this.spark(f.x, f.y));
      }
      if (f.id === this.selected || f.hero) {
        x.strokeStyle = f.hero ? 'rgba(255,230,168,0.95)' : 'rgba(239,227,204,0.9)';
        x.lineWidth = 1.5;
        x.beginPath(); x.ellipse(f.x, f.y, fs * 0.62, fs * 0.22, 0, 0, Math.PI * 2); x.stroke();
      }
      x.globalAlpha = f.alpha;
      x.drawImage(spr, f.x - fs / 2, f.y - fs * 1.42 - bob, fs, fs * 1.5);
      x.globalAlpha = 1;
      if (a.look?.torch && !a.gear.weapon) {
        art.flame(x, f.x + fs * 0.36, f.y - fs * 0.98 - bob, fs * 0.13, now, f.seed);
        lights.push({ x: f.x + fs * 0.36, y: f.y - fs, r: fs * 2.6, k: 0.6 * f.alpha });
      }
      if (this.heroes.has(f.id)) {
        x.fillStyle = `rgba(255,214,120,${f.alpha})`;
        x.beginPath();
        const sy = f.y - fs * 1.7 - bob;
        x.moveTo(f.x, sy - fs * 0.22); x.lineTo(f.x + fs * 0.12, sy); x.lineTo(f.x, sy + fs * 0.1); x.lineTo(f.x - fs * 0.12, sy);
        x.fill();
      }
    }

    // 予言の光の柱
    if (this.beam) {
      const b = this.beam;
      const f = this.figs.get(b.id);
      const bx = f ? f.x : b.x;
      const bw = fs * (b.final ? 1.1 : 0.8);
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(255,240,200,0)');
      g.addColorStop(0.6, `rgba(255,236,190,${b.final ? 0.55 : 0.32})`);
      g.addColorStop(1, `rgba(255,236,190,${b.final ? 0.8 : 0.45})`);
      x.fillStyle = g;
      x.fillRect(bx - bw / 2, 0, bw, f ? f.y : H);
      lights.push({ x: bx, y: f ? f.y - fs : H * 0.7, r: fs * 4, k: 1 });
    }

    // 覚醒の光
    this.pillars = this.pillars.filter((p) => now - p.t0 < 1800);
    for (const p of this.pillars) {
      const f = this.figs.get(p.id);
      if (!f) continue;
      const t = (now - p.t0) / 1800;
      const a = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
      const g = x.createLinearGradient(0, 0, 0, f.y);
      g.addColorStop(0, `${p.color}0)`);
      g.addColorStop(1, `${p.color}${0.7 * a})`);
      x.fillStyle = g;
      x.fillRect(f.x - fs * 0.45, 0, fs * 0.9, f.y);
      lights.push({ x: f.x, y: f.y - fs, r: fs * 5, k: a });
    }

    // 闇と光
    this.applyLight(lights, th, now);

    // 粒
    if (!this.reduced) {
      if (this.particles.filter((p) => p.kind === 'dust').length < 26) this.particles.push(this.dust(false));
      for (const p of this.particles) {
        p.x += p.vx; p.y += p.vy;
        p.life -= p.kind === 'dust' ? 0.0012 : p.kind === 'ember' ? 0.012 : 0.02;
        if (p.kind !== 'dust') p.vy += 0.015;
        const a = clamp(p.life, 0, 1);
        x.fillStyle = p.kind === 'dust' ? `rgba(255,220,170,${0.18 * a})` : p.kind === 'ember' ? `rgba(255,150,60,${a})` : `rgba(255,224,150,${a})`;
        x.beginPath(); x.arc(p.x, p.y, p.r, 0, Math.PI * 2); x.fill();
      }
      this.particles = this.particles.filter((p) => p.life > 0 && p.y > -10 && p.y < H + 10);
    }

    // 浮かぶ文字
    this.floats = this.floats.filter((f) => now - f.t0 < f.dur);
    x.textAlign = 'center';
    x.textBaseline = 'alphabetic';
    for (const f of this.floats) {
      if (now < f.t0) continue;
      const t = (now - f.t0) / f.dur;
      const a = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
      const size = f.big ? Math.max(15, fs * 0.78) : Math.max(11, fs * 0.55);
      x.font = `700 ${size}px 'Zen Old Mincho', serif`;
      x.globalAlpha = a;
      x.lineWidth = 3;
      x.strokeStyle = 'rgba(10,8,6,0.85)';
      const y = f.y - ease(t) * fs * 0.9;
      x.strokeText(f.text, f.x, y);
      x.fillStyle = f.color;
      x.fillText(f.text, f.x, y);
      x.globalAlpha = 1;
    }

    // 大きな告知
    this.banners = this.banners.filter((b) => now - b.t0 < b.dur);
    for (const b of this.banners) {
      const t = (now - b.t0) / b.dur;
      const a = t < 0.15 ? t / 0.15 : t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
      x.globalAlpha = a;
      const by = this.mode === 'boss' ? H * 0.62 : this.horizon * 0.55;
      const g = x.createLinearGradient(0, by - 30, 0, by + 26);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.5, 'rgba(0,0,0,0.55)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(0, by - 30, W, 56);
      x.font = `${Math.round(clamp(W / 16, 20, 34))}px 'Yuji Syuku', serif`;
      x.fillStyle = b.color;
      x.fillText(b.text, W / 2, by + 6);
      if (b.sub) {
        x.font = `${Math.round(clamp(W / 34, 11, 15))}px 'Zen Old Mincho', serif`;
        x.fillStyle = 'rgba(239,227,204,0.8)';
        x.fillText(b.sub, W / 2, by + 24);
      }
      x.globalAlpha = 1;
    }

    // 閃光
    if (this.flash) {
      const t = (now - this.flash.t0) / this.flash.dur;
      if (t >= 1) this.flash = null;
      else { x.fillStyle = art.rgb(this.flash.color, 0.7 * (1 - t)); x.fillRect(0, 0, W, H); }
    }

    // 降下の遷移
    if (desc) {
      const t = clamp((now - desc.t0) / desc.dur, 0, 1);
      const cover = t < 0.5 ? ease(t * 2) : 1 - ease((t - 0.5) * 2);
      x.fillStyle = `rgba(6,4,3,${cover})`;
      x.fillRect(0, 0, W, H);
      x.globalAlpha = cover;
      const off = t * H * 1.4;
      x.strokeStyle = 'rgba(120,96,70,0.35)';
      x.lineWidth = 2;
      for (let i = -2; i < 12; i++) {
        const y = ((i * H) / 8 - off) % (H * 1.5) + H * 0.25;
        x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke();
      }
      x.font = `${Math.round(clamp(W / 12, 26, 46))}px 'Yuji Syuku', serif`;
      x.fillStyle = '#efe3cc';
      x.fillText(desc.label, W / 2, H / 2 + 8);
      if (desc.sub) {
        x.font = `${Math.round(clamp(W / 32, 12, 16))}px 'Zen Old Mincho', serif`;
        x.fillStyle = 'rgba(239,227,204,0.75)';
        x.fillText(desc.sub, W / 2, H / 2 + 34);
      }
      x.globalAlpha = 1;
    }
  }

  applyLight(lights, th, now) {
    const d = DPR();
    const dc = this.dctx;
    const W = this.W, H = this.H;
    dc.setTransform(d, 0, 0, d, 0, 0);
    dc.globalCompositeOperation = 'source-over';
    dc.clearRect(0, 0, W, H);
    dc.fillStyle = `rgba(4,3,2,${th.dark})`;
    dc.fillRect(0, 0, W, H);
    dc.globalCompositeOperation = 'destination-out';
    for (const l of lights) {
      const r = l.r * (0.96 + 0.04 * Math.sin(now * 0.017 + l.x));
      const g = dc.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
      g.addColorStop(0, `rgba(0,0,0,${clamp(l.k, 0, 1)})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      dc.fillStyle = g;
      dc.fillRect(l.x - r, l.y - r, r * 2, r * 2);
    }
    dc.globalCompositeOperation = 'source-over';
    const x = this.ctx;
    x.drawImage(this.dark, 0, 0, W, H);
    // 光の色味
    x.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      if (l.k < 0.3) continue;
      const g = x.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r * 0.6);
      g.addColorStop(0, art.rgb(th.light, 0.09 * l.k));
      g.addColorStop(1, art.rgb(th.light, 0));
      x.fillStyle = g;
      x.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    x.globalCompositeOperation = 'source-over';
    // 四隅を沈める
    const v = x.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.3, W / 2, H * 0.55, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    x.fillStyle = v;
    x.fillRect(0, 0, W, H);
  }
}
