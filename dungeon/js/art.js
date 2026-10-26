// 百人の迷宮のアート。画像ファイルは使わず、すべて Canvas で描く。
import { CLOAKS, HAIRS, SKINS, hash } from './names.js';
import { GEAR } from './ddata.js';

export const PATH_TINTS = ['#d9643f', '#4f8fc4', '#5fae8f'];
export const FLAME = '#f2a64a';

const DPR = () => Math.min(window.devicePixelRatio || 1, 2);

// 深さで変わる迷宮の色。浅い層は琥珀、中ほどは苔、深い層は冷たい青紫、最深部は深紅。
const THEMES = [
  { at: 1, stone: [58, 48, 40], mortar: [24, 19, 16], moss: [70, 70, 40], light: [255, 178, 92], dark: 0.72 },
  { at: 4, stone: [52, 50, 38], mortar: [20, 20, 14], moss: [64, 86, 44], light: [240, 190, 110], dark: 0.78 },
  { at: 7, stone: [40, 42, 54], mortar: [14, 15, 22], moss: [44, 60, 70], light: [190, 180, 230], dark: 0.84 },
  { at: 11, stone: [54, 28, 28], mortar: [20, 8, 8], moss: [80, 30, 30], light: [255, 120, 80], dark: 0.86 },
];
export function theme(floor) {
  let t = THEMES[0];
  for (const x of THEMES) if (floor >= x.at) t = x;
  return t;
}
export const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const shade = (c, k) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * k))));

function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function offscreen(w, h) {
  const d = DPR();
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * d));
  c.height = Math.max(1, Math.ceil(h * d));
  const ctx = c.getContext('2d');
  ctx.setTransform(d, 0, 0, d, 0, 0);
  return [c, ctx];
}

// ---------- 冒険者 ----------
// 絵の大きさは s(横幅)。足元が (s/2, s*1.42)。
const spriteCache = new Map();

export function spriteKey(a, s) {
  const L = a.look || { cloak: 0, hair: 0, skin: 0, head: 0, torch: false };
  return `${s}|${L.cloak}|${L.hair}|${L.skin}|${L.head}|${L.torch ? 1 : 0}|${a.gear.weapon}|${a.gear.armor}|${a.gear.charm}|${a.wounds}`;
}

export function sprite(a, s) {
  const key = spriteKey(a, s);
  let c = spriteCache.get(key);
  if (!c) {
    if (spriteCache.size > 900) spriteCache.clear();
    c = drawSprite(a, s);
    spriteCache.set(key, c);
  }
  return c;
}

function drawSprite(a, s) {
  const [c, x] = offscreen(s, s * 1.5);
  const u = s / 10;
  const cx = s / 2;
  const L = a.look || { cloak: 0, hair: 0, skin: 0, head: 0, torch: false };
  const cloak = CLOAKS[L.cloak];
  const skin = SKINS[L.skin];
  const hair = HAIRS[L.hair];
  const w = a.gear.weapon;
  const arm = a.gear.armor;
  const charm = a.gear.charm;

  // 旗(英雄の旗)は背中に
  if (charm === 'banner') {
    x.strokeStyle = '#3a2c1e';
    x.lineWidth = u * 0.5;
    x.beginPath(); x.moveTo(cx - 2.2 * u, 12 * u); x.lineTo(cx - 2.2 * u, 0.6 * u); x.stroke();
    x.fillStyle = '#b8322a';
    x.beginPath(); x.moveTo(cx - 2.2 * u, 0.8 * u); x.lineTo(cx - 5 * u, 1.8 * u); x.lineTo(cx - 2.2 * u, 3.2 * u); x.fill();
    x.fillStyle = '#f2c35a';
    x.beginPath(); x.arc(cx - 3.2 * u, 1.9 * u, 0.45 * u, 0, Math.PI * 2); x.fill();
  }
  // 弓は背中側
  if (w === 'thunder') {
    x.strokeStyle = '#8a6ad8';
    x.lineWidth = u * 0.55;
    x.beginPath(); x.arc(cx - 3.4 * u, 8.5 * u, 3.6 * u, -Math.PI * 0.45, Math.PI * 0.45); x.stroke();
    x.strokeStyle = 'rgba(220,210,255,0.8)';
    x.lineWidth = u * 0.15;
    const ax = cx - 3.4 * u + Math.cos(-Math.PI * 0.45) * 3.6 * u;
    x.beginPath(); x.moveTo(ax, 8.5 * u + Math.sin(-Math.PI * 0.45) * 3.6 * u); x.lineTo(ax, 8.5 * u + Math.sin(Math.PI * 0.45) * 3.6 * u); x.stroke();
  }
  // 影
  x.fillStyle = 'rgba(0,0,0,0.38)';
  x.beginPath(); x.ellipse(cx, 14.2 * u, 3.2 * u, 0.9 * u, 0, 0, Math.PI * 2); x.fill();
  // 脚
  x.fillStyle = '#231c17';
  x.fillRect(cx - 1.6 * u, 11.4 * u, 1.1 * u, 2.8 * u);
  x.fillRect(cx + 0.5 * u, 11.4 * u, 1.1 * u, 2.8 * u);
  // 外套
  const g = x.createLinearGradient(cx - 3 * u, 0, cx + 3 * u, 0);
  g.addColorStop(0, cloak);
  g.addColorStop(0.55, cloak);
  g.addColorStop(1, shadeHex(cloak, 0.55));
  x.fillStyle = g;
  x.beginPath();
  x.moveTo(cx - 2.1 * u, 6.1 * u);
  x.quadraticCurveTo(cx, 5.3 * u, cx + 2.1 * u, 6.1 * u);
  x.lineTo(cx + 3.3 * u, 12 * u);
  x.quadraticCurveTo(cx, 12.7 * u, cx - 3.3 * u, 12 * u);
  x.closePath();
  x.fill();
  // 鎧
  if (arm) {
    const m = {
      leather: ['#7a5536', '#4e341f'],
      chain: ['#a3a8ae', '#5f646a'],
      plate: ['#c8ccd2', '#6d727a'],
      dragonmail: ['#3f8a78', '#1d4a40'],
    }[arm];
    const ag = x.createLinearGradient(0, 6.3 * u, 0, 9.8 * u);
    ag.addColorStop(0, m[0]);
    ag.addColorStop(1, m[1]);
    x.fillStyle = ag;
    x.beginPath();
    x.roundRect(cx - 1.9 * u, 6.4 * u, 3.8 * u, 3.4 * u, 0.8 * u);
    x.fill();
    if (arm === 'chain' || arm === 'dragonmail') {
      x.fillStyle = 'rgba(0,0,0,0.25)';
      for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 4; xx++) {
        x.beginPath(); x.arc(cx - 1.4 * u + xx * 0.95 * u, 7 * u + yy * 0.95 * u, 0.22 * u, 0, Math.PI * 2); x.fill();
      }
    }
    if (arm === 'plate') {
      x.fillStyle = 'rgba(255,255,255,0.35)';
      x.fillRect(cx - 1.5 * u, 6.7 * u, 0.6 * u, 2.6 * u);
    }
  }
  // 帯とお守り
  x.fillStyle = 'rgba(20,14,10,0.6)';
  x.fillRect(cx - 2.4 * u, 9.9 * u, 4.8 * u, 0.55 * u);
  if (charm && charm !== 'banner') {
    x.fillStyle = { amulet: '#d0453a', beastward: '#e0c050', trapward: '#c87a3a', lamp: '#fff0b0', sigil: '#8ab0e0' }[charm] || '#d0453a';
    x.beginPath(); x.arc(cx + 1.4 * u, 10.6 * u, 0.5 * u, 0, Math.PI * 2); x.fill();
  }
  // 腕
  x.fillStyle = shadeHex(cloak, 0.8);
  x.beginPath(); x.ellipse(cx - 2.7 * u, 8.4 * u, 0.8 * u, 1.8 * u, 0.2, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.ellipse(cx + 2.7 * u, 8.4 * u, 0.8 * u, 1.8 * u, -0.2, 0, Math.PI * 2); x.fill();
  // 頭
  drawHead(x, cx, 4.3 * u, u, L.head, skin, hair, cloak);
  // 傷
  if (a.wounds >= 1) {
    x.strokeStyle = '#efe6d6';
    x.lineWidth = u * 0.6;
    x.beginPath(); x.moveTo(cx - 1.75 * u, 3.6 * u); x.lineTo(cx + 1.75 * u, 3.1 * u); x.stroke();
    x.fillStyle = '#c8463c';
    x.beginPath(); x.arc(cx + 0.9 * u, 3.25 * u, 0.32 * u, 0, Math.PI * 2); x.fill();
  }
  if (a.wounds >= 2) {
    x.strokeStyle = '#efe6d6';
    x.lineWidth = u * 0.7;
    x.beginPath(); x.moveTo(cx - 2.4 * u, 6.6 * u); x.lineTo(cx - 2.7 * u, 9.6 * u); x.stroke();
    x.fillStyle = 'rgba(160,30,24,0.55)';
    x.beginPath(); x.arc(cx + 1 * u, 8.6 * u, 0.7 * u, 0, Math.PI * 2); x.fill();
  }
  // 武器(右手)
  drawWeapon(x, cx + 2.9 * u, 9 * u, u, w);
  if (!w && L.torch) {
    x.strokeStyle = '#4a3420';
    x.lineWidth = u * 0.6;
    x.beginPath(); x.moveTo(cx + 2.9 * u, 9.4 * u); x.lineTo(cx + 3.6 * u, 4.6 * u); x.stroke();
  }
  return c;
}

function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return rgb(shade(c, k));
}

function drawHead(x, cx, cy, u, type, skin, hair, cloak) {
  const r = 1.75 * u;
  if (type === 1) {
    // 頭巾
    x.fillStyle = shadeHex(cloak, 0.85);
    x.beginPath(); x.arc(cx, cy - 0.1 * u, r * 1.22, 0, Math.PI * 2); x.fill();
    x.fillStyle = skin;
    x.beginPath(); x.arc(cx, cy + 0.35 * u, r * 0.78, 0, Math.PI * 2); x.fill();
    return;
  }
  x.fillStyle = skin;
  x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  if (type === 0 || type === 4) {
    x.fillStyle = hair;
    x.beginPath(); x.arc(cx, cy - 0.2 * u, r * 1.04, Math.PI * 1.02, Math.PI * 1.98); x.fill();
    x.fillRect(cx - r * 1.02, cy - 0.4 * u, 0.55 * u, 1.3 * u);
    if (type === 4) {
      x.fillStyle = '#b8322a';
      x.fillRect(cx - r, cy - 0.9 * u, r * 2, 0.55 * u);
    }
  } else {
    // 兜
    const steel = type === 3 ? '#3a3330' : '#8f959b';
    x.fillStyle = steel;
    x.beginPath(); x.arc(cx, cy - 0.15 * u, r * 1.1, Math.PI, Math.PI * 2); x.fill();
    x.fillRect(cx - r * 1.15, cy - 0.3 * u, r * 2.3, 0.5 * u);
    x.fillRect(cx - 0.18 * u, cy - 0.3 * u, 0.36 * u, 1.4 * u);
    if (type === 3) {
      x.strokeStyle = '#e0b04a';
      x.lineWidth = u * 0.45;
      x.lineCap = 'round';
      x.beginPath();
      x.moveTo(cx - 0.6 * u, cy - 1.5 * u); x.quadraticCurveTo(cx - 2.6 * u, cy - 2.8 * u, cx - 1.8 * u, cy - 4.2 * u);
      x.moveTo(cx + 0.6 * u, cy - 1.5 * u); x.quadraticCurveTo(cx + 2.6 * u, cy - 2.8 * u, cx + 1.8 * u, cy - 4.2 * u);
      x.stroke();
    }
  }
}

function drawWeapon(x, hx, hy, u, w) {
  if (!w || w === 'thunder') return;
  x.lineCap = 'round';
  const elem = GEAR[w].elem;
  if (elem) {
    x.shadowColor = { holy: '#fff2b0', fire: '#ff7a3a', ice: '#9ad8ff' }[elem] || 'transparent';
    x.shadowBlur = u * 2;
  }
  if (['rusty', 'steel', 'demon', 'holy'].includes(w)) {
    const blade = { rusty: '#8a6a4e', steel: '#cfd5db', demon: '#4a2a4e', holy: '#fff0c0' }[w];
    x.strokeStyle = blade;
    x.lineWidth = u * (w === 'demon' ? 0.75 : 0.6);
    x.beginPath(); x.moveTo(hx, hy - 0.4 * u); x.lineTo(hx + 1.1 * u, hy - 6.6 * u); x.stroke();
    if (w === 'demon') {
      x.strokeStyle = '#d0302a';
      x.lineWidth = u * 0.18;
      x.beginPath(); x.moveTo(hx + 0.15 * u, hy - 1.2 * u); x.lineTo(hx + 1.15 * u, hy - 6.4 * u); x.stroke();
    }
    x.shadowBlur = 0;
    x.strokeStyle = '#6a5030';
    x.lineWidth = u * 0.45;
    x.beginPath(); x.moveTo(hx - 0.9 * u, hy - 0.5 * u); x.lineTo(hx + 0.95 * u, hy - 0.85 * u); x.stroke();
  } else if (w === 'axe' || w === 'fire') {
    x.strokeStyle = '#5a3e26';
    x.lineWidth = u * 0.5;
    x.beginPath(); x.moveTo(hx, hy + 0.6 * u); x.lineTo(hx + 0.6 * u, hy - 5.4 * u); x.stroke();
    x.fillStyle = w === 'fire' ? '#ff7a3a' : '#b8bec4';
    x.beginPath();
    x.moveTo(hx + 0.5 * u, hy - 5.2 * u);
    x.quadraticCurveTo(hx + 3.2 * u, hy - 5 * u, hx + 2.9 * u, hy - 2.6 * u);
    x.lineTo(hx + 0.35 * u, hy - 3.4 * u);
    x.closePath();
    x.fill();
  } else if (w === 'ice' || w === 'dragonspear') {
    x.strokeStyle = w === 'ice' ? '#9ad8ff' : '#6a4a2a';
    x.lineWidth = u * 0.45;
    x.beginPath(); x.moveTo(hx - 0.2 * u, hy + 2 * u); x.lineTo(hx + 1 * u, hy - 9 * u); x.stroke();
    x.fillStyle = w === 'ice' ? '#e0f4ff' : '#f2c35a';
    x.beginPath();
    x.moveTo(hx + 1.12 * u, hy - 10.8 * u);
    x.lineTo(hx + 1.6 * u, hy - 8.6 * u);
    x.lineTo(hx + 0.6 * u, hy - 8.7 * u);
    x.closePath();
    x.fill();
  }
  x.shadowBlur = 0;
}

// ---------- 石室の背景 ----------
const bgCache = new Map();
export function wall(w, h, floor, seed = 7) {
  const key = `${Math.round(w)}x${Math.round(h)}|${floor}|${seed}`;
  if (bgCache.has(key)) return bgCache.get(key);
  if (bgCache.size > 12) bgCache.clear();
  const [c, x] = offscreen(w, h);
  const t = theme(floor);
  const r = rand(hash(seed, floor));
  const horizon = h * 0.62;
  // 壁の石積み
  x.fillStyle = rgb(t.mortar);
  x.fillRect(0, 0, w, h);
  const bh = Math.max(14, h / 16);
  for (let row = 0, y = 0; y < horizon; row++, y += bh) {
    const bw = bh * (2 + r() * 0.6);
    for (let xx = -(row % 2) * bw * 0.5; xx < w; xx += bw) {
      const k = 0.75 + r() * 0.5;
      x.fillStyle = rgb(shade(t.stone, k));
      x.fillRect(xx + 1.5, y + 1.5, bw - 3, bh - 3);
      // 石の上辺に薄い光、下辺に影
      x.fillStyle = 'rgba(255,255,255,0.04)';
      x.fillRect(xx + 1.5, y + 1.5, bw - 3, 2);
      x.fillStyle = 'rgba(0,0,0,0.18)';
      x.fillRect(xx + 1.5, y + bh - 4, bw - 3, 2.5);
      if (r() < 0.12) {
        x.fillStyle = rgb(t.moss, 0.35 + r() * 0.3);
        x.beginPath();
        x.ellipse(xx + r() * bw, y + bh - 3, bw * (0.2 + r() * 0.3), 3 + r() * 4, 0, Math.PI, Math.PI * 2);
        x.fill();
      }
      if (r() < 0.05) {
        x.strokeStyle = 'rgba(0,0,0,0.35)';
        x.lineWidth = 1;
        x.beginPath();
        let px = xx + r() * bw, py = y + 2;
        x.moveTo(px, py);
        for (let i = 0; i < 4; i++) { px += (r() - 0.5) * 8; py += bh / 4; x.lineTo(px, py); }
        x.stroke();
      }
    }
  }
  // 床石(奥行きのある敷石)
  const fg = x.createLinearGradient(0, horizon, 0, h);
  fg.addColorStop(0, rgb(shade(t.stone, 0.55)));
  fg.addColorStop(1, rgb(shade(t.stone, 0.32)));
  x.fillStyle = fg;
  x.fillRect(0, horizon, w, h - horizon);
  x.strokeStyle = 'rgba(0,0,0,0.3)';
  x.lineWidth = 1;
  for (let i = 1; i < 7; i++) {
    const y = horizon + (h - horizon) * Math.pow(i / 7, 1.6);
    x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke();
  }
  for (let i = -8; i <= 8; i++) {
    x.beginPath();
    x.moveTo(w / 2 + i * w * 0.07, horizon);
    x.lineTo(w / 2 + i * w * 0.2, h);
    x.stroke();
  }
  // 壁と床の境の影
  const sg = x.createLinearGradient(0, horizon - 10, 0, horizon + 14);
  sg.addColorStop(0, 'rgba(0,0,0,0)');
  sg.addColorStop(0.5, 'rgba(0,0,0,0.45)');
  sg.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = sg;
  x.fillRect(0, horizon - 10, w, 24);
  bgCache.set(key, c);
  return c;
}

// ---------- 扉 ----------
// (x, y) は扉の下辺の中央。open は 0〜1。
export function door(x, cx, cy, w, h, tint, glyph, open, lit) {
  const top = cy - h;
  // 石の枠
  x.fillStyle = '#3a322b';
  x.beginPath();
  x.moveTo(cx - w * 0.62, cy);
  x.lineTo(cx - w * 0.62, top + w * 0.5);
  x.arc(cx, top + w * 0.5, w * 0.62, Math.PI, 0);
  x.lineTo(cx + w * 0.62, cy);
  x.closePath();
  x.fill();
  // 枠石の継ぎ目
  x.strokeStyle = 'rgba(0,0,0,0.35)';
  x.lineWidth = 1.5;
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI + (Math.PI * i) / 8;
    x.beginPath();
    x.moveTo(cx + Math.cos(a) * w * 0.5, top + w * 0.5 + Math.sin(a) * w * 0.5);
    x.lineTo(cx + Math.cos(a) * w * 0.62, top + w * 0.5 + Math.sin(a) * w * 0.62);
    x.stroke();
  }
  // 闇の口
  x.save();
  x.beginPath();
  x.moveTo(cx - w * 0.5, cy);
  x.lineTo(cx - w * 0.5, top + w * 0.5);
  x.arc(cx, top + w * 0.5, w * 0.5, Math.PI, 0);
  x.lineTo(cx + w * 0.5, cy);
  x.closePath();
  x.clip();
  const ig = x.createRadialGradient(cx, cy - h * 0.35, 2, cx, cy - h * 0.35, h * 0.8);
  ig.addColorStop(0, open > 0 ? hexA(tint, 0.18 * open) : 'rgba(0,0,0,1)');
  ig.addColorStop(1, '#030202');
  x.fillStyle = '#030202';
  x.fillRect(cx - w, top, w * 2, h);
  x.fillStyle = ig;
  x.fillRect(cx - w, top, w * 2, h);
  // 扉板(左右に開く)
  const leaf = (w / 2) * (1 - open);
  if (leaf > 0.5) {
    for (const side of [-1, 1]) {
      const lx = side < 0 ? cx - w * 0.5 : cx + w * 0.5 - leaf;
      const lg = x.createLinearGradient(lx, 0, lx + leaf, 0);
      lg.addColorStop(0, '#3b2a1c');
      lg.addColorStop(1, '#2a1d13');
      x.fillStyle = lg;
      x.fillRect(lx, top, leaf, h);
      x.strokeStyle = 'rgba(0,0,0,0.4)';
      x.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        x.beginPath(); x.moveTo(lx + (leaf * i) / 4, top); x.lineTo(lx + (leaf * i) / 4, cy); x.stroke();
      }
      x.fillStyle = '#6a5a48';
      x.fillRect(lx, cy - h * 0.62, leaf, 3);
      x.fillRect(lx, cy - h * 0.25, leaf, 3);
    }
  }
  x.restore();
  // 枠の内側の色の縁取り
  x.strokeStyle = hexA(tint, 0.55 + 0.3 * lit);
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(cx - w * 0.5, cy);
  x.lineTo(cx - w * 0.5, top + w * 0.5);
  x.arc(cx, top + w * 0.5, w * 0.5, Math.PI, 0);
  x.lineTo(cx + w * 0.5, cy);
  x.stroke();
  // 要石の刻印
  const ky = top - w * 0.1;
  x.fillStyle = '#4a4038';
  x.beginPath(); x.roundRect(cx - w * 0.26, ky - w * 0.22, w * 0.52, w * 0.4, 4); x.fill();
  x.font = `${Math.round(w * 0.3)}px 'Yuji Syuku', serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.shadowColor = tint;
  x.shadowBlur = 8 + 10 * lit;
  x.fillStyle = hexA(tint, 0.85 + 0.15 * lit);
  x.fillText(glyph, cx, ky - w * 0.02);
  x.shadowBlur = 0;
}

export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---------- 炎 ----------
export function flame(x, cx, cy, s, t, seed = 0) {
  const f = 0.85 + 0.15 * Math.sin(t * 0.013 + seed) + 0.08 * Math.sin(t * 0.031 + seed * 2);
  const layers = [['rgba(200,60,20,0.85)', 1], ['rgba(250,150,40,0.9)', 0.7], ['rgba(255,230,160,0.95)', 0.38]];
  for (const [col, k] of layers) {
    x.fillStyle = col;
    x.beginPath();
    const hgt = s * 1.6 * k * f;
    const wid = s * 0.55 * k;
    const sway = Math.sin(t * 0.009 + seed) * s * 0.12 * k;
    x.moveTo(cx - wid, cy);
    x.quadraticCurveTo(cx - wid * 1.1, cy - hgt * 0.5, cx + sway, cy - hgt);
    x.quadraticCurveTo(cx + wid * 1.1, cy - hgt * 0.5, cx + wid, cy);
    x.quadraticCurveTo(cx, cy + wid * 0.5, cx - wid, cy);
    x.fill();
  }
}

export function sconce(x, cx, cy, s, t, seed) {
  x.fillStyle = '#2a221c';
  x.fillRect(cx - s * 0.12, cy, s * 0.24, s * 0.9);
  x.fillStyle = '#4a3b2e';
  x.beginPath();
  x.moveTo(cx - s * 0.45, cy);
  x.lineTo(cx + s * 0.45, cy);
  x.lineTo(cx + s * 0.25, cy + s * 0.3);
  x.lineTo(cx - s * 0.25, cy + s * 0.3);
  x.fill();
  flame(x, cx, cy, s * 0.55, t, seed);
}

export function campfire(x, cx, cy, s, t) {
  x.strokeStyle = '#3a2618';
  x.lineCap = 'round';
  x.lineWidth = s * 0.18;
  x.beginPath();
  x.moveTo(cx - s * 0.7, cy + s * 0.1); x.lineTo(cx + s * 0.6, cy - s * 0.12);
  x.moveTo(cx - s * 0.6, cy - s * 0.12); x.lineTo(cx + s * 0.7, cy + s * 0.1);
  x.stroke();
  x.fillStyle = 'rgba(255,120,40,0.5)';
  x.beginPath(); x.ellipse(cx, cy + s * 0.05, s * 0.55, s * 0.16, 0, 0, Math.PI * 2); x.fill();
  flame(x, cx - s * 0.18, cy, s * 0.55, t, 1);
  flame(x, cx + s * 0.2, cy, s * 0.5, t, 2.7);
  flame(x, cx, cy, s * 0.75, t, 4.1);
  // 石の輪
  x.fillStyle = '#4a4038';
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    x.beginPath(); x.ellipse(cx + Math.cos(a) * s * 0.9, cy + Math.sin(a) * s * 0.28 + s * 0.08, s * 0.16, s * 0.1, 0, 0, Math.PI * 2); x.fill();
  }
}

// ---------- 迷宮の門(表紙) ----------
export function gate(x, cx, cy, w, h, t) {
  x.fillStyle = '#2b241f';
  x.beginPath();
  x.moveTo(cx - w * 0.72, cy);
  x.lineTo(cx - w * 0.72, cy - h + w * 0.72);
  x.arc(cx, cy - h + w * 0.72, w * 0.72, Math.PI, 0);
  x.lineTo(cx + w * 0.72, cy);
  x.fill();
  x.strokeStyle = 'rgba(0,0,0,0.4)';
  x.lineWidth = 2;
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI + (Math.PI * i) / 12;
    x.beginPath();
    x.moveTo(cx + Math.cos(a) * w * 0.55, cy - h + w * 0.72 + Math.sin(a) * w * 0.55);
    x.lineTo(cx + Math.cos(a) * w * 0.72, cy - h + w * 0.72 + Math.sin(a) * w * 0.72);
    x.stroke();
  }
  x.save();
  x.beginPath();
  x.moveTo(cx - w * 0.55, cy);
  x.lineTo(cx - w * 0.55, cy - h + w * 0.72);
  x.arc(cx, cy - h + w * 0.72, w * 0.55, Math.PI, 0);
  x.lineTo(cx + w * 0.55, cy);
  x.clip();
  const g = x.createLinearGradient(0, cy - h, 0, cy);
  g.addColorStop(0, '#000');
  g.addColorStop(1, '#0b0705');
  x.fillStyle = g;
  x.fillRect(cx - w, cy - h, w * 2, h);
  // 奥へ続く階段
  for (let i = 0; i < 9; i++) {
    const k = i / 9;
    const sw = w * (1.05 - k * 0.8);
    const sy = cy - h * 0.06 - k * h * 0.45;
    x.fillStyle = `rgba(90,70,50,${0.55 * (1 - k)})`;
    x.fillRect(cx - sw / 2, sy, sw, Math.max(1, h * 0.035 * (1 - k)));
  }
  // 奥の小さな光
  const pg = x.createRadialGradient(cx, cy - h * 0.55, 0, cx, cy - h * 0.55, w * 0.25);
  pg.addColorStop(0, `rgba(255,180,90,${0.25 + 0.05 * Math.sin(t * 0.002)})`);
  pg.addColorStop(1, 'rgba(255,180,90,0)');
  x.fillStyle = pg;
  x.fillRect(cx - w, cy - h, w * 2, h);
  x.restore();
}

// ---------- 迷宮の主 ----------
// (cx, cy) は主の中心、s は大きさの目安。t は時間、rage は 0〜1(必殺の予兆)。
export function boss(x, id, cx, cy, s, t, rage = 0, hurt = 0) {
  x.save();
  const breathe = 1 + Math.sin(t * 0.0018) * 0.02;
  x.translate(cx + (hurt ? (Math.random() - 0.5) * hurt * 10 : 0), cy);
  x.scale(breathe, breathe);
  if (rage > 0) {
    const ag = x.createRadialGradient(0, 0, s * 0.2, 0, 0, s * 1.4);
    ag.addColorStop(0, `rgba(200,30,20,${0.35 * rage})`);
    ag.addColorStop(1, 'rgba(200,30,20,0)');
    x.fillStyle = ag;
    x.fillRect(-s * 1.5, -s * 1.5, s * 3, s * 3);
  }
  ({ lich: drawLich, dragon: drawDragon, eye: drawEye, queen: drawQueen }[id] || drawLich)(x, s, t, rage);
  x.restore();
}

function glowEyes(x, pts, r, col, t) {
  const k = 0.7 + 0.3 * Math.sin(t * 0.004);
  x.shadowColor = col;
  x.shadowBlur = r * 4;
  x.fillStyle = col;
  for (const [px, py] of pts) { x.beginPath(); x.arc(px, py, r * k, 0, Math.PI * 2); x.fill(); }
  x.shadowBlur = 0;
}

function drawLich(x, s, t) {
  // 襤褸の衣
  x.fillStyle = '#1a1512';
  x.beginPath();
  x.moveTo(-s * 0.9, s * 1.1);
  x.quadraticCurveTo(-s * 0.85, s * 0.1, -s * 0.35, -s * 0.05);
  x.lineTo(s * 0.35, -s * 0.05);
  x.quadraticCurveTo(s * 0.85, s * 0.1, s * 0.9, s * 1.1);
  for (let i = 0; i < 8; i++) x.lineTo(s * 0.9 - (i + 0.5) * s * 0.225, s * (1 + (i % 2 ? 0.12 : -0.02)));
  x.closePath();
  x.fill();
  // 肋骨
  x.strokeStyle = '#cfc4a8';
  x.lineWidth = s * 0.035;
  for (let i = 0; i < 4; i++) {
    const y = s * (0.18 + i * 0.11);
    x.beginPath(); x.ellipse(0, y, s * (0.28 - i * 0.03), s * 0.06, 0, 0, Math.PI); x.stroke();
  }
  x.beginPath(); x.moveTo(0, s * 0.08); x.lineTo(0, s * 0.62); x.stroke();
  // 頭蓋
  x.fillStyle = '#ddd2b8';
  x.beginPath(); x.ellipse(0, -s * 0.38, s * 0.3, s * 0.34, 0, 0, Math.PI * 2); x.fill();
  x.fillRect(-s * 0.16, -s * 0.18, s * 0.32, s * 0.16);
  x.fillStyle = '#120e0c';
  x.beginPath(); x.ellipse(-s * 0.12, -s * 0.4, s * 0.08, s * 0.09, 0, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.ellipse(s * 0.12, -s * 0.4, s * 0.08, s * 0.09, 0, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.moveTo(0, -s * 0.3); x.lineTo(-s * 0.04, -s * 0.22); x.lineTo(s * 0.04, -s * 0.22); x.fill();
  x.strokeStyle = '#120e0c';
  x.lineWidth = s * 0.015;
  for (let i = -3; i <= 3; i++) { x.beginPath(); x.moveTo(i * s * 0.04, -s * 0.16); x.lineTo(i * s * 0.04, -s * 0.06); x.stroke(); }
  glowEyes(x, [[-s * 0.12, -s * 0.4], [s * 0.12, -s * 0.4]], s * 0.03, '#7ae0ff', t);
  // 冠
  x.fillStyle = '#c8a040';
  x.beginPath();
  x.moveTo(-s * 0.28, -s * 0.62);
  for (let i = 0; i <= 6; i++) x.lineTo(-s * 0.28 + i * s * 0.093, -s * (i % 2 ? 0.66 : 0.84));
  x.lineTo(s * 0.28, -s * 0.58);
  x.lineTo(-s * 0.28, -s * 0.58);
  x.fill();
}

function drawDragon(x, s, t, rage) {
  // 首
  x.fillStyle = '#3a120e';
  x.beginPath();
  x.moveTo(-s * 0.45, s * 1.2);
  x.quadraticCurveTo(-s * 0.35, s * 0.3, -s * 0.25, 0);
  x.lineTo(s * 0.25, 0);
  x.quadraticCurveTo(s * 0.35, s * 0.3, s * 0.45, s * 1.2);
  x.fill();
  x.fillStyle = '#5a1e16';
  for (let i = 0; i < 6; i++) { x.beginPath(); x.ellipse(0, s * (0.15 + i * 0.17), s * (0.18 + i * 0.02), s * 0.05, 0, 0, Math.PI * 2); x.fill(); }
  // 角
  x.fillStyle = '#2a1a14';
  for (const sd of [-1, 1]) {
    x.beginPath();
    x.moveTo(sd * s * 0.22, -s * 0.55);
    x.quadraticCurveTo(sd * s * 0.75, -s * 0.85, sd * s * 0.62, -s * 1.15);
    x.quadraticCurveTo(sd * s * 0.5, -s * 0.8, sd * s * 0.12, -s * 0.45);
    x.fill();
  }
  // 頭
  x.fillStyle = '#4a1610';
  x.beginPath();
  x.moveTo(-s * 0.35, -s * 0.55);
  x.quadraticCurveTo(0, -s * 0.8, s * 0.35, -s * 0.55);
  x.lineTo(s * 0.28, s * 0.05);
  x.quadraticCurveTo(0, s * 0.25, -s * 0.28, s * 0.05);
  x.closePath();
  x.fill();
  // 口の炎
  const open = 0.06 + 0.04 * Math.sin(t * 0.003) + rage * 0.1;
  x.fillStyle = '#1a0605';
  x.beginPath(); x.ellipse(0, s * 0.02, s * 0.2, s * open, 0, 0, Math.PI * 2); x.fill();
  const fg = x.createRadialGradient(0, s * 0.02, 0, 0, s * 0.02, s * 0.2);
  fg.addColorStop(0, `rgba(255,200,80,${0.6 + rage * 0.4})`);
  fg.addColorStop(1, 'rgba(255,80,20,0)');
  x.fillStyle = fg;
  x.beginPath(); x.ellipse(0, s * 0.02, s * 0.2, s * open, 0, 0, Math.PI * 2); x.fill();
  // 牙
  x.fillStyle = '#e8dcc0';
  for (let i = -2; i <= 2; i++) { x.beginPath(); x.moveTo(i * s * 0.07 - s * 0.02, -s * 0.03); x.lineTo(i * s * 0.07, s * 0.04); x.lineTo(i * s * 0.07 + s * 0.02, -s * 0.03); x.fill(); }
  glowEyes(x, [[-s * 0.16, -s * 0.38], [s * 0.16, -s * 0.38]], s * 0.035, '#ffb030', t);
}

function drawEye(x, s, t) {
  // 触手
  x.strokeStyle = '#2a1e30';
  x.lineCap = 'round';
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.sin(t * 0.001 + i) * 0.1;
    x.lineWidth = s * 0.06;
    x.beginPath();
    x.moveTo(Math.cos(a) * s * 0.5, Math.sin(a) * s * 0.4);
    x.quadraticCurveTo(Math.cos(a + 0.4) * s * 0.85, Math.sin(a + 0.4) * s * 0.75, Math.cos(a + 0.1) * s * 1.1, Math.sin(a + 0.1) * s * 0.95);
    x.stroke();
  }
  // 白目
  const blink = Math.max(0.08, Math.min(1, Math.abs(Math.sin(t * 0.0006)) * 6));
  x.fillStyle = '#2a1e30';
  x.beginPath(); x.ellipse(0, 0, s * 0.62, s * 0.46, 0, 0, Math.PI * 2); x.fill();
  x.save();
  x.beginPath(); x.ellipse(0, 0, s * 0.55, s * 0.4 * blink, 0, 0, Math.PI * 2); x.clip();
  x.fillStyle = '#d8ccc0';
  x.fillRect(-s, -s, s * 2, s * 2);
  x.strokeStyle = 'rgba(160,30,40,0.6)';
  x.lineWidth = s * 0.01;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    x.beginPath(); x.moveTo(Math.cos(a) * s * 0.55, Math.sin(a) * s * 0.4);
    x.quadraticCurveTo(Math.cos(a + 0.3) * s * 0.35, Math.sin(a + 0.3) * s * 0.25, Math.cos(a) * s * 0.22, Math.sin(a) * s * 0.2);
    x.stroke();
  }
  const look = Math.sin(t * 0.0009) * s * 0.08;
  const ig = x.createRadialGradient(look, 0, s * 0.02, look, 0, s * 0.24);
  ig.addColorStop(0, '#d0a0ff');
  ig.addColorStop(1, '#40206a');
  x.fillStyle = ig;
  x.beginPath(); x.arc(look, 0, s * 0.24, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#05020a';
  x.beginPath(); x.ellipse(look, 0, s * 0.04, s * 0.18, 0, 0, Math.PI * 2); x.fill();
  x.restore();
}

function drawQueen(x, s, t) {
  // 胴の節(縦にうねる)
  const segs = 9;
  for (let i = segs - 1; i >= 0; i--) {
    const k = i / segs;
    const px = Math.sin(t * 0.0012 + k * 4) * s * 0.18;
    const py = s * (-0.2 + k * 1.3);
    const r = s * (0.24 - k * 0.08);
    x.strokeStyle = '#2a1a10';
    x.lineWidth = s * 0.025;
    for (const sd of [-1, 1]) {
      const lw = Math.sin(t * 0.006 + i) * 0.1;
      x.beginPath(); x.moveTo(px + sd * r * 0.8, py); x.lineTo(px + sd * r * 2, py + s * (0.06 + lw)); x.lineTo(px + sd * r * 2.4, py + s * 0.16); x.stroke();
    }
    x.fillStyle = i % 2 ? '#5a3a1c' : '#4a2e16';
    x.beginPath(); x.ellipse(px, py, r, r * 0.6, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(255,200,120,0.15)';
    x.beginPath(); x.ellipse(px - r * 0.3, py - r * 0.2, r * 0.4, r * 0.15, 0, 0, Math.PI * 2); x.fill();
  }
  // 頭と顎
  const hx = Math.sin(t * 0.0012) * s * 0.18;
  x.fillStyle = '#3a2412';
  x.beginPath(); x.ellipse(hx, -s * 0.38, s * 0.26, s * 0.2, 0, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#c8a060';
  x.lineWidth = s * 0.04;
  const m = Math.sin(t * 0.005) * 0.15;
  for (const sd of [-1, 1]) {
    x.beginPath();
    x.moveTo(hx + sd * s * 0.12, -s * 0.24);
    x.quadraticCurveTo(hx + sd * s * (0.3 + m), -s * 0.1, hx + sd * s * 0.06, s * 0.02);
    x.stroke();
  }
  // 冠
  x.fillStyle = '#c8a040';
  x.beginPath();
  x.moveTo(hx - s * 0.18, -s * 0.52);
  for (let i = 0; i <= 4; i++) x.lineTo(hx - s * 0.18 + i * s * 0.09, -s * (i % 2 ? 0.56 : 0.7));
  x.lineTo(hx + s * 0.18, -s * 0.5);
  x.fill();
  glowEyes(x, [[hx - s * 0.1, -s * 0.4], [hx + s * 0.1, -s * 0.4]], s * 0.025, '#8aff60', t);
}
