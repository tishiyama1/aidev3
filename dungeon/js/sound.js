// 百人の迷宮の音。音源ファイルは使わず、すべて Web Audio で合成する。
// 場面ごとの環境音と音楽(scene)と、効果音(sfx)を持つ。音楽と効果音の音量は別々に設定できる。

let ac = null;
let master, musicBus, sfxBus, verb, verbIn, noiseBuf;
const vol = { music: 0.6, sfx: 0.8 };
let current = null; // { name, gain, nodes, timer }
let wantScene = null;
const last = {};

function ensure() {
  if (ac) return ac;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ac = new AC();
  master = ac.createGain();
  master.gain.value = 0.9;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ac.destination);
  musicBus = ac.createGain();
  sfxBus = ac.createGain();
  musicBus.gain.value = vol.music;
  sfxBus.gain.value = vol.sfx;
  musicBus.connect(master);
  sfxBus.connect(master);
  // 洞窟の残響(減衰する雑音から作った響き)
  verb = ac.createConvolver();
  const len = ac.sampleRate * 2.6;
  const ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  verb.buffer = ir;
  verbIn = ac.createGain();
  verbIn.gain.value = 0.5;
  verbIn.connect(verb).connect(master);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  return ac;
}

export function unlock() {
  const a = ensure();
  if (!a) return;
  if (a.state === 'suspended') a.resume();
  if (wantScene && (!current || current.name !== wantScene.name)) scene(wantScene.name, wantScene.opts);
}

export function setVolumes(music, sfx) {
  vol.music = music;
  vol.sfx = sfx;
  if (!ac) return;
  musicBus.gain.setTargetAtTime(music, ac.currentTime, 0.1);
  sfxBus.gain.setTargetAtTime(sfx, ac.currentTime, 0.1);
}

function throttle(name, ms) {
  const now = performance.now();
  if (last[name] && now - last[name] < ms) return false;
  last[name] = now;
  return true;
}

// ---------- 音の部品 ----------
function tone(bus, { f = 440, f2 = null, type = 'sine', t = 0, dur = 0.3, vol: v = 0.2, attack = 0.005, verbAmt = 0.2, filter = null }) {
  if (!ac) return;
  const t0 = ac.currentTime + t;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node = o;
  if (filter) {
    const fl = ac.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = filter;
    node = o.connect(fl);
  }
  node.connect(g);
  g.connect(bus);
  if (verbAmt) {
    const s = ac.createGain();
    s.gain.value = verbAmt;
    g.connect(s).connect(verbIn);
  }
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise(bus, { t = 0, dur = 0.3, vol: v = 0.2, freq = 800, q = 1, type = 'bandpass', attack = 0.003, verbAmt = 0.15 }) {
  if (!ac) return;
  const t0 = ac.currentTime + t;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const fl = ac.createBiquadFilter();
  fl.type = type;
  fl.frequency.value = freq;
  fl.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(fl).connect(g).connect(bus);
  if (verbAmt) {
    const s = ac.createGain();
    s.gain.value = verbAmt;
    g.connect(s).connect(verbIn);
  }
  src.start(t0, Math.random() * 1.5);
  src.stop(t0 + dur + 0.05);
}

// 撥弦(琴のような音)
function pluck(bus, f, t = 0, v = 0.12, dur = 2.2) {
  tone(bus, { f, type: 'triangle', t, dur, vol: v, attack: 0.004, verbAmt: 0.55, filter: 2400 });
  tone(bus, { f: f * 2, type: 'sine', t, dur: dur * 0.5, vol: v * 0.35, attack: 0.003, verbAmt: 0.4 });
}

// 鐘(倍音のずれた金属音)
function bell(bus, f, t = 0, v = 0.15, dur = 3) {
  [1, 2.76, 5.4, 8.93].forEach((m, i) => tone(bus, { f: f * m, t, dur: dur / (i * 0.7 + 1), vol: v / (i + 1), attack: 0.004, verbAmt: 0.6 }));
}

const PENTA_MINOR = [0, 3, 5, 7, 10];
const PENTA_MAJOR = [0, 2, 4, 7, 9];
const note = (root, scale, deg, oct = 0) => root * Math.pow(2, (scale[((deg % 5) + 5) % 5] + 12 * (Math.floor(deg / 5) + oct)) / 12);

// ---------- 場面の音 ----------
// name: 'title' | 'dungeon' | 'camp' | 'boss' | 'silent'。opts.depth(層)と opts.intensity(0〜1)
export function scene(name, opts = {}) {
  wantScene = { name, opts };
  if (!ac || ac.state !== 'running') return;
  if (current && current.name === name) { current.opts = opts; return; }
  if (current) {
    const old = current;
    old.gain.gain.setTargetAtTime(0, ac.currentTime, 0.6);
    clearInterval(old.timer);
    setTimeout(() => old.nodes.forEach((n) => { try { n.stop(); } catch { /* 停止済み */ } }), 3000);
  }
  if (name === 'silent') { current = null; return; }
  const gain = ac.createGain();
  gain.gain.value = 0;
  gain.gain.setTargetAtTime(1, ac.currentTime, 1.2);
  gain.connect(musicBus);
  const nodes = [];
  current = { name, gain, nodes, opts, timer: null, beat: 0, next: ac.currentTime + 0.5 };

  const drone = (f, type, v, cutoff) => {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const fl = ac.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = cutoff;
    const g = ac.createGain();
    g.gain.value = v;
    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.05 + Math.random() * 0.08;
    const lg = ac.createGain();
    lg.gain.value = v * 0.5;
    lfo.connect(lg).connect(g.gain);
    o.connect(fl).connect(g).connect(gain);
    o.start();
    lfo.start();
    nodes.push(o, lfo);
  };
  const wind = (v, center) => {
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const fl = ac.createBiquadFilter();
    fl.type = 'bandpass';
    fl.frequency.value = center;
    fl.Q.value = 0.7;
    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ac.createGain();
    lg.gain.value = center * 0.5;
    lfo.connect(lg).connect(fl.frequency);
    const g = ac.createGain();
    g.gain.value = v;
    src.connect(fl).connect(g).connect(gain);
    src.start();
    lfo.start();
    nodes.push(src, lfo);
  };

  const depth = () => current?.opts?.depth || 1;
  if (name === 'title' || name === 'dungeon') {
    const root = 73.42 * Math.pow(2, -Math.min(9, depth() - 1) / 24);
    drone(root, 'sawtooth', 0.035, 260);
    drone(root * 1.5, 'sine', 0.03, 600);
    wind(name === 'title' ? 0.05 : 0.035, 420);
  } else if (name === 'camp') {
    drone(146.83, 'sine', 0.035, 800);
    drone(220, 'sine', 0.025, 800);
  } else if (name === 'boss') {
    drone(36.71, 'sawtooth', 0.06, 180);
    drone(38.89, 'sawtooth', 0.04, 160);
    wind(0.03, 300);
  }

  // 拍の予定を少し先まで入れる
  current.timer = setInterval(() => {
    if (!current || current.name !== name) return;
    const c = current;
    while (c.next < ac.currentTime + 0.3) {
      const t = c.next - ac.currentTime;
      if (name === 'dungeon' || name === 'title') {
        const root = 146.83 * Math.pow(2, -Math.min(9, depth() - 1) / 18);
        if (Math.random() < 0.55) pluck(gain, note(root, PENTA_MINOR, Math.floor(Math.random() * 8)), t, 0.07);
        if (Math.random() < 0.18) tone(gain, { f: 1400 + Math.random() * 900, f2: 700, t: t + Math.random(), dur: 0.12, vol: 0.03, verbAmt: 0.9 });
        if (Math.random() < 0.05) noise(gain, { t, dur: 2.5, vol: 0.04, freq: 60, type: 'lowpass', attack: 0.8, verbAmt: 0.3 });
        c.next += 1.6 + Math.random() * 2.6;
      } else if (name === 'camp') {
        for (let i = 0; i < 4; i++) if (Math.random() < 0.6) noise(gain, { t: t + Math.random() * 0.5, dur: 0.02 + Math.random() * 0.03, vol: 0.05 + Math.random() * 0.05, freq: 2500 + Math.random() * 3000, type: 'highpass', verbAmt: 0 });
        if (Math.random() < 0.22) pluck(gain, note(293.66, PENTA_MAJOR, Math.floor(Math.random() * 7)), t, 0.06, 2.8);
        c.next += 0.5;
      } else if (name === 'boss') {
        const k = c.opts.intensity || 0;
        const beat = 60 / (68 + 60 * k);
        const b = c.beat++;
        tone(gain, { f: 90, f2: 38, t, dur: 0.5, vol: b % 4 === 0 ? 0.3 : 0.18, verbAmt: 0.3 });
        noise(gain, { t, dur: 0.12, vol: 0.06, freq: 180, type: 'lowpass', verbAmt: 0.2 });
        if (k > 0.5 && b % 2 === 1) tone(gain, { f: 160, f2: 90, t: t + beat / 2, dur: 0.25, vol: 0.1, verbAmt: 0.2 });
        if (b % 8 === 0 && Math.random() < 0.6) pluck(gain, note(73.42, PENTA_MINOR, Math.floor(Math.random() * 6), 1), t, 0.05);
        c.next += beat;
      }
    }
  }, 120);
}

export function setIntensity(k) { if (current) current.opts.intensity = k; }

// ---------- 効果音 ----------
const S = () => sfxBus;
export const sfx = {
  click() { if (!ensure() || !throttle('click', 40)) return; tone(S(), { f: 520, type: 'triangle', dur: 0.05, vol: 0.06, verbAmt: 0.05 }); },
  ruler() { if (!throttle('ruler', 45)) return; tone(S(), { f: 1800, type: 'square', dur: 0.025, vol: 0.025, verbAmt: 0, filter: 3000 }); },
  door() {
    noise(S(), { dur: 0.9, vol: 0.05, freq: 180, q: 6, attack: 0.15, verbAmt: 0.5 });
    tone(S(), { f: 70, f2: 50, type: 'sawtooth', dur: 0.8, vol: 0.05, filter: 300, verbAmt: 0.4 });
  },
  march() { for (let i = 0; i < 6; i++) noise(S(), { t: i * 0.11, dur: 0.06, vol: 0.05, freq: 220, type: 'lowpass', verbAmt: 0.25 }); },
  battle(n = 1) {
    const k = Math.min(1, n / 40);
    for (let i = 0; i < 6 + k * 10; i++) {
      noise(S(), { t: Math.random() * 1.1, dur: 0.08, vol: 0.03 + k * 0.03, freq: 900 + Math.random() * 1500, q: 3, verbAmt: 0.7 });
    }
    noise(S(), { dur: 1.3, vol: 0.03 + k * 0.03, freq: 140, type: 'lowpass', attack: 0.3, verbAmt: 0.5 });
  },
  toll() { if (!throttle('toll', 220)) return; bell(S(), 98, 0, 0.09, 3.2); },
  awaken() { bell(S(), 523.25, 0, 0.1, 3.5); bell(S(), 659.25, 0.08, 0.08, 3.5); bell(S(), 783.99, 0.16, 0.08, 3.5); },
  loot() { if (!throttle('loot', 70)) return; tone(S(), { f: 1318, type: 'sine', dur: 0.4, vol: 0.05, verbAmt: 0.5 }); tone(S(), { f: 1975, type: 'sine', t: 0.06, dur: 0.5, vol: 0.04, verbAmt: 0.5 }); },
  heal() { if (!throttle('heal', 90)) return; tone(S(), { f: 440, f2: 660, type: 'sine', dur: 0.6, vol: 0.05, attack: 0.1, verbAmt: 0.6 }); },
  lvup() { if (!throttle('lvup', 60)) return; tone(S(), { f: 784, type: 'triangle', dur: 0.15, vol: 0.04, verbAmt: 0.3 }); tone(S(), { f: 1046, type: 'triangle', t: 0.07, dur: 0.2, vol: 0.04, verbAmt: 0.3 }); },
  wound() { if (!throttle('wound', 70)) return; noise(S(), { dur: 0.12, vol: 0.06, freq: 500, q: 2, verbAmt: 0.2 }); },
  rewind() {
    for (let i = 0; i < 10; i++) tone(S(), { f: 1600 / Math.pow(1.18, i), t: i * 0.05, dur: 0.4, vol: 0.04, verbAmt: 0.7 });
    noise(S(), { dur: 1.2, vol: 0.05, freq: 2000, type: 'bandpass', attack: 0.6, verbAmt: 0.6 });
  },
  descend() {
    noise(S(), { dur: 1.4, vol: 0.08, freq: 400, attack: 0.5, verbAmt: 0.5 });
    tone(S(), { f: 80, f2: 40, type: 'sine', t: 0.6, dur: 1.4, vol: 0.18, verbAmt: 0.5 });
  },
  camp() { pluck(S(), 293.66, 0, 0.08); pluck(S(), 440, 0.12, 0.07); pluck(S(), 587.33, 0.24, 0.06); },
  equip() { if (!throttle('equip', 60)) return; noise(S(), { dur: 0.08, vol: 0.06, freq: 3000, q: 4, verbAmt: 0.2 }); tone(S(), { f: 1200, type: 'triangle', dur: 0.12, vol: 0.03, verbAmt: 0.2 }); },
  stance(kind) {
    if (kind === 'grace') { bell(S(), 392, 0, 0.08, 2.5); return; }
    tone(S(), { f: kind === 'attack' ? 110 : 82, f2: 55, dur: 0.4, vol: 0.2, verbAmt: 0.4 });
    noise(S(), { dur: 0.25, vol: 0.08, freq: kind === 'attack' ? 1200 : 400, verbAmt: 0.4 });
  },
  hit() { tone(S(), { f: 120, f2: 50, dur: 0.35, vol: 0.18, verbAmt: 0.4 }); noise(S(), { dur: 0.2, vol: 0.1, freq: 700, verbAmt: 0.4 }); },
  special() {
    tone(S(), { f: 55, f2: 30, type: 'sawtooth', dur: 1.8, vol: 0.12, attack: 0.2, filter: 400, verbAmt: 0.5 });
    noise(S(), { dur: 1.6, vol: 0.12, freq: 250, q: 1, attack: 0.3, verbAmt: 0.5 });
  },
  prophecyTick(i) { tone(S(), { f: 880 * Math.pow(1.03, i % 6), type: 'sine', dur: 0.12, vol: 0.035, verbAmt: 0.6 }); },
  chosen() { bell(S(), 392, 0, 0.12, 4); bell(S(), 587.33, 0.05, 0.1, 4); },
  strikeWin() {
    noise(S(), { dur: 0.5, vol: 0.18, freq: 1500, attack: 0.002, verbAmt: 0.6 });
    [0, 4, 7, 12, 16].forEach((n, i) => pluck(S(), 293.66 * Math.pow(2, n / 12), 0.2 + i * 0.09, 0.1, 3));
  },
  strikeFail() { tone(S(), { f: 220, f2: 110, type: 'sawtooth', dur: 0.9, vol: 0.08, filter: 800, verbAmt: 0.5 }); tone(S(), { f: 233, f2: 116, type: 'sawtooth', dur: 0.9, vol: 0.06, filter: 800, verbAmt: 0.5 }); },
  victory() {
    [0, 2, 4, 7, 9, 12, 14, 16].forEach((n, i) => pluck(S(), 293.66 * Math.pow(2, n / 12), i * 0.14, 0.09, 3.5));
    bell(S(), 587.33, 1.2, 0.1, 5);
  },
  defeat() { [0, -1, -5, -7].forEach((n, i) => pluck(S(), 146.83 * Math.pow(2, n / 12), i * 0.5, 0.08, 3.5)); bell(S(), 73.42, 0.2, 0.12, 5); },
  error() { tone(S(), { f: 200, type: 'square', dur: 0.15, vol: 0.05, filter: 900, verbAmt: 0 }); },
};
