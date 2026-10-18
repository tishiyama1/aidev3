// 百人の迷宮:ゲームの中身(画面に依存しない)。Node からも読み込んで検証できる。
import { GEAR, SKILLS, BOSSES, MODS, ROOMS, CATS } from './ddata.js';

export const FLOORS = 10;
export const ROOMS_PER_FLOOR = 3;
export const START_POP = 100;
export const CAP = 140;
export const BOSS_HP = 13500;
const STRIKE_AT = 0.25;
// 部屋の危険度全体にかける係数(バランス調整用)
export const DANGER = 1.8;

const ROOM_BY_ID = Object.fromEntries(ROOMS.map((r) => [r.id, r]));
export const roomById = (id) => ROOM_BY_ID[id];
const CAT_KEYS = Object.keys(CATS);

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
  if (n < 100) return (n >= 20 ? DIGITS[Math.floor(n / 10)] : '') + '十' + DIGITS[n % 10];
  return String(n);
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

export function newProfile() {
  return { known: {}, codex: {}, bosses: {}, wins: 0, runs: 0, best: 0 };
}

// ---------- 冒険者の能力 ----------
export const levelOf = (a) => Math.min(10, 1 + Math.floor(a.txp / 3));
export function atk(a) {
  let v = 4 + 2 * levelOf(a) + (a.gear.weapon ? GEAR[a.gear.weapon].atk : 0);
  if (a.skill === 'warrior') v *= 3;
  if (a.skill === 'berserker') v *= 4;
  return v;
}
export const power = (a) => Math.round(atk(a) / (a.gear.armor ? GEAR[a.gear.armor].def : 1));

function personalMul(a) {
  let m = a.gear.armor ? GEAR[a.gear.armor].def : 1;
  m *= 1 + 0.4 * a.wounds;
  if (a.skill === 'immortal') m *= 0.15;
  if (a.skill === 'shadow') m *= 0.4;
  if (a.skill === 'lucky') m *= 0.5;
  if (a.skill === 'berserker') m *= 1.4;
  return m;
}

// ---------- 一つの部屋の判定 ----------
class Ctx {
  constructor(run, group, room) {
    this.run = run;
    this.rng = run.rng;
    this.group = group;
    this.room = room;
    this.floor = run.floor;
    this.mod = run.mods[run.floor] ? MODS[run.mods[run.floor]] : null;
    this.fx = run.fx;
    this.notes = run.notesOut;
    this.sum = { died: {}, wounded: 0, lvup: 0, awakened: [], loot: [], recruits: 0, healed: 0, revealed: [], quiet: 0, grace: 0 };
    this.skills = new Set(group.map((a) => a.skill).filter(Boolean));
  }
  r() { return this.rng(); }
  ri(a, b) { return a + Math.floor(this.rng() * (b - a + 1)); }
  pick(a) { return a[Math.floor(this.rng() * a.length)]; }
  push(a, e) { (this.fx[a.id] ||= []).push(e); }
  log(a, text) { a.log.push({ f: this.floor, r: this.run.roomIdx, text }); }
  note(text, level = 1, a = null) { this.notes.push({ text, level, id: a ? a.id : null }); }
  alive() { return this.group.filter((a) => a.alive); }

  deathP(a) { return this.run.deathP(a, this.room, this.group); }

  kill(a, cause) {
    if (!a.alive) return;
    a.alive = false;
    a.cause = cause;
    a.diedAt = this.floor;
    this.run.dead.push(a);
    this.log(a, cause);
    this.push(a, { t: 'die' });
    (this.sum.died[cause] ||= 0);
    this.sum.died[cause]++;
    this.run.onDeath();
    if (a.fame >= 25 || a.skill) this.note(`${a.skill ? SKILLS[a.skill].name + 'の' : '名高い'} #${a.id} が倒れた`, 2, a);
  }
  // お守りか守護者がいれば、死の代わりに傷を負う
  doom(a, cause) {
    if (a.gear.charm === 'amulet') {
      a.gear.charm = null;
      this.log(a, 'お守りが砕け、命拾いした');
      this.push(a, { t: 'lose', k: 'amulet' });
      this.wound(a);
      return false;
    }
    if (this.skills.has('guardian') && a.skill !== 'guardian' && this.r() < 0.4) {
      this.log(a, '守護者にかばわれた');
      this.wound(a);
      return false;
    }
    this.kill(a, cause);
    return true;
  }
  // 攻撃を受けた:無傷なら多くは傷で済むが、傷が重なるほど死に近づく
  hit(a, cause) {
    if (this.r() < [0.3, 0.6, 1][a.wounds]) return this.doom(a, cause);
    this.wound(a);
    return false;
  }
  wound(a) {
    if (a.wounds < 2) a.wounds++;
    this.sum.wounded++;
    this.push(a, { t: 'wound' });
  }
  gainXp(a, cat) {
    const before = levelOf(a);
    a.txp++;
    if (cat) a.xp[cat] = (a.xp[cat] || 0) + 1;
    if (levelOf(a) > before) { this.sum.lvup++; this.push(a, { t: 'lvup', lv: levelOf(a) }); }
  }
  fame(a, n) {
    let m = 1;
    if (a.skill === 'vessel') m *= 3;
    if (a.gear.charm === 'banner') m *= 2;
    a.fame += n * m;
  }
  awaken(a, mult) {
    if (a.skill || !a.alive) return false;
    const pop = this.run.population();
    const adversity = 1 + 3 * Math.max(0, (50 - pop) / 50);
    const p = 0.0012 * adversity * mult * (this.room.awaken || 1) * (this.mod?.awaken || 1);
    if (this.r() >= p) return false;
    const k = this.pick(Object.keys(SKILLS));
    a.skill = k;
    a.fame += 10;
    this.run.profile.codex['s:' + k] = true;
    this.log(a, `「${SKILLS[k].name}」に覚醒した`);
    this.push(a, { t: 'awaken', k });
    this.sum.awakened.push(a.id);
    this.note(`#${a.id} が「${SKILLS[k].name}」に覚醒した`, 3, a);
    return true;
  }

  // 標準の試練:一人ずつ生死を判定し、生き残れば経験と名声を得る
  ordeal(cause) {
    for (const a of this.group) {
      if (!a.alive) continue;
      const p = this.deathP(a);
      const r = this.r();
      let near = false;
      if (r < p) {
        if (this.hit(a, cause)) continue;
        near = true;
      } else if (r < p * 1.5) near = true;
      this.gainXp(a, this.room.cat);
      this.fame(a, this.room.fame || 0);
      this.awaken(a, near ? 3 : 1);
    }
    // 集団戦では一番の働き手に名声が集まる
    if (this.room.kind === 'fight') {
      const alive = this.alive();
      if (alive.length) {
        const mvp = alive.reduce((b, a) => (atk(a) * (0.5 + this.r()) > atk(b) * (0.5 + this.r()) ? a : b));
        this.fame(mvp, 3);
        mvp.kills++;
        this.log(mvp, 'とどめを刺した');
      }
    }
  }

  loot(n, tierBonus = 0) {
    const alive = this.alive();
    if (!alive.length) return;
    let count = n * (this.mod?.loot || 1);
    if (this.skills.has('treasure')) count += 1;
    if (this.skills.has('lucky')) count += 0.5;
    count = Math.floor(count + this.r());
    const maxTier = Math.min(4, (this.floor <= 2 ? 1 : this.floor <= 4 ? 2 : this.floor <= 7 ? 3 : 4) + tierBonus);
    for (let i = 0; i < count; i++) {
      const pool = Object.entries(GEAR)
        .filter(([, g]) => g.tier <= maxTier && (tierBonus ? g.tier > 1 : true))
        .map(([k, g]) => [k, { 1: 6, 2: 4, 3: 2, 4: 1 }[g.tier]]);
      const k = pickWeighted(this.rng, pool);
      this.run.stash.push(k);
      this.run.profile.codex['g:' + k] = true;
      this.sum.loot.push(k);
      const finder = this.pick(alive);
      this.push(finder, { t: 'loot', k });
      this.log(finder, `${GEAR[k].name}を見つけた`);
    }
  }

  recruit(n) {
    for (let i = 0; i < n && this.run.population() < CAP; i++) {
      const a = this.run.newAdv({ joined: this.floor });
      a.log.push({ f: this.floor, r: this.run.roomIdx, text: '檻から救い出され、隊に加わった' });
      this.run.advs.push(a);
      this.push(a, { t: 'born' });
      this.sum.recruits++;
    }
  }
}

// ---------- 部屋ごとの処理 ----------
const RUNNERS = {
  default(c) {
    c.ordeal(c.room.kind === 'fight' ? `${c.room.name}で倒れた` : `${c.room.name}で命を落とした`);
    if (c.room.loot) c.loot(c.room.loot, c.room.tier || 0);
  },
  vault(c) {
    const alive = c.alive();
    if (!alive.length) return;
    if (c.r() < 0.45) {
      const v = c.pick(alive);
      c.note('宝箱のひとつは人喰い箱だった', 1);
      c.doom(v, '人喰い箱に呑まれた');
    }
    for (const a of c.alive()) c.gainXp(a, 'trap');
    c.loot(c.room.loot);
  },
  spring(c) {
    for (const a of c.group) {
      if (a.wounds) { a.wounds = 0; c.sum.healed++; c.push(a, { t: 'heal' }); c.log(a, '泉で傷を癒やした'); }
      else c.sum.quiet++;
    }
  },
  altar(c) {
    for (const a of c.group) {
      const r = c.r();
      if (r < 0.06) { c.wound(a); c.log(a, '祭壇に触れて呪われた'); }
      else if (!c.awaken(a, 30)) c.sum.quiet++;
    }
    if (c.group.length && c.r() < 0.5) {
      c.run.addGrace(1);
      c.sum.grace++;
      c.note('祭壇が祈りを聞き届けた', 1);
    }
  },
  forge(c) {
    for (const a of c.group) {
      const w = a.gear.weapon;
      let up = null;
      if (!w && c.r() < 0.35) up = 'rusty';
      else if (w === 'rusty' && c.r() < 0.4) up = 'steel';
      else if (w === 'steel' && c.r() < 0.2) up = 'axe';
      if (up) {
        a.gear.weapon = up;
        c.run.profile.codex['g:' + up] = true;
        c.push(a, { t: 'loot', k: up });
        c.log(a, `鍛冶場で${GEAR[up].name}を打ち直した`);
        c.sum.loot.push(up);
      } else if (!a.gear.armor && c.r() < 0.2) {
        a.gear.armor = 'leather';
        c.push(a, { t: 'loot', k: 'leather' });
        c.log(a, '鍛冶場で革鎧を繕った');
        c.sum.loot.push('leather');
      } else c.sum.quiet++;
    }
  },
  training(c) {
    for (const a of c.group) {
      if (levelOf(a) >= 3) { c.sum.quiet++; c.log(a, '訓練場では学ぶことがなかった'); continue; }
      const cat = CAT_KEYS.reduce((b, k) => ((a.xp[k] || 0) < (a.xp[b] || 0) ? k : b), CAT_KEYS[0]);
      c.gainXp(a, cat);
      if (c.r() < 0.03) { c.wound(a); c.log(a, '訓練で怪我をした'); }
      else c.log(a, `訓練で${CATS[cat]}への備えを学んだ`);
    }
  },
  stele(c) {
    c.ordeal('碑文の呪いに触れて倒れた');
    if (c.alive().length) {
      const t = c.run.revealBoss();
      if (t) { c.sum.revealed.push(t); c.note(t, 2); }
    }
  },
  scout(c) {
    c.ordeal('斥候の道で見つかり、倒れた');
    if (c.alive().length) {
      const t = c.run.revealFloors();
      c.sum.revealed.push(...t);
    }
  },
  prisoners(c) {
    c.ordeal('檻の番人に倒された');
    if (c.alive().length) {
      const n = c.ri(3, 7);
      c.recruit(n);
      c.note(`${n}人の冒険者を救い出した`, 1);
    }
  },
  fork(c) {
    for (const a of c.group) {
      const r = c.r();
      if (r < 0.08) c.kill(a, '分かれ道の先から戻らなかった');
      else if (r < 0.2) {
        const before = c.sum.loot.length;
        const saved = c.group;
        c.group = [a];
        c.loot(0.6);
        c.group = saved;
        if (c.sum.loot.length === before) c.sum.quiet++;
      } else c.sum.quiet++;
    }
  },
};

// ---------- 一回の遠征 ----------
export class Run {
  constructor(profile, rng = Math.random, data = null) {
    this.profile = profile;
    this.rng = rng;
    if (data) { Object.assign(this, data); return; }
    this.floor = 1;
    this.roomIdx = 0;
    this.phase = 'room';
    this.advs = [];
    this.dead = [];
    this.stash = [];
    this.grace = 1;
    this.deathTick = 0;
    this.nextId = 1;
    this.lastRooms = [];
    this.bossId = pickWeighted(rng, Object.keys(BOSSES).map((k) => [k, 1]));
    this.traits = { name: false, weak: false, special: false };
    this.mods = [null];
    for (let f = 1; f <= FLOORS; f++) {
      this.mods.push(f > 1 && rng() < 0.6 ? pickWeighted(rng, Object.entries(MODS).map(([k, m]) => [k, m.w])) : null);
    }
    this.modKnown = {};
    this.boss = null;
    this.result = null;
    this.camped = false;
    for (let i = 0; i < START_POP; i++) {
      const r = rng();
      const gear = { weapon: r < 0.3 ? 'rusty' : null, armor: rng() < 0.15 ? 'leather' : null, charm: rng() < 0.05 ? 'amulet' : null };
      this.advs.push(this.newAdv({ gear }));
    }
    this.stage = this.makeStage();
  }

  toJSON() {
    const { profile, rng, fx, notesOut, ...rest } = this;
    return rest;
  }

  newAdv(t = {}) {
    return {
      id: this.nextId++, alive: true, txp: 0, xp: { beast: 0, trap: 0, dark: 0, magic: 0 }, wounds: 0,
      gear: { weapon: null, armor: null, charm: null }, fame: 0, skill: null, kills: 0, log: [], joined: 1, ...t,
    };
  }

  living() { return this.advs.filter((a) => a.alive); }
  population() { return this.advs.reduce((n, a) => n + (a.alive ? 1 : 0), 0); }
  hasForesight() { return this.advs.some((a) => a.alive && a.skill === 'foresight'); }
  floorKnown(f = this.floor) { return this.hasForesight() || !!this.modKnown[f]; }
  roomKnown(id) { return !!this.profile.known[id] || this.hasForesight(); }

  addGrace(n) { this.grace = Math.min(9, this.grace + n); }
  onDeath() {
    this.deathTick++;
    if (this.deathTick >= 10) { this.deathTick -= 10; this.addGrace(1); }
  }

  // 一人の死亡率。集団戦は隊の戦力と敵の強さの比で変わる。
  deathP(a, room, group) {
    if (room.kind === 'safe' || room.kind === 'special') return 0;
    let p = room.base;
    if (room.crowd) p += room.crowd * group.length;
    if (room.kind === 'fight') {
      const P = group.reduce((s, x) => s + (x.alive ? atk(x) : 0), 0) || 1;
      const M = room.power * (1 + 0.4 * (this.floor - 1));
      p *= Math.max(0.3, Math.min(2.2, M / P));
    } else {
      p *= 1 + 0.05 * (this.floor - 1);
    }
    const cat = room.cat;
    if (cat) {
      p /= 1 + 0.5 * Math.min(6, a.xp[cat] || 0);
      if (a.gear.charm && GEAR[a.gear.charm].cat === cat) p *= 0.5;
    }
    p *= personalMul(a);
    const others = (k) => group.some((x) => x !== a && x.alive && x.skill === k);
    if (others('inspire')) p *= 0.7;
    if (cat === 'trap' && group.some((x) => x.alive && x.skill === 'trapper')) p *= 0.4;
    if (cat === 'dark' && group.some((x) => x.alive && x.skill === 'nightsight')) p *= 0.5;
    if (cat === 'beast' && group.some((x) => x.alive && x.skill === 'tamer')) p *= 0.5;
    const mod = this.mods[this.floor] ? MODS[this.mods[this.floor]] : null;
    if (mod) {
      if (mod.cat === cat) p *= mod.mul;
      if (mod.all) p *= mod.all;
    }
    return Math.min(0.9, p * DANGER);
  }

  // 画面に出す見込み。異変が分かっていなければ、異変がない前提で計算して「?」を付ける。
  estimate(roomId, group) {
    const room = roomById(roomId);
    if (!this.roomKnown(roomId)) return { known: false };
    if (!group.length) return { known: true, empty: true };
    const keep = this.mods[this.floor];
    const sure = this.floorKnown();
    if (!sure) this.mods[this.floor] = null;
    const ps = group.map((a) => this.deathP(a, room, group));
    this.mods[this.floor] = keep;
    // 攻撃を受けても、傷が浅ければ多くは死なずに済む
    let deaths = 0;
    let wounds = 0;
    group.forEach((a, i) => {
      const die = a.gear.charm === 'amulet' ? 0 : [0.3, 0.6, 1][a.wounds];
      deaths += ps[i] * die;
      wounds += ps[i] * (1 - die);
    });
    if (room.id === 'vault') deaths += 0.45;
    if (room.id === 'fork') deaths += 0.08 * group.length;
    return { known: true, survive: 1 - deaths / group.length, deaths, wounds, sure };
  }

  makeStage() {
    const rng = this.rng;
    if (this.floor === 1 && this.roomIdx === 0) return { rooms: ['beast', 'traps'] };
    const k = rng() < 0.45 ? 2 : 3;
    const pool = ROOMS.filter((r) => (r.from || 0) <= this.floor);
    const unknownTraits = Object.values(this.traits).some((v) => !v);
    const chosen = [];
    while (chosen.length < k) {
      const hasSafe = chosen.some((id) => roomById(id).kind === 'safe');
      const cand = pool
        .filter((r) => !chosen.includes(r.id) && !(hasSafe && r.kind === 'safe'))
        .map((r) => {
          let w = r.w;
          if (this.lastRooms.includes(r.id)) w *= 0.2;
          if (r.id === 'stele' && unknownTraits && this.floor >= 2) w *= 2;
          if (r.id === 'stele' && !unknownTraits) w *= 0.3;
          return [r.id, w];
        });
      chosen.push(pickWeighted(rng, cand));
    }
    this.lastRooms = chosen;
    return { rooms: chosen };
  }

  movable() { return this.living(); }

  sorted(mode = 'power') {
    const byPower = (a, b) => power(b) - power(a) || a.id - b.id;
    const cmp = {
      power: byPower,
      fame: (a, b) => b.fame - a.fame || byPower(a, b),
      wounds: (a, b) => a.wounds - b.wounds || byPower(a, b),
    }[mode] || byPower;
    return this.living().sort(cmp);
  }

  groupsFor(cuts, mode) {
    const list = this.sorted(mode);
    const n = list.length;
    const bounds = [0, ...cuts.map((f) => Math.round(f * n)), n];
    return this.stage.rooms.map((_, i) => list.slice(bounds[i], Math.max(bounds[i], bounds[i + 1])));
  }

  snapshot() { return JSON.stringify(this.toJSON()); }
  restore(json) {
    const d = JSON.parse(json);
    for (const k of Object.keys(this)) if (!['profile', 'rng'].includes(k)) delete this[k];
    Object.assign(this, d);
  }

  resolve(cuts, mode = 'power') {
    const before = this.snapshot();
    const groups = this.groupsFor(cuts, mode);
    this.fx = {};
    this.notesOut = [];
    const summaries = [];
    const startLv = new Map(this.living().map((a) => [a.id, levelOf(a)]));
    groups.forEach((g, i) => {
      const room = roomById(this.stage.rooms[i]);
      const c = new Ctx(this, g, room);
      if (g.length) (RUNNERS[room.id] || RUNNERS.default)(c);
      const sum = c.sum;
      sum.sent = g.length;
      sum.alive = g.filter((a) => a.alive).length + sum.recruits;
      sum.notes = [];
      summaries.push(sum);
      if (g.length) this.profile.known[room.id] = true;
    });
    void startLv;
    const report = {
      floor: this.floor,
      roomIdx: this.roomIdx,
      rooms: this.stage.rooms,
      groups: groups.map((g) => g.map((a) => a.id)),
      summaries,
      fx: this.fx,
      notes: this.notesOut,
      before,
    };
    this.fx = null;
    this.notesOut = null;
    this.advance();
    return report;
  }

  advance() {
    this.roomIdx++;
    if (!this.population()) {
      this.phase = 'over';
      this.result = { win: false, reason: 'wiped', floor: this.floor };
      this.finish();
      return;
    }
    if (this.roomIdx >= ROOMS_PER_FLOOR) {
      this.modKnown[this.floor] = true;
      this.phase = 'camp';
      this.stage = null;
    } else {
      this.stage = this.makeStage();
    }
  }

  // 加護を一つ使って、直前の部屋をやり直す
  rewind(report) {
    if (this.grace < 1) return false;
    const grace = this.grace - 1;
    const known = { ...this.profile.known };
    this.restore(report.before);
    this.grace = grace;
    this.profile.known = known;
    return true;
  }

  revealBoss() {
    const b = BOSSES[this.bossId];
    if (!this.traits.name) { this.traits.name = true; this.profile.bosses[this.bossId] = true; return `碑文:迷宮の主は「${b.name}」`; }
    if (!this.traits.weak) {
      this.traits.weak = true;
      const g = Object.values(GEAR).find((x) => x.elem === b.weak);
      return `碑文:${b.name}は${g.name}のような${({ holy: '聖なる', fire: '炎の', ice: '氷の', thunder: '雷の' })[b.weak]}力を嫌う`;
    }
    if (!this.traits.special) { this.traits.special = true; return `碑文:${b.name}は「${b.specialName}」を使う`; }
    return null;
  }

  revealFloors() {
    const out = [];
    for (const f of [this.floor, this.floor + 1]) {
      if (f > FLOORS || this.modKnown[f]) continue;
      this.modKnown[f] = true;
      const m = this.mods[f];
      out.push(`${f === this.floor ? 'この層' : '次の層'}は${m ? `「${MODS[m].name}」` : '平穏'}`);
    }
    return out;
  }

  // ---------- 野営 ----------
  camp(action, targetId) {
    const living = this.living();
    const out = [];
    if (action === 'rest') {
      let n = 0;
      for (const a of living) if (a.wounds) { a.wounds = 0; n++; }
      out.push(`${n}人の傷が癒えた`);
    } else if (action === 'train') {
      let n = 0;
      for (const a of living) {
        const before = levelOf(a);
        const cat = CAT_KEYS.reduce((b, k) => ((a.xp[k] || 0) < (a.xp[b] || 0) ? k : b), CAT_KEYS[0]);
        a.txp++;
        a.xp[cat]++;
        if (levelOf(a) > before) n++;
      }
      out.push(`全員が鍛錬した(${n}人が腕を上げた)`);
    } else if (action === 'pray') {
      this.addGrace(2);
      out.push('祈りを捧げ、加護を得た');
    } else if (action === 'honor') {
      const a = living.find((x) => x.id === targetId) || living.reduce((b, x) => (x.fame > b.fame ? x : b));
      const before = a.fame;
      a.fame += 30;
      a.log.push({ f: this.floor, r: ROOMS_PER_FLOOR, text: '焚き火の前で皆に称えられた' });
      out.push(`#${a.id} の名声が ${before} から ${a.fame} になった`);
    }
    this.camped = true;
    return out;
  }

  equip(stashIdx, advId) {
    const a = this.advs.find((x) => x.id === advId && x.alive);
    const k = this.stash[stashIdx];
    if (!a || !k) return false;
    const slot = GEAR[k].slot;
    this.stash.splice(stashIdx, 1);
    if (a.gear[slot]) this.stash.push(a.gear[slot]);
    a.gear[slot] = k;
    a.log.push({ f: this.floor, r: ROOMS_PER_FLOOR, text: `${GEAR[k].name}を託された` });
    return true;
  }

  gearValue(k) {
    const g = GEAR[k];
    if (g.slot === 'weapon') return g.atk + (this.traits.weak && g.elem === BOSSES[this.bossId].weak ? 14 : 0);
    if (g.slot === 'armor') return 1 - g.def;
    return { banner: 5, amulet: 4, lamp: 3, sigil: 3, beastward: 2, trapward: 2 }[k] || 1;
  }

  // 装備をまとめて配り直す:良い物ほど、名声と腕のある者へ
  autoEquip() {
    const living = this.living();
    const prio = (a) => a.fame * 3 + levelOf(a) * 2 + (a.skill ? 20 : 0);
    const order = living.slice().sort((a, b) => prio(b) - prio(a) || a.id - b.id);
    for (const slot of ['weapon', 'armor', 'charm']) {
      const pool = this.stash.filter((k) => GEAR[k].slot === slot);
      for (const a of living) if (a.gear[slot]) pool.push(a.gear[slot]);
      pool.sort((x, y) => this.gearValue(y) - this.gearValue(x));
      this.stash = this.stash.filter((k) => GEAR[k].slot !== slot);
      order.forEach((a, i) => { a.gear[slot] = pool[i] || null; });
      this.stash.push(...pool.slice(order.length));
    }
  }

  nextFloor() {
    this.floor++;
    this.roomIdx = 0;
    this.camped = false;
    if (this.floor > FLOORS) { this.startBoss(); return; }
    this.phase = 'room';
    this.stage = this.makeStage();
  }

  // ---------- 決戦 ----------
  prophecyOdds() {
    const living = this.living();
    const w = living.map((a) => [a, Math.pow(a.fame + 1, 2.5)]);
    const total = w.reduce((s, [, x]) => s + x, 0) || 1;
    return w.map(([a, x]) => ({ id: a.id, p: x / total })).sort((a, b) => b.p - a.p);
  }

  strikeChance(a) {
    const b = BOSSES[this.bossId];
    const at = atk(a);
    let p = 0.25 + 0.5 * at / (at + 14);
    if (a.gear.weapon && GEAR[a.gear.weapon].elem === b.weak) p += 0.2;
    if (a.skill === 'slayer') p += 0.25;
    if (a.skill === 'vessel') p += 0.15;
    if (a.gear.weapon === 'dragonspear') p += 0.1;
    p -= 0.08 * a.wounds;
    return Math.max(0.1, Math.min(0.95, p));
  }

  startBoss() {
    this.phase = 'boss';
    this.stage = null;
    this.boss = { hp: BOSS_HP, max: BOSS_HP, round: 0, charge: false, strikes: 0, ready: false };
    this.profile.bosses[this.bossId] = true;
  }

  bossRound(stance) {
    const b = BOSSES[this.bossId];
    const bs = this.boss;
    this.fx = {};
    this.notesOut = [];
    const c = new Ctx(this, this.living(), { kind: 'boss', name: b.name });
    if (stance === 'grace') {
      if (this.grace < 1) stance = 'guard';
      else this.grace--;
    }
    bs.round++;
    // 隊の攻撃
    let dmg = 0;
    for (const a of this.living()) {
      let d = atk(a);
      if (a.gear.weapon && GEAR[a.gear.weapon].elem === b.weak) d *= 2.5;
      if (a.skill === 'slayer') d *= 4;
      if (a.gear.weapon === 'dragonspear') d *= 1.5;
      dmg += d;
    }
    dmg *= { attack: 1.3, guard: 0.6, grace: 0.8 }[stance] * (0.85 + 0.3 * this.rng());
    dmg = Math.round(dmg);
    bs.hp = Math.max(0, bs.hp - dmg);
    // 主の反撃
    let special = null;
    const stanceMul = { attack: 1.4, guard: 0.45, grace: 0.45 }[stance];
    if (bs.charge) {
      if (stance === 'grace') { special = 'blocked'; c.note(`加護が${b.specialName}を退けた`, 2); }
      else { special = b.special; this.bossSpecial(c, b); }
      bs.charge = false;
    }
    if (special !== b.special) {
      for (const a of this.living()) {
        const p = Math.min(0.9, 0.12 * (1 + 0.15 * bs.round) * personalMul(a) * stanceMul);
        if (this.rng() < p) c.hit(a, `${b.name}に倒された`);
      }
    }
    if (c.skills.has('healer')) for (const a of this.living()) if (a.wounds && this.rng() < 0.5) { a.wounds--; c.push(a, { t: 'heal' }); }
    bs.charge = special === null && bs.round % 3 === 2;
    bs.ready = bs.hp <= bs.max * STRIKE_AT && this.population() > 0;
    const report = { dmg, special, deaths: c.sum.died, notes: this.notesOut, fx: this.fx, stance };
    this.fx = null;
    this.notesOut = null;
    this.checkBossEnd();
    return report;
  }

  bossSpecial(c, b) {
    c.note(`${b.name}の「${b.specialName}」`, 3);
    const living = this.living();
    if (b.special === 'doom') {
      const targets = living.filter((a) => a.skill !== 'shadow');
      if (!targets.length) return;
      const t = targets.reduce((x, a) => (a.fame > x.fame ? a : x));
      c.doom(t, '死の宣告を受けた');
    } else if (b.special === 'inferno') {
      for (const a of living) if (this.rng() < Math.min(0.9, 0.45 * personalMul(a))) c.hit(a, '業火に焼かれた');
    } else if (b.special === 'madness') {
      for (const a of living) if (this.rng() < Math.min(0.9, 0.18 * personalMul(a))) c.doom(a, '狂気に呑まれた');
    } else if (b.special === 'poison') {
      const heal = c.skills.has('healer');
      for (const a of living) {
        if (a.wounds >= 2 && this.rng() < (heal ? 0.25 : 0.5)) c.doom(a, '毒にむしばまれた');
        else c.wound(a);
      }
    }
  }

  // 予言が勇者を選び、勇者が一撃を放つ
  prophecy() {
    const odds = this.prophecyOdds();
    let x = this.rng();
    let pick = odds[odds.length - 1];
    for (const o of odds) { x -= o.p; if (x < 0) { pick = o; break; } }
    const hero = this.advs.find((a) => a.id === pick.id);
    const chance = this.strikeChance(hero);
    const success = this.rng() < chance;
    const bs = this.boss;
    bs.strikes++;
    bs.ready = false;
    let fell = false;
    if (success) {
      bs.hp = 0;
      hero.log.push({ f: FLOORS + 1, r: 0, text: `予言に選ばれ、${BOSSES[this.bossId].name}を討った` });
      this.phase = 'over';
      this.result = { win: true, hero: hero.id, survivors: this.population(), strikes: bs.strikes, rounds: bs.round };
      this.finish();
    } else {
      bs.hp = Math.round(bs.max * 0.35);
      bs.charge = true;
      if (this.rng() < 0.4 && hero.skill !== 'immortal') {
        hero.alive = false;
        hero.cause = '一撃を外し、返り討ちにあった';
        hero.log.push({ f: FLOORS + 1, r: 0, text: hero.cause });
        this.dead.push(hero);
        fell = true;
      } else {
        hero.wounds = Math.min(2, hero.wounds + 1);
        hero.log.push({ f: FLOORS + 1, r: 0, text: '予言に選ばれたが、一撃は届かなかった' });
      }
      this.checkBossEnd();
    }
    return { odds, hero: hero.id, chance, success, fell };
  }

  checkBossEnd() {
    if (this.phase !== 'boss') return;
    if (!this.population()) {
      this.phase = 'over';
      this.result = { win: false, reason: 'wiped', floor: FLOORS + 1 };
      this.finish();
    }
  }

  finish() {
    const p = this.profile;
    p.runs++;
    if (this.result.win) {
      p.wins++;
      p.best = Math.max(p.best || 0, this.result.survivors);
    }
  }
}
