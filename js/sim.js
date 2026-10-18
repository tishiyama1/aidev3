// ゲームの中身(画面に依存しない)。Node からも読み込んで検証できる。
import { ITEMS, PATHS, MODS } from './data.js';

export const NIGHTS = 10;
export const START_POP = 100;
export const CAP = 160;

const PATH_BY_ID = Object.fromEntries(PATHS.map((p) => [p.id, p]));
export const pathById = (id) => PATH_BY_ID[id];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
export function kanji(n) {
  if (n <= 0) return '〇';
  if (n < 10) return DIGITS[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    return (t > 1 ? DIGITS[t] : '') + '十' + DIGITS[n % 10];
  }
  return String(n);
}

export const treasureValue = (s) =>
  s.items.reduce((a, k) => a + (ITEMS[k].kind === 'treasure' ? ITEMS[k].value : 0), 0);
export const worth = (s) => s.gold + treasureValue(s);
export const toolCount = (s) => s.items.filter((k) => ITEMS[k].kind === 'tool').length;

export function newProfile() {
  return { codex: {}, seen: {}, best: 0, runs: 0, scores: [] };
}

function pickWeighted(rng, list) {
  const total = list.reduce((a, [, w]) => a + w, 0);
  let x = rng() * total;
  for (const [v, w] of list) {
    x -= w;
    if (x < 0) return v;
  }
  return list[list.length - 1][0];
}

class Ctx {
  constructor(run, groups) {
    this.run = run;
    this.groups = groups;
    this.rng = run.rng;
    this.fx = {};
    this.notes = [];
    this.newborn = [];
    this.mod = run.stage.mod ? MODS[run.stage.mod] : null;
    this.D = run.depth();
    this.goldMul = this.mod?.goldMul || 1;
    this.deathMul = (this.mod?.deathMul || 1) * (1 + 0.04 * run.stageIdx);
  }
  r() { return this.rng(); }
  ri(a, b) { return a + Math.floor(this.rng() * (b - a + 1)); }
  pick(a) { return a[Math.floor(this.rng() * a.length)]; }
  pickW(list) { return pickWeighted(this.rng, list); }
  shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  push(s, e) { (this.fx[s.id] ||= []).push(e); }
  log(s, text) { s.log.push({ at: this.run.stageIdx, text }); }
  note(text, level = 1, s = null) { this.notes.push({ text, level, id: s ? s.id : null, path: this.cur }); }
  has(s, k) { return s.items.includes(k); }
  give(s, k) {
    if (ITEMS[k].kind !== 'treasure' && s.items.includes(k)) return false;
    s.items.push(k);
    this.run.discover(k);
    this.push(s, { t: 'item', k });
    return true;
  }
  take(s, k) {
    const i = s.items.indexOf(k);
    if (i < 0) return false;
    s.items.splice(i, 1);
    this.push(s, { t: 'lose', k });
    return true;
  }
  add(s, n) {
    n = Math.round(n);
    const before = s.gold;
    s.gold = Math.max(0, before + n);
    const d = s.gold - before;
    if (d) this.push(s, { t: 'gold', v: d });
    return d;
  }
  setGold(s, v) { return this.add(s, Math.round(v) - s.gold); }
  // 拾った金は深さで増える。猫は小判に興味がなく、鳥は半分しか運べない。
  gain(s, base) {
    if (s.form === 'cat') return 0;
    let g = Math.max(0, Math.round(base * this.D * this.goldMul));
    if (s.form === 'bird') g = Math.round(g / 2);
    return this.add(s, g);
  }
  gainLog(s, base, did, verb = '拾った') {
    if (s.form === 'cat') { this.log(s, `${did}小判には目もくれなかった`); return 0; }
    const g = this.gain(s, base);
    this.log(s, `${did}${g}文${verb}`);
    return g;
  }
  // 危険に挑む。人形を抱いていると危なく、お守りは一度だけ身代わりになる。
  risk(s, p, cause) {
    p = Math.min(0.97, (p + (this.has(s, 'doll') ? 0.12 : 0)) * this.deathMul);
    if (this.r() >= p) return false;
    return this.doom(s, cause);
  }
  doom(s, cause) {
    if (this.take(s, 'charm')) {
      this.log(s, 'お守りが身代わりに砕けた');
      return false;
    }
    this.kill(s, cause);
    return true;
  }
  kill(s, cause) {
    if (!s.alive) return;
    s.alive = false;
    s.cause = cause;
    this.run.dead.push(s);
    this.log(s, cause);
    this.push(s, { t: 'die' });
  }
  revive(d) {
    const i = this.run.dead.indexOf(d);
    if (i >= 0) this.run.dead.splice(i, 1);
    d.alive = true;
    d.cause = null;
    this.newborn.push(d);
    this.push(d, { t: 'born', revived: true });
  }
  split(s, text, childText) {
    if (this.run.population() + this.newborn.length >= CAP) {
      this.log(s, `${text}が、すぐに消えてしまった`);
      return null;
    }
    const c = this.run.clone(s);
    this.log(s, text);
    c.log.push({ at: this.run.stageIdx, text: `${childText}私だった` });
    this.newborn.push(c);
    this.push(s, { t: 'split', child: c.id });
    this.push(c, { t: 'born', from: s.id });
    return c;
  }
  setForm(s, f) {
    if (s.form === f) return false;
    s.prevForm = s.form;
    s.form = f;
    if (f === 'stone') s.stoneAt = this.run.stageIdx;
    this.push(s, { t: 'form', f });
    return true;
  }
}

// 一つの道へ行った私たちに何が起きたかをまとめる
function summarize(g, i, ctx, startGold) {
  const sum = { sent: g.length, alive: 0, died: {}, gainers: 0, gain: 0, losers: 0, loss: 0, items: {}, lost: {}, forms: {}, born: 0, quiet: {} };
  const inc = (o, k) => { o[k] = (o[k] || 0) + 1; };
  for (const s of g) {
    if (!s.alive) { inc(sum.died, s.cause); continue; }
    sum.alive++;
    const fx = ctx.fx[s.id] || [];
    const d = s.gold - startGold.get(s.id);
    if (d > 0) { sum.gainers++; sum.gain += d; } else if (d < 0) { sum.losers++; sum.loss -= d; }
    for (const e of fx) {
      if (e.t === 'item') inc(sum.items, e.k);
      else if (e.t === 'lose') inc(sum.lost, e.k);
      else if (e.t === 'form') inc(sum.forms, e.f);
    }
    // 何も変わらなかった私は、その場で何をしていたかでまとめる
    if (!fx.length && d === 0) {
      const last = s.log[s.log.length - 1];
      inc(sum.quiet, last && last.at === ctx.run.stageIdx ? last.text : '何も起きなかった');
    }
  }
  sum.born = ctx.newborn.filter((c) => c.from != null && g.some((x) => x.id === c.from) && !g.includes(c)).length;
  sum.alive += sum.born;
  sum.notes = ctx.notes.filter((n) => n.path === i).map((n) => n.text);
  return sum;
}

export class Run {
  constructor(profile, rng = Math.random, data = null) {
    this.profile = profile;
    this.rng = rng;
    this.night = 1;
    this.savings = 0;
    this.inherit = { items: [], form: 'human' };
    this.history = [];
    this.inNight = false;
    this.selves = [];
    this.dead = [];
    this.stageIdx = 0;
    this.stageCount = 0;
    this.stage = null;
    this.nextId = 1;
    this.lastPaths = [];
    if (data) Object.assign(this, data);
  }

  toJSON() {
    const { profile, rng, ...rest } = this;
    return rest;
  }

  discover(k) { this.profile.codex[k] = true; }
  depth() { return 1 + 0.12 * this.stageIdx + 0.15 * (this.night - 1); }
  stageLabel(i = this.stageIdx) { return `${kanji(i + 1)}ノ辻`; }
  population() { return this.selves.filter((s) => s.alive).length; }
  isOver() { return !this.inNight && this.night > NIGHTS; }
  atDawn() { return this.inNight && this.stageIdx >= this.stageCount; }

  newSelf(template) {
    return {
      id: this.nextId++,
      gold: 0,
      items: [],
      form: 'human',
      alive: true,
      king: false,
      log: [],
      ...template,
    };
  }

  clone(s) {
    return this.newSelf({
      gold: s.gold,
      items: s.items.slice(),
      form: s.form,
      prevForm: s.prevForm,
      king: false,
      from: s.id,
      log: s.log.map((e) => ({ ...e })),
    });
  }

  startNight() {
    this.selves = [];
    this.dead = [];
    this.nextId = 1;
    for (let i = 0; i < START_POP; i++) {
      this.selves.push(this.newSelf({ items: this.inherit.items.slice(), form: this.inherit.form }));
    }
    this.stageIdx = 0;
    this.stageCount = 7 + Math.min(4, Math.floor((this.night - 1) / 2));
    this.inNight = true;
    this.lastPaths = [];
    this.stage = this.makeStage();
  }

  makeStage() {
    const rng = this.rng;
    if (this.night === 1 && this.stageIdx === 0) return { paths: ['bridge', 'fox'], mod: null };
    const k = rng() < 0.4 ? 2 : 3;
    const pool = PATHS.filter((p) => (p.from || 0) <= this.stageIdx && (p.night || 1) <= this.night);
    const chosen = [];
    while (chosen.length < k) {
      const cand = pool
        .filter((p) => !chosen.includes(p.id))
        .map((p) => [p.id, p.w * (this.lastPaths.includes(p.id) ? 0.2 : 1)]);
      chosen.push(pickWeighted(rng, cand));
    }
    let mod = null;
    if (!(this.night === 1 && this.stageIdx < 3) && rng() < 0.2) {
      mod = pickWeighted(rng, Object.entries(MODS).map(([id, m]) => [id, m.w]));
    }
    this.lastPaths = chosen;
    return { paths: chosen, mod };
  }

  movable() { return this.selves.filter((s) => s.alive && s.form !== 'stone'); }

  sorted(mode = 'gold') {
    const forms = { human: 0, cat: 1, bird: 2, stone: 3 };
    const byWorth = (a, b) => worth(b) - worth(a) || a.id - b.id;
    const cmp = {
      gold: byWorth,
      items: (a, b) => toolCount(b) - toolCount(a) || byWorth(a, b),
      form: (a, b) => forms[a.form] - forms[b.form] || byWorth(a, b),
    }[mode] || byWorth;
    return this.movable().sort(cmp);
  }

  // 並び順の上から、仕切り(0〜1)で区切って各道へ振り分ける。
  groupsFor(cuts, mode) {
    const list = this.sorted(mode);
    const n = list.length;
    const bounds = [0, ...cuts.map((f) => Math.round(f * n)), n];
    return this.stage.paths.map((_, i) => list.slice(bounds[i], Math.max(bounds[i], bounds[i + 1])));
  }

  resolve(cuts, mode = 'gold') {
    const groups = this.groupsFor(cuts, mode);
    const ctx = new Ctx(this, groups);
    const perPath = [];
    const startGold = new Map(groups.flat().map((s) => [s.id, s.gold]));

    groups.forEach((g, i) => {
      ctx.cur = i;
      const before = g.reduce((a, s) => a + worth(s), 0);
      const nb = ctx.newborn.length;
      pathById(this.stage.paths[i]).run(g, ctx);
      const kids = ctx.newborn.slice(nb).filter((s) => g.some((x) => x.id === s.from));
      const after = g.filter((s) => s.alive).concat(kids).reduce((a, s) => a + worth(s), 0);
      perPath.push({ id: this.stage.paths[i], sent: g.length, survived: g.filter((s) => s.alive).length, delta: after - before });
    });

    let wolves = null;
    if (this.stage.mod === 'wolves') {
      const nonEmpty = groups.map((g, i) => [g, i]).filter(([g]) => g.some((s) => s.alive));
      if (nonEmpty.length) {
        const min = Math.min(...nonEmpty.map(([g]) => g.length));
        const [target, ti] = ctx.pick(nonEmpty.filter(([g]) => g.length === min));
        const prey = ctx.shuffle(target.filter((s) => s.alive)).slice(0, 10);
        let eaten = 0;
        for (const s of prey) if (ctx.doom(s, '狼の群れに襲われた')) eaten++;
        wolves = { path: ti, eaten };
        ctx.note(`狼が一番小さな群れを襲い、${eaten}人が消えた`, eaten ? 2 : 1);
        perPath[ti].survived = target.filter((s) => s.alive).length;
      }
    }
    ctx.cur = null;
    const summaries = groups.map((g, i) => summarize(g, i, ctx, startGold));

    // 石になった私は時々もとに戻る。
    for (const s of this.selves) {
      if (s.alive && s.form === 'stone' && s.stoneAt < this.stageIdx && ctx.r() < 0.15) {
        ctx.setForm(s, s.prevForm && s.prevForm !== 'stone' ? s.prevForm : 'human');
        ctx.log(s, '石から元に戻った');
      }
    }

    const alarm = this.rare(ctx);

    for (const p of perPath) {
      const st = (this.profile.seen[p.id] ||= { n: 0, s: 0, g: 0 });
      st.n += p.sent;
      st.s += p.survived;
      st.g += p.delta;
    }

    const born = new Set(ctx.newborn);
    this.selves = this.selves.filter((s) => s.alive && !born.has(s)).concat(ctx.newborn);
    const report = {
      stageIdx: this.stageIdx,
      paths: this.stage.paths,
      groups: groups.map((g) => g.map((s) => s.id)),
      perPath,
      summaries,
      fx: ctx.fx,
      notes: ctx.notes,
      wolves,
      alarm,
    };
    this.stageIdx++;
    this.stage = this.stageIdx < this.stageCount ? this.makeStage() : null;
    return report;
  }

  rare(ctx) {
    const alive = this.selves.filter((s) => s.alive);
    if (!alive.length) return false;
    const r = ctx.r();
    if (this.night >= 2 && r < 0.004) {
      ctx.note('獏が夢を食べに来た', 3);
      for (const s of alive) if (s.form !== 'stone' && ctx.r() < 0.5) ctx.doom(s, '獏に夢ごと食べられた');
    } else if (r < 0.016) {
      const s = ctx.pick(alive);
      ctx.give(s, 'moon');
      ctx.log(s, '流れ星が手の中に落ちてきた。月のかけらだった');
      ctx.note(`流れ星が #${s.id} の手に落ちた`, 3, s);
    } else if (this.stageIdx >= 2 && r < 0.022) {
      ctx.note('どこかで目覚ましが鳴っている', 3);
      return true;
    }
    return false;
  }

  dawn() {
    const alive = this.selves.filter((s) => s.alive);
    const n = alive.length;
    const fx = {};
    for (const s of alive) {
      if (s.form === 'stone') {
        s.form = s.prevForm && s.prevForm !== 'stone' ? s.prevForm : 'human';
        (fx[s.id] ||= []).push({ t: 'form', f: s.form });
      }
      const before = s.gold;
      s.gold = Math.round(s.gold * 1.5) + 3 * n;
      (fx[s.id] ||= []).push({ t: 'gold', v: s.gold - before });
      s.log.push({ at: this.stageIdx, text: `${n}人で夜明けの門をくぐり、${s.gold - before}文の光を浴びた` });
    }
    this.stageIdx = this.stageCount;
    return { n, fx };
  }

  // 生き残った私の中から一人を選び、それが本当の私になる。
  wake() {
    const alive = this.selves.filter((s) => s.alive);
    const result = { night: this.night, survivors: alive.length, nightmare: !alive.length };
    if (!alive.length) {
      this.inherit = { items: [], form: 'human' };
      result.value = 0;
    } else {
      const chosen = alive[Math.floor(this.rng() * alive.length)];
      const richest = alive.reduce((a, b) => (worth(b) > worth(a) ? b : a));
      result.chosen = chosen;
      result.value = worth(chosen);
      result.richest = richest;
      result.poorest = alive.reduce((a, b) => (worth(b) < worth(a) ? b : a));
      result.dist = alive.map(worth).sort((a, b) => b - a);
      this.savings += result.value;
      this.inherit = {
        items: chosen.items.filter((k) => ITEMS[k].kind !== 'treasure'),
        form: chosen.form === 'stone' ? chosen.prevForm || 'human' : chosen.form,
      };
    }
    this.history.push({
      night: this.night,
      value: result.value,
      survivors: result.survivors,
      nightmare: result.nightmare,
      chosen: result.chosen ? result.chosen.id : null,
      richest: result.richest ? worth(result.richest) : 0,
    });
    this.night++;
    this.inNight = false;
    this.selves = [];
    this.dead = [];
    this.stage = null;
    if (this.night > NIGHTS) {
      const p = this.profile;
      p.runs++;
      p.best = Math.max(p.best, this.savings);
      p.scores = [...(p.scores || []), this.savings].slice(-20);
    }
    return result;
  }
}
