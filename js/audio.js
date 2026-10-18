// 効果音はすべて Web Audio で合成する。
let ac = null;
let master = null;
let noiseBuf = null;
let muted = false;
const last = {};

function ensure() {
  if (ac) return ac;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ac = new AC();
  master = ac.createGain();
  master.gain.value = muted ? 0 : 0.5;
  master.connect(ac.destination);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ac;
}

export function unlock() {
  const a = ensure();
  if (a && a.state === 'suspended') a.resume();
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}

// 同じ音が一瞬に重なりすぎないようにする
function throttle(name, ms) {
  const now = performance.now();
  if (last[name] && now - last[name] < ms) return false;
  last[name] = now;
  return true;
}

function tone({ f = 440, f2 = null, type = 'sine', t = 0, dur = 0.3, vol = 0.2, attack = 0.005 }) {
  const a = ensure();
  if (!a || muted) return;
  const t0 = a.currentTime + t;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise({ t = 0, dur = 0.3, vol = 0.2, freq = 800, q = 1, type = 'bandpass' }) {
  const a = ensure();
  if (!a || muted) return;
  const t0 = a.currentTime + t;
  const src = a.createBufferSource();
  src.buffer = noiseBuf;
  const fl = a.createBiquadFilter();
  fl.type = type;
  fl.frequency.value = freq;
  fl.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(fl).connect(g).connect(master);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + dur + 0.05);
}

export const sfx = {
  tick(pitch = 1) {
    tone({ f: 880 * pitch, type: 'triangle', dur: 0.06, vol: 0.12 });
  },
  puff() {
    if (!throttle('puff', 45)) return;
    noise({ dur: 0.35, vol: 0.12, freq: 300 + Math.random() * 200, q: 0.8, type: 'lowpass' });
    tone({ f: 120, f2: 60, dur: 0.3, vol: 0.06 });
  },
  coin() {
    if (!throttle('coin', 35)) return;
    const f = 1500 + Math.random() * 900;
    tone({ f, type: 'square', dur: 0.08, vol: 0.03 });
    tone({ f: f * 1.5, type: 'sine', t: 0.04, dur: 0.15, vol: 0.05 });
  },
  item() {
    if (!throttle('item', 60)) return;
    tone({ f: 660, type: 'sine', dur: 0.25, vol: 0.08 });
    tone({ f: 990, type: 'sine', t: 0.07, dur: 0.3, vol: 0.06 });
  },
  born() {
    if (!throttle('born', 60)) return;
    tone({ f: 520, f2: 1040, type: 'sine', dur: 0.25, vol: 0.07 });
  },
  morph() {
    if (!throttle('morph', 60)) return;
    tone({ f: 300, f2: 900, type: 'triangle', dur: 0.3, vol: 0.06 });
  },
  rare() {
    [0, 4, 7, 12].forEach((n, i) => tone({ f: 523 * 2 ** (n / 12), type: 'sine', t: i * 0.09, dur: 0.9, vol: 0.09 }));
  },
  go() {
    noise({ dur: 0.5, vol: 0.06, freq: 1200, q: 0.5 });
    tone({ f: 196, type: 'sine', dur: 0.6, vol: 0.08 });
  },
  gong() {
    const a = ensure();
    if (!a) return;
    [1, 2.76, 5.4, 8.93].forEach((m, i) => tone({ f: 98 * m, type: 'sine', dur: 3.5 / (i + 1), vol: 0.18 / (i + 1), attack: 0.01 }));
  },
  dawn() {
    [0, 7, 12, 16, 19].forEach((n, i) => tone({ f: 262 * 2 ** (n / 12), type: 'sine', t: i * 0.15, dur: 2.2, vol: 0.07, attack: 0.3 }));
  },
  split() {
    // 一人が百人に分かれる音
    for (let i = 0; i < 16; i++) tone({ f: 300 * 2 ** (i / 8), type: 'sine', t: i * 0.035, dur: 0.4, vol: 0.04 });
  },
  nightmare() {
    tone({ f: 110, f2: 40, type: 'sawtooth', dur: 2.5, vol: 0.06, attack: 0.2 });
    noise({ dur: 2.5, vol: 0.06, freq: 200, q: 2, type: 'lowpass' });
  },
};
