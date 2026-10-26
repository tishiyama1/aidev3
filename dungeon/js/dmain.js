// 百人の迷宮:画面と流れ。ルールは dsim.js、絵は art.js / stage.js、音は sound.js。
import { Run, newProfile, mulberry32, kanji, roomById, levelOf, atk, power, FLOORS, ROOMS_PER_FLOOR } from './dsim.js';
import { GEAR, SKILLS, BOSSES, MODS, CATS, ELEMS, ROOMS, SKILL_ORDER } from './ddata.js';
import { PATH_TINTS, sprite } from './art.js';
import { lookFor } from './names.js';
import { Stage } from './stage.js';
import { Ruler } from './ruler.js';
import { sfx, scene, unlock, setVolumes, setIntensity } from './sound.js';

const KEY = 'hyakunin-dungeon.v1';
const VERSION = 2;
const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('ja-JP');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pct = (p) => `${Math.round(p * 100)}%`;
const FAST = new URLSearchParams(location.search).has('fast');
const newRng = () => mulberry32((Math.random() * 2 ** 32) >>> 0);

const SORTS = { power: '強い順', fame: '名声順', wounds: '傷の少ない順' };
const floorName = (f) => (f > FLOORS ? '最深部' : `地下${kanji(f)}層`);

// ---------- 保存 ----------
let store = load();
function load() {
  const base = { v: VERSION, profile: newProfile(), run: null, settings: { music: 0.6, sfx: 0.8, speed: 'normal', reduced: 'auto' }, coach: {} };
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && d.profile) {
      return { ...base, ...d, v: VERSION, profile: { ...newProfile(), ...d.profile }, settings: { ...base.settings, ...(d.settings || {}) }, coach: d.coach || {} };
    }
  } catch { /* 壊れた保存は無視して新しく始める */ }
  return base;
}
function save() {
  try {
    store.run = run && run.phase !== 'over' ? run.toJSON() : null;
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch { /* 保存できない環境でも遊べる */ }
}

// ---------- 状態 ----------
let run = null;
let cuts = [];
let sortMode = 'power';
let busy = false;
let pending = null;
let lastReport = null;
let campSel = null;
let campMsg = '';
const app = $('app');

const stage = new Stage($('stage'), { onPick: (a) => { if (!busy && run && a.name) inspect(a); } });
const ruler = new Ruler($('ruler'), {
  value: power,
  onChange: (c) => { cuts = c; updateAssign(); },
  onTick: () => sfx.ruler(),
});

function applySettings() {
  const s = store.settings;
  setVolumes(s.music, s.sfx);
  const sysReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reduced = s.reduced === 'on' || (s.reduced === 'auto' && sysReduced);
  stage.reduced = reduced;
  document.body.classList.toggle('reduced', reduced);
  stage.speed = FAST ? 0.05 : s.speed === 'fast' ? 0.55 : 1;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms * stage.speed));

// ---------- エラー ----------
function toast(msg, actions = []) {
  const t = $('toast');
  t.innerHTML = `<span>${esc(msg)}</span>${actions.map((a, i) => `<button class="btn ghost" data-i="${i}" style="min-height:36px;padding:4px 12px">${esc(a[0])}</button>`).join('')}`;
  t.hidden = false;
  t.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { t.hidden = true; actions[Number(b.dataset.i)][1](); }));
  if (!actions.length) setTimeout(() => { t.hidden = true; }, 3000);
}
function onError(e) {
  console.error(e);
  busy = false;
  sfx.error();
  toast('問題が起きました。遠征はここまで保存されています。', [['表紙へ', () => location.reload()]]);
}
window.addEventListener('error', (e) => onError(e.error || e));
window.addEventListener('unhandledrejection', (e) => onError(e.reason));

// ---------- 表紙 ----------
const TITLE_PARTY = Array.from({ length: 14 }, (_, i) => ({
  id: 9000 + i, look: lookFor(77, i + 1), wounds: 0, skill: null, fame: 0,
  gear: { weapon: ['steel', null, 'axe', 'rusty', null, 'ice', 'steel', null, 'rusty', 'fire', null, 'steel', 'thunder', null][i], armor: i % 3 ? 'leather' : 'chain', charm: i === 5 ? 'banner' : null },
}));

function showTitle() {
  app.className = 'is-title';
  $('hud').hidden = true;
  for (const id of ['room-panel', 'camp-panel', 'boss-panel']) $(id).hidden = true;
  $('title-panel').hidden = false;
  $('lore').innerHTML = '';
  ticker('');
  closeSheet();
  stage.setFloor(1);
  stage.setMode('title');
  stage.setParty(TITLE_PARTY);
  scene('title');
  const has = !!store.run;
  $('btn-continue').hidden = !has;
  $('btn-new').className = has ? 'btn ghost' : 'btn primary';
  $('btn-new').textContent = has ? '新しく挑む' : '挑む';
  const p = store.profile;
  $('title-records').textContent = p.runs ? `討伐 ${p.wins} ・ 挑戦 ${p.runs}${p.heroes?.[0] ? ` ・ 最後の勇者 ${p.heroes[0].name}` : ''}` : '';
}

$('btn-continue').addEventListener('click', () => {
  unlock();
  sfx.click();
  try {
    run = new Run(store.profile, newRng(), store.run);
    enterRun(false);
  } catch (e) {
    store.run = null;
    save();
    toast('保存された遠征を読み込めませんでした。新しく始めてください。');
    showTitle();
  }
});
$('btn-new').addEventListener('click', (e) => {
  unlock();
  sfx.click();
  const start = () => { run = new Run(store.profile, newRng()); save(); enterRun(true); };
  if (store.run) armed(e.currentTarget, '今の遠征を捨てて挑む', start); else start();
});
$('btn-book').addEventListener('click', () => { unlock(); sfx.click(); openBook(); });
$('btn-settings').addEventListener('click', () => { unlock(); sfx.click(); openSettings(); });
$('btn-menu').addEventListener('click', () => { unlock(); sfx.click(); openMenu(); });

function armed(btn, label, fn) {
  if (btn.dataset.armed) {
    delete btn.dataset.armed;
    btn.classList.remove('armed');
    btn.textContent = btn.dataset.label;
    fn();
    return;
  }
  btn.dataset.armed = '1';
  btn.dataset.label = btn.textContent;
  btn.textContent = label;
  btn.classList.add('armed');
  setTimeout(() => {
    if (!btn.dataset.armed) return;
    delete btn.dataset.armed;
    btn.classList.remove('armed');
    btn.textContent = btn.dataset.label;
  }, 3000);
}

// ---------- 遠征 ----------
async function enterRun(fresh) {
  busy = true;
  app.className = '';
  $('title-panel').hidden = true;
  $('hud').hidden = false;
  pending = null;
  cuts = [];
  stage.figs.clear();
  stage.setFloor(run.floor);
  if (fresh) {
    sfx.descend();
    await stage.descend('地下一層', '百人の冒険者が、迷宮へ踏み入る', 1, () => render());
  } else {
    render();
    stage.banner(floorName(run.floor), '遠征の続き');
  }
  busy = false;
  lockRoom(false);
  maybeCoach();
}

function render() {
  hud();
  lore();
  for (const id of ['room-panel', 'camp-panel', 'boss-panel']) $(id).hidden = true;
  if (run.phase === 'room') renderRoom();
  else if (run.phase === 'camp') renderCamp();
  else if (run.phase === 'boss') renderBoss();
  else if (run.phase === 'over') showEnd();
}

function hud() {
  const cur = run.phase === 'boss' || run.floor > FLOORS ? FLOORS + 1 : run.floor;
  $('depth').innerHTML = Array.from({ length: FLOORS }, (_, i) => `<li class="${i + 1 < cur ? 'done' : i + 1 === cur ? 'now' : ''}" title="${floorName(i + 1)}"></li>`).join('')
    + `<li class="boss ${cur > FLOORS ? 'now' : ''}" title="最深部"></li>`;
  $('hud-floor').textContent = floorName(run.floor);
  $('hud-room').textContent = run.phase === 'room' ? `${kanji(run.roomIdx + 1)}ノ間 ／ 全${kanji(ROOMS_PER_FLOOR)}間` : run.phase === 'camp' ? '野営' : run.phase === 'boss' ? `決戦 ${run.boss?.round ? `${kanji(run.boss.round)}合目` : ''}` : '';
  $('hud-pop').textContent = run.population();
  $('hud-grace').textContent = run.grace;
}

function lore() {
  const b = BOSSES[run.bossId];
  const t = run.traits;
  const m = run.mods[run.floor];
  const mod = run.phase === 'room' && run.floorKnown() ? `<span class="mod">${m ? `${esc(MODS[m].name)} ― ${esc(MODS[m].text)}` : 'この層は平穏だ。'}</span>` : '';
  $('lore').innerHTML = `主 <b>${esc(t.name ? b.name : '？？？')}</b> ・ 弱点 <b>${t.weak ? ELEMS[b.weak] : '？'}</b> ・ 必殺 <b>${esc(t.special ? b.specialName : '？')}</b>${mod}`;
}

function ticker(text, level = 1) { $('ticker').innerHTML = text ? `<span class="lv${level}">${esc(text)}</span>` : ''; }

function heroesTop() { return run.prophecyOdds().filter((o) => o.p >= 0.12).slice(0, 3).map((o) => o.id); }

// ---------- 部屋 ----------
function evenCuts(k) { return Array.from({ length: k - 1 }, (_, i) => (i + 1) / k); }
function allTo(k, i) { return Array.from({ length: k - 1 }, (_, j) => (j < i ? 0 : 1)); }

function renderRoom() {
  $('room-panel').hidden = false;
  $('ruler-wrap').style.display = '';
  $('sort').disabled = false;
  ruler.locked = false;
  stage.setFloor(run.floor);
  stage.setMode('room');
  const rooms = run.stage.rooms;
  stage.setDoors(rooms.map((id, i) => ({ glyph: roomById(id).glyph, tint: PATH_TINTS[i] })));
  scene('dungeon', { depth: run.floor });
  const k = rooms.length;
  if (cuts.length !== k - 1) cuts = evenCuts(k);
  $('plaques').style.setProperty('--k', k);
  $('plaques').innerHTML = rooms.map((id, i) => {
    const r = roomById(id);
    return `<button class="plaque" data-i="${i}" style="--pc:${PATH_TINTS[i]}">
      <div class="p-head"><span class="p-glyph">${r.glyph}</span><span class="p-name">${esc(r.name)}</span></div>
      <div class="p-text">${esc(r.text)}</div>
      <div class="p-count"></div>
      <div class="p-est"></div>
    </button>`;
  }).join('');
  $('plaques').querySelectorAll('.plaque').forEach((el) => {
    const i = Number(el.dataset.i);
    el.addEventListener('click', () => { if (busy || pending) return; sfx.click(); cuts = allTo(k, i); updateAssign(); });
    el.addEventListener('pointerenter', () => { if (stage.doors[i]) stage.doors[i].hover = true; });
    el.addEventListener('pointerleave', () => { if (stage.doors[i]) stage.doors[i].hover = false; });
  });
  $('btn-go').textContent = '進め';
  $('btn-alt').hidden = true;
  updateAssign();
}

function updateAssign() {
  if (!run || run.phase !== 'room' || !run.stage || pending) return;
  const groups = run.groupsFor(cuts, sortMode);
  const m = new Map();
  groups.forEach((g, i) => g.forEach((a) => m.set(a.id, i)));
  stage.setParty(run.sorted(sortMode), m, heroesTop());
  ruler.set(run.sorted(sortMode), cuts);
  $('plaques').querySelectorAll('.plaque').forEach((el, i) => {
    const g = groups[i] || [];
    el.querySelector('.p-count').innerHTML = `${g.length}<small>人</small>`;
    el.classList.toggle('empty', !g.length);
    const est = el.querySelector('.p-est');
    const e = run.estimate(run.stage.rooms[i], g);
    if (!e.known) { est.className = 'p-est unknown'; est.textContent = '見込み ― 未知の部屋'; return; }
    if (e.empty) { est.className = 'p-est'; est.textContent = '誰も向かわない'; return; }
    const q = e.sure ? '' : '?';
    const n = (x) => (x > 0 && x < 1 ? '0〜1' : `約${Math.round(x)}`);
    est.className = `p-est${e.survive < 0.8 ? ' risky' : ''}`;
    est.innerHTML = `生還 <b>${pct(e.survive)}${q}</b><br><span class="nw">倒れる ${n(e.deaths)}</span> <span class="nw">傷 ${n(e.wounds)}</span>`;
  });
}

function lockRoom(on) {
  $('btn-go').disabled = on;
  $('btn-alt').disabled = on;
  $('sort').disabled = on || !!pending;
  ruler.locked = on || !!pending;
}

$('sort').addEventListener('click', () => {
  if (busy || pending) return;
  sfx.click();
  const keys = Object.keys(SORTS);
  sortMode = keys[(keys.indexOf(sortMode) + 1) % keys.length];
  $('sort').textContent = SORTS[sortMode];
  updateAssign();
});
$('btn-go').addEventListener('click', go);
$('btn-alt').addEventListener('click', alt);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('overlay').hidden && $('overlay').dataset.dismiss) { closeSheet(); return; }
  if (e.key === 'Enter' && !busy && run && $('overlay').hidden && !$('room-panel').hidden && document.activeElement?.tagName !== 'BUTTON') { e.preventDefault(); go(); }
});

async function go() {
  if (busy || !run) return;
  unlock();
  hideCoach();
  if (pending) {
    const p = pending;
    pending = null;
    $('btn-alt').hidden = true;
    if (p === 'end') { showEnd(); return; }
    render();
    maybeCoach();
    return;
  }
  if (run.phase !== 'room') return;
  busy = true;
  lockRoom(true);
  sfx.door();
  sfx.march();
  const rep = run.resolve(cuts, sortMode);
  lastReport = rep;
  save();
  $('plaques').querySelectorAll('.plaque').forEach((el) => el.classList.add('fading'));
  ticker('');
  await stage.enterDoors(rep.groups);
  const total = rep.groups.reduce((s, g) => s + g.length, 0);
  sfx.battle(total);
  await wait(900);

  // 生き残りは元の扉の前へ戻る
  const living = run.living();
  const aliveSet = new Set(living.map((a) => a.id));
  const assign = new Map();
  rep.groups.forEach((g, i) => g.forEach((id) => assign.set(id, i)));
  const newcomers = [];
  rep.summaries.forEach((s, i) => {
    if (!s.recruits) return;
    for (const [id, evs] of Object.entries(rep.fx)) if (evs.some((e) => e.t === 'born')) { assign.set(Number(id), i); newcomers.push([Number(id), i]); }
  });
  const deadByDoor = rep.summaries.map((s) => Object.values(s.died).reduce((a, b) => a + b, 0));
  stage.setParty(run.sorted(sortMode), assign, heroesTop());
  await stage.returnFrom(rep.groups, aliveSet, deadByDoor, newcomers);

  const deaths = deadByDoor.reduce((a, b) => a + b, 0);
  if (deaths) sfx.toll();
  // 扉から戻って元の場所に着いてから、成長や発見を見せる
  for (const [id, evs] of Object.entries(rep.fx)) setTimeout(() => applyFx(Number(id), evs), (700 + Math.random() * 700) * stage.speed);
  stage.banner(deaths ? `${kanji(deaths)}人が戻らなかった` : '全員が戻った', deaths ? '扉の前に灯をともす' : '', deaths ? '#f0b0a0' : '#efe3cc');
  const top = rep.notes.filter((n) => n.level >= 2).sort((a, b) => b.level - a.level).slice(0, 3);
  showResults(rep);
  hud();
  pending = run.phase === 'over' ? 'end' : 'next';
  $('btn-go').textContent = pending === 'end' ? '戦記を見る' : run.phase === 'camp' ? '野営する' : '次の間へ';
  if (run.grace >= 1 && pending !== 'end') {
    $('btn-alt').hidden = false;
    $('btn-alt').className = 'btn ghost grace';
    $('btn-alt').textContent = '巻き戻す';
  }
  busy = false;
  lockRoom(false);
  maybeCoach('result');
  for (const n of top) {
    await wait(1400);
    if (pending !== 'next' && pending !== 'end') break;
    ticker(n.text, n.level);
  }
}

function applyFx(id, events) {
  for (const e of events) {
    switch (e.t) {
      case 'wound': sfx.wound(); break; // 傷は包帯の絵で残るので文字は出さない
      case 'heal': stage.float(id, '癒', '#8fbf7a'); sfx.heal(); break;
      case 'lvup': stage.float(id, `Lv${e.lv}`, '#ffd28a'); sfx.lvup(); break;
      case 'loot': stage.float(id, GEAR[e.k].glyph, '#efe3cc', GEAR[e.k].tier >= 3); sfx.loot(); break;
      case 'lose': stage.float(id, `−${GEAR[e.k].glyph}`, '#b9a88d'); break;
      case 'awaken': stage.float(id, SKILLS[e.k].name, '#ffe6a8', true); stage.pillar(id); sfx.awaken(); break;
      default: break;
    }
  }
  const a = run?.advs.find((x) => x.id === id);
  if (a) stage.refresh(a);
}

function resultLines(sum) {
  if (!sum.sent) return [['quiet', '誰も向かわなかった']];
  const L = [];
  for (const [cause, n] of Object.entries(sum.died)) L.push(['bad', `${cause} ${n}人`]);
  if (sum.wounded) L.push(['bad', `傷を負った ${sum.wounded}人`]);
  for (const id of sum.awakened) {
    const a = run.advs.find((x) => x.id === id);
    if (a) L.push(['note', `${a.name}が「${SKILLS[a.skill].name}」に覚醒`]);
  }
  for (const t of sum.revealed) L.push(['note', t]);
  if (sum.lvup) L.push(['gold', `腕を上げた ${sum.lvup}人`]);
  if (sum.loot.length) L.push(['gold', `${sum.loot.map((k) => GEAR[k].name).join('、')}を見つけた`]);
  if (sum.recruits) L.push(['good', `${sum.recruits}人が隊に加わった`]);
  if (sum.healed) L.push(['good', `${sum.healed}人の傷が癒えた`]);
  if (sum.grace) L.push(['gold', '加護を授かった']);
  if (sum.quiet && !L.length) L.push(['quiet', `何事もなかった ${sum.quiet}人`]);
  else if (sum.quiet) L.push(['quiet', `ほか ${sum.quiet}人は何事もなかった`]);
  if (!L.length) L.push(['quiet', '全員が無事に通り抜けた']);
  return L;
}

function showResults(rep) {
  $('plaques').innerHTML = rep.rooms.map((id, i) => {
    const r = roomById(id);
    const s = rep.summaries[i];
    return `<div class="plaque result${s.sent ? '' : ' empty'}" style="--pc:${PATH_TINTS[i]}">
      <div class="p-head"><span class="p-glyph">${r.glyph}</span><span class="p-name">${esc(r.name)}</span></div>
      <div class="res-count">${s.sent}<small>人</small> → <b>${s.alive}</b><small>人</small></div>
      <ul class="res-lines">${resultLines(s).map(([c, t]) => `<li class="${c}">${esc(t)}</li>`).join('')}</ul>
    </div>`;
  }).join('');
  $('ruler-wrap').style.display = 'none';
  $('sort').disabled = true;
}

function alt() {
  if (busy || !run || !pending || !lastReport || run.grace < 1) return;
  armed($('btn-alt'), '加護を一つ使う', async () => {
    busy = true;
    run.rewind(lastReport);
    lastReport = null;
    pending = null;
    save();
    sfx.rewind();
    stage.flashScreen([255, 230, 168], 900);
    stage.figs.clear();
    stage.candles = [];
    $('btn-alt').hidden = true;
    render();
    stage.relayout(true);
    stage.banner('時が巻き戻った', '加護が一つ消えた', '#ffe6a8');
    busy = false;
    lockRoom(false);
  });
}

// ---------- 野営 ----------
const CAMP_ACTS = [
  ['rest', '休', '休息', '全員の傷が癒える'],
  ['train', '鍛', '鍛錬', '全員が少し腕を上げる'],
  ['pray', '祈', '祈り', '加護を二つ授かる'],
  ['honor', '讃', '称える', '一人の名声を大きく高める'],
];

function renderCamp() {
  $('camp-panel').hidden = false;
  stage.setMode('camp');
  stage.setParty(run.living().sort((a, b) => b.fame - a.fame), new Map(), heroesTop());
  scene('camp');
  drawCamp();
}

function rosterRows(mode) {
  const odds = new Map(run.prophecyOdds().map((o) => [o.id, o.p]));
  const list = run.living().sort((a, b) => (mode === 'honor' ? b.fame - a.fame : power(b) - power(a)) || a.id - b.id).slice(0, 16);
  return `<div class="roster">${list.map((a) => `
    <button data-id="${a.id}">
      <span class="nm">${esc(a.name)}<small>Lv${levelOf(a)}${a.skill ? ` ・ ${esc(SKILLS[a.skill].name)}` : ''}${a.wounds ? ` ・ 傷${a.wounds}` : ''}</small></span>
      <span class="odds">予言 ${pct(odds.get(a.id) || 0)}</span>
      <span class="meta">戦力${power(a)} ・ 名声${a.fame} ・ ${['weapon', 'armor', 'charm'].map((s) => (a.gear[s] ? GEAR[a.gear[s]].name : '')).filter(Boolean).join(' / ') || '装備なし'}</span>
    </button>`).join('')}</div>`;
}

function drawCamp() {
  const living = run.living();
  const odds = run.prophecyOdds().slice(0, 3);
  const last = run.floor >= FLOORS;
  const stash = run.stash.map((k, i) => [k, i]).sort((x, y) => GEAR[y[0]].tier - GEAR[x[0]].tier);
  const wounded = living.filter((a) => a.wounds).length;
  $('camp-panel').innerHTML = `
    <div class="camp-grid">
      <div class="card">
        <h3>予言の噂</h3>
        <div class="rumor">${odds.map((o) => {
          const a = run.advs.find((x) => x.id === o.id);
          return `<div class="rumor-row"><span class="who">${esc(a.name)}<small>Lv${levelOf(a)}${a.skill ? ` ・ ${esc(SKILLS[a.skill].name)}` : ''} ・ 一撃 ${pct(run.strikeChance(a))}</small></span><span class="p">${pct(o.p)}</span><div class="bar"><i style="width:${o.p * 100}%"></i></div></div>`;
        }).join('')}</div>
      </div>
      <div class="card">
        <h3>戦利品 ${run.stash.length ? `― ${run.stash.length}点` : ''}</h3>
        <div class="rack">${stash.map(([k, i]) => `<button class="gear t${GEAR[k].tier}${campSel === i ? ' sel' : ''}" data-i="${i}"><b>${GEAR[k].glyph}</b>${esc(GEAR[k].name)}</button>`).join('') || '<span class="records">まだ何もない</span>'}</div>
        ${run.stash.length ? '<div class="sh-actions" style="margin-top:10px"><button class="btn ghost" id="auto-equip">良い物から配る</button></div>' : ''}
        ${typeof campSel === 'number' ? `<p class="records" style="margin-top:8px">${esc(GEAR[run.stash[campSel]].name)}を誰に託す？</p>${rosterRows('power')}` : ''}
      </div>
      <div class="card" style="grid-column:1/-1">
        <h3>今夜の過ごし方 ― 隊 ${living.length}人 ・ 傷 ${wounded}人</h3>
        <div class="acts">${CAMP_ACTS.map(([k, g, n, d]) => `<button class="act${campSel === k ? ' on' : ''}" data-act="${k}" ${run.camped ? 'disabled' : ''}><b>${g}</b><span>${n}</span><small>${d}</small></button>`).join('')}</div>
        ${campSel === 'honor' && !run.camped ? `<p class="records" style="margin-top:8px">誰を称える？</p>${rosterRows('honor')}` : ''}
        <p class="camp-log">${esc(campMsg)}</p>
      </div>
    </div>
    <div class="actions"><button class="btn primary" id="camp-next" ${run.camped ? '' : 'disabled'}>${last ? '主のもとへ' : '次の層へ下りる'}</button></div>`;
  const P = $('camp-panel');
  P.querySelectorAll('.gear').forEach((b) => b.addEventListener('click', () => {
    sfx.click();
    const i = Number(b.dataset.i);
    campSel = campSel === i ? null : i;
    drawCamp();
  }));
  $('auto-equip')?.addEventListener('click', () => {
    run.autoEquip();
    campSel = null;
    campMsg = '装備を、名声と腕のある者から順に配り直した。';
    for (const a of run.living()) stage.refresh(a);
    sfx.equip();
    save();
    drawCamp();
  });
  P.querySelectorAll('.act').forEach((b) => b.addEventListener('click', () => {
    const act = b.dataset.act;
    if (act === 'honor') { sfx.click(); campSel = campSel === 'honor' ? null : 'honor'; drawCamp(); return; }
    campDone(run.camp(act));
  }));
  P.querySelectorAll('.roster button').forEach((b) => b.addEventListener('click', () => {
    const id = Number(b.dataset.id);
    const a = run.advs.find((x) => x.id === id);
    if (campSel === 'honor') {
      campDone(run.camp('honor', id));
      stage.pillar(id);
      return;
    }
    if (typeof campSel === 'number') {
      const name = GEAR[run.stash[campSel]].name;
      run.equip(campSel, id);
      campSel = null;
      stage.refresh(a);
      stage.float(id, '託', '#ffd28a');
      sfx.equip();
      campMsg = `${a.name}に${name}を託した。`;
      save();
      drawCamp();
    }
  }));
  $('camp-next').addEventListener('click', nextFloor);
}

function campDone(out) {
  campSel = null;
  campMsg = out.join('。') + '。';
  sfx.camp();
  for (const a of run.living()) stage.refresh(a);
  stage.setParty(run.living().sort((a, b) => b.fame - a.fame), new Map(), heroesTop());
  save();
  hud();
  drawCamp();
}

async function nextFloor() {
  if (busy) return;
  busy = true;
  campMsg = '';
  sfx.descend();
  const next = run.floor + 1;
  const toBoss = next > FLOORS;
  const b = BOSSES[run.bossId];
  await stage.descend(floorName(next), toBoss ? (run.traits.name ? `${b.name}が待つ` : '主の気配がする') : next === FLOORS ? '主の気配が近い' : '', next, () => {
    run.nextFloor();
    cuts = [];
    save();
    stage.setFloor(Math.min(run.floor, FLOORS));
    render();
  });
  busy = false;
  lockRoom(false);
  if (run.phase === 'boss') stage.banner(run.traits.name ? b.name : '迷宮の主', '最深部', '#f0b0a0');
}

// ---------- 決戦 ----------
function renderBoss(tell) {
  $('boss-panel').hidden = false;
  stage.setMode('boss');
  stage.setBoss(run.bossId);
  stage.setParty(run.living().sort((a, b) => power(b) - power(a)), new Map(), heroesTop());
  const b = BOSSES[run.bossId];
  const bs = run.boss;
  const t = run.traits;
  stage.bossRage = bs.charge ? 1 : 0;
  scene('boss', { intensity: 1 - bs.hp / bs.max });
  setIntensity(1 - bs.hp / bs.max);
  const odds = run.prophecyOdds().slice(0, 3);
  const msg = tell || (bs.ready ? '主が膝をついた。今なら一撃が届く。' : bs.charge ? b.tell : '主が隊を見下ろしている。');
  $('boss-panel').innerHTML = `
    <div class="card">
      <div class="boss-row">
        <div>
          <div class="boss-name">${esc(t.name ? b.name : '迷宮の主')}</div>
          <div class="boss-traits">弱点 ${t.weak ? ELEMS[b.weak] : '？'} ・ 必殺 ${esc(t.special ? b.specialName : '？')}</div>
        </div>
        <div class="boss-round">${bs.round ? `${kanji(bs.round)}合目` : '開戦'}</div>
        <div class="seal${bs.ready ? ' ready' : ''}" role="progressbar" aria-valuenow="${Math.round((bs.hp / bs.max) * 100)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${(bs.hp / bs.max) * 100}%"></i></div>
        <div class="tell ${bs.ready ? 'ready' : bs.charge ? '' : 'calm'}">${esc(msg)}</div>
      </div>
      ${bs.ready ? `<div class="actions"><button class="btn primary" id="btn-prophecy">予言を聞く</button></div>` : `
      <div class="stances">
        <button class="stance attack" data-s="attack"><b>攻</b><span>攻める</span><small>大きく削る<br>受ける傷も増える</small></button>
        <button class="stance guard" data-s="guard"><b>守</b><span>守る</span><small>削りは浅い<br>守りを固める</small></button>
        <button class="stance grace${bs.charge ? ' suggest' : ''}" data-s="grace" ${run.grace < 1 ? 'disabled' : ''}><b>護</b><span>加護 ${run.grace}</span><small>必殺を退け<br>守りを固める</small></button>
      </div>`}
    </div>
    <div class="card" style="margin-top:10px"><h3>予言の噂</h3><div class="rumor">${odds.map((o) => {
      const a = run.advs.find((x) => x.id === o.id);
      return `<div class="rumor-row"><span class="who">${esc(a.name)}<small>一撃 ${pct(run.strikeChance(a))}</small></span><span class="p">${pct(o.p)}</span><div class="bar"><i style="width:${o.p * 100}%"></i></div></div>`;
    }).join('')}</div></div>`;
  $('boss-panel').querySelectorAll('.stance').forEach((el) => el.addEventListener('click', () => bossTurn(el.dataset.s)));
  $('btn-prophecy')?.addEventListener('click', prophecyFlow);
  hud();
}

function lockBoss(on) { $('boss-panel').querySelectorAll('button').forEach((b) => { if (on) b.disabled = true; }); }

async function bossTurn(stance) {
  if (busy) return;
  unlock();
  busy = true;
  lockBoss(true);
  sfx.stance(stance);
  const wasCharge = run.boss.charge;
  const rep = run.bossRound(stance);
  save();
  await wait(350);
  sfx.hit();
  stage.hurtBoss(1);
  stage.banner(`${fmt(rep.dmg)}`, '主に与えた傷', '#ffd28a');
  await wait(700);
  if (rep.special && rep.special !== 'blocked') {
    sfx.special();
    stage.flashScreen([180, 30, 24], 900);
  } else if (rep.special === 'blocked') {
    sfx.stance('grace');
    stage.flashScreen([255, 230, 168], 700);
  }
  const deaths = Object.values(rep.deaths).reduce((a, b) => a + b, 0);
  if (deaths) sfx.toll();
  for (const [id, evs] of Object.entries(rep.fx)) setTimeout(() => applyFx(Number(id), evs), Math.random() * 500 * stage.speed);
  const note = rep.notes.sort((a, b) => b.level - a.level)[0];
  ticker(note ? note.text : deaths ? `${deaths}人が倒れた` : wasCharge ? '必殺をしのいだ' : '誰も倒れなかった', note ? note.level : 1);
  await wait(500);
  busy = false;
  if (run.phase === 'over') { await wait(600); showEnd(); return; }
  renderBoss();
}

async function prophecyFlow() {
  if (busy) return;
  busy = true;
  lockBoss(true);
  const odds = run.prophecyOdds();
  const res = run.prophecy();
  save();
  ticker('天井から光が差す。予言が勇者を選ぶ……', 2);
  const seq = [];
  for (let i = 0; i < 18; i++) {
    let x = Math.random();
    let pick = odds[odds.length - 1].id;
    for (const o of odds) { x -= o.p; if (x < 0) { pick = o.id; break; } }
    seq.push(pick);
  }
  await stage.prophecy(seq, res.hero, (i) => sfx.prophecyTick(i));
  const hero = run.advs.find((a) => a.id === res.hero);
  sfx.chosen();
  ticker(`予言は${hero.name}を選んだ ― 一撃の見込み ${pct(res.chance)}`, 3);
  await wait(1700);
  stage.flashScreen([255, 240, 210], 600);
  if (res.success) {
    sfx.strikeWin();
    stage.killBoss();
    stage.banner('討伐', `${hero.name}の一撃が届いた`, '#ffd28a');
    scene('silent');
    await wait(2600);
    stage.clearBeam();
    busy = false;
    showEnd();
    return;
  }
  sfx.strikeFail();
  stage.hurtBoss(2);
  stage.banner('届かず', res.fell ? `${hero.name}は返り討ちにあった` : `${hero.name}は深手を負った`, '#f0b0a0');
  await wait(1600);
  stage.clearBeam();
  busy = false;
  if (run.phase === 'over') { showEnd(); return; }
  renderBoss('主が怒りに燃えている。次の一撃に備えよ。');
}

// ---------- 紙 ----------
function openSheet(html, dismissable = true) {
  $('sheet').innerHTML = html;
  $('overlay').hidden = false;
  if (dismissable) $('overlay').dataset.dismiss = '1'; else delete $('overlay').dataset.dismiss;
  $('overlay').onclick = dismissable ? (e) => { if (e.target === $('overlay')) closeSheet(); } : null;
  $('sheet').querySelector('button')?.focus({ preventScroll: true });
}
function closeSheet() {
  $('overlay').hidden = true;
  $('sheet').innerHTML = '';
  stage.selected = null;
}

function portrait(a, w = 72) {
  const c = document.createElement('canvas');
  const d = Math.min(window.devicePixelRatio || 1, 2);
  c.width = w * d;
  c.height = w * 1.5 * d;
  const x = c.getContext('2d');
  x.scale(d, d);
  const s = w * 0.8;
  x.drawImage(sprite(a, s), (w - s) / 2, w * 1.5 - s * 1.5 - 4, s, s * 1.5);
  return c;
}

function atLabel(e) {
  if (e.f > FLOORS) return '決戦';
  return `${kanji(e.f)}層${e.r >= ROOMS_PER_FLOOR ? '野営' : `${kanji(e.r + 1)}ノ間`}`;
}
function storyHTML(a) {
  if (!a.log.length) return '<ul class="story"><li><span class="at">入口</span>目立った出来事はまだない</li></ul>';
  return `<ul class="story">${a.log.map((e, i) => {
    const hi = /覚醒|討った|称えられ/.test(e.text);
    return `<li class="${!a.alive && i === a.log.length - 1 ? 'end' : hi ? 'hi' : ''}"><span class="at">${atLabel(e)}</span>${esc(e.text)}</li>`;
  }).join('')}</ul>`;
}
function gearTags(a) {
  return ['weapon', 'armor', 'charm'].filter((s) => a.gear[s]).map((s) => `<span class="tag"><b>${GEAR[a.gear[s]].glyph}</b>${esc(GEAR[a.gear[s]].name)}</span>`).join('');
}

function inspect(a) {
  stage.selected = a.id;
  sfx.click();
  const odds = run.prophecyOdds().find((o) => o.id === a.id);
  openSheet(`
    <div class="portrait"><span id="pt"></span><div>
      <div class="nm">${esc(a.name)}</div>
      <div class="meta">Lv${levelOf(a)} ・ 攻${atk(a)} ・ 戦力${power(a)} ・ 名声${a.fame}${a.wounds ? ` ・ 傷${a.wounds}` : ''}<br>予言 ${pct(odds?.p || 0)} ・ 一撃 ${pct(run.strikeChance(a))}</div>
    </div></div>
    <div class="tags">${a.skill ? `<span class="tag skill"><b>${SKILLS[a.skill].glyph}</b>${esc(SKILLS[a.skill].name)}</span>` : ''}${gearTags(a)}</div>
    <div class="xp">${Object.entries(CATS).map(([k, n]) => `<div><b>${a.xp[k] || 0}</b>${n}への備え</div>`).join('')}</div>
    ${storyHTML(a)}
    <div class="sh-actions"><button class="btn ghost" id="sh-close">閉じる</button></div>`);
  $('pt').replaceWith(portrait(a));
  $('sh-close').addEventListener('click', closeSheet);
}

function openMenu() {
  if (!run) { openSettings(); return; }
  openSheet(`
    <p class="sh-title">遠征の幕間</p>
    <p class="sh-sub">${floorName(run.floor)} ・ 隊 ${run.population()}人 ・ 加護 ${run.grace}</p>
    <div class="menu-list">
      <button class="btn ghost" id="m-resume">遠征に戻る</button>
      <button class="btn ghost" id="m-book">指揮官の手記</button>
      <button class="btn ghost" id="m-settings">設定</button>
      <button class="btn ghost" id="m-title">表紙へ(遠征は保存される)</button>
      <button class="btn danger" id="m-abandon">遠征を諦める</button>
    </div>`);
  $('m-resume').addEventListener('click', closeSheet);
  $('m-book').addEventListener('click', openBook);
  $('m-settings').addEventListener('click', openSettings);
  $('m-title').addEventListener('click', () => { if (busy) return; save(); run = null; showTitle(); });
  $('m-abandon').addEventListener('click', (e) => armed(e.currentTarget, '本当に諦める', () => {
    if (busy) return;
    run.phase = 'over';
    run.result = { win: false, reason: 'abandon', floor: run.floor };
    run.finish();
    showEnd();
  }));
}

function openSettings() {
  const s = store.settings;
  const seg = (name, opts, val) => `<span class="seg" data-name="${name}">${opts.map(([v, l]) => `<button data-v="${v}" class="${val === v ? 'on' : ''}">${l}</button>`).join('')}</span>`;
  openSheet(`
    <p class="sh-title">設定</p>
    <div class="setting"><label for="st-music">音楽と環境音</label><input id="st-music" type="range" min="0" max="1" step="0.05" value="${s.music}"></div>
    <div class="setting"><label for="st-sfx">効果音</label><input id="st-sfx" type="range" min="0" max="1" step="0.05" value="${s.sfx}"></div>
    <div class="setting"><label>演出の速さ</label>${seg('speed', [['normal', '標準'], ['fast', '速い']], s.speed)}<small>速いにすると、扉の出入りや予言の演出が短くなります。</small></div>
    <div class="setting"><label>動きを減らす</label>${seg('reduced', [['auto', '端末に従う'], ['on', '減らす'], ['off', '減らさない']], s.reduced)}<small>揺れ・閃光・粒の演出を止め、移動を一瞬にします。</small></div>
    <div class="sh-actions"><button class="btn ghost" id="sh-close">閉じる</button></div>`);
  $('st-music').addEventListener('input', (e) => { s.music = Number(e.target.value); applySettings(); save(); });
  $('st-sfx').addEventListener('input', (e) => { s.sfx = Number(e.target.value); applySettings(); save(); sfx.loot(); });
  $('sheet').querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
    const name = b.parentElement.dataset.name;
    s[name] = b.dataset.v;
    b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    applySettings();
    save();
    sfx.click();
  }));
  $('sh-close').addEventListener('click', closeSheet);
}

const BOOK_TABS = [['rules', '心得'], ['rooms', '見聞'], ['skills', '覚醒'], ['bosses', '主'], ['records', '記録']];
function openBook(tab = 'rules') {
  const p = store.profile;
  let body = '';
  if (tab === 'rules') {
    body = `
      <h4>隊列と扉</h4><p>物差しの真鍮の仕切りを左右に動かすと、並べた隊を扉ごとに分けられます。扉の下の銘板を押すと、全員をその扉へ送ります。並びは「強い順・名声順・傷の少ない順」から選べます。</p>
      <h4>見込み</h4><p>一度でも入ったことのある部屋は、いまの振り分けでの生還の見込みが銘板に刻まれます。「?」は、この層の様子がまだ分かっていないしるしです。</p>
      <h4>傷と死</h4><p>無傷なら、攻撃を受けても多くは傷で済みます。傷が重なるほど倒れやすくなります。</p>
      <h4>経験と装備</h4><p>同じ種類の危険を越えるほど、その危険に強くなります。拾った装備は野営で配ります。</p>
      <h4>加護</h4><p>仲間が倒れるたびに少しずつ授かります。部屋の結果を巻き戻したり、決戦で主の必殺を退けたりできます。</p>
      <h4>野営</h4><p>層を越えるたびに、一夜の過ごし方を一つ選びます。</p>
      <h4>予言と勇者</h4><p>主が膝をつくと、予言が勇者を一人選び、その者が止めの一撃を放ちます。名声が高い者ほど選ばれやすくなりますが、確かではありません。</p>
      <h4>迷宮の主</h4><p>碑文の間で、主の正体・弱点・必殺がわかります。</p>`;
  } else if (tab === 'rooms') {
    body = `<div class="grid">${ROOMS.map((r) => {
      const seen = p.seen?.[r.id];
      const known = p.known?.[r.id];
      return known ? `<div class="entry"><b>${r.glyph}</b>${esc(r.name)}<small>${seen?.n ? `のべ${seen.n}人 ・ 生還 ${pct(seen.s / seen.n)}` : '記録なし'}</small></div>` : '<div class="entry locked"><b>？</b>未踏の部屋</div>';
    }).join('')}</div>`;
  } else if (tab === 'skills') {
    body = `<div class="grid">${SKILL_ORDER.map((k) => (p.codex['s:' + k] ? `<div class="entry"><b>${SKILLS[k].glyph}</b>${esc(SKILLS[k].name)}</div>` : '<div class="entry locked"><b>？</b>まだ見ぬ覚醒</div>')).join('')}</div>`;
  } else if (tab === 'bosses') {
    body = `<div class="grid">${Object.entries(BOSSES).map(([k, b]) => (p.bosses?.[k] ? `<div class="entry"><b>${b.glyph}</b>${esc(b.name)}<small>討伐 ${p.slain?.[k] || 0}回</small></div>` : '<div class="entry locked"><b>？</b>まだ見ぬ主</div>')).join('')}</div>`;
  } else {
    const heroes = p.heroes || [];
    body = `
      <div class="stats"><div><b>${p.runs}</b>挑戦</div><div><b>${p.wins}</b>討伐</div><div><b>${p.fallen || 0}</b>倒れた仲間</div></div>
      <h4>歴代の勇者</h4>
      ${heroes.length ? `<ul class="story">${heroes.map((h) => `<li class="hi"><span class="at">${new Date(h.at).toLocaleDateString('ja-JP')}</span>${esc(h.name)}${h.skill ? `「${esc(SKILLS[h.skill].name)}」` : ''} ― ${esc(BOSSES[h.boss].name)}を討つ(生還${h.survivors}人)</li>`).join('')}</ul>` : '<p class="records">まだ誰も主を討っていない。</p>'}`;
  }
  openSheet(`
    <p class="sh-title">指揮官の手記</p>
    <div class="tabs" role="tablist">${BOOK_TABS.map(([k, n]) => `<button role="tab" data-t="${k}" class="${k === tab ? 'on' : ''}" aria-selected="${k === tab}">${n}</button>`).join('')}</div>
    <div class="book">${body}</div>
    <div class="sh-actions"><button class="btn ghost" id="sh-close">閉じる</button></div>`);
  $('sheet').querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { sfx.click(); openBook(b.dataset.t); }));
  $('sh-close').addEventListener('click', closeSheet);
}

function showEnd() {
  const r = run.result;
  const awakened = run.advs.filter((a) => a.skill);
  const hero = r.win ? run.advs.find((a) => a.id === r.hero) : run.advs.slice().sort((a, b) => b.fame - a.fame)[0];
  const b = BOSSES[run.bossId];
  const where = r.reason === 'abandon' ? `${floorName(r.floor)}で引き返した` : r.floor > FLOORS ? `${run.traits.name ? b.name : '迷宮の主'}の前に倒れた` : `${floorName(r.floor)}で全滅した`;
  if (r.win) { sfx.victory(); scene('camp'); } else { sfx.defeat(); scene('silent'); }
  const saved = run;
  run = null;
  save();
  openSheet(`
    <div class="chronicle">
      <p class="sh-sub" style="margin:0">${r.win ? `${esc(b.name)}を討った` : esc(where)}</p>
      <div class="verdict ${r.win ? 'win' : 'lose'}">${r.win ? '踏破' : r.reason === 'abandon' ? '撤退' : '全滅'}</div>
      ${hero ? `<div class="portrait"><span id="pt"></span><div><div class="nm">${esc(hero.name)}</div><div class="meta">${r.win ? '予言に選ばれた勇者' : '最も名高かった者'} ・ Lv${levelOf(hero)} ・ 名声${hero.fame}${hero.skill ? `<br>「${esc(SKILLS[hero.skill].name)}」` : ''}</div></div></div>
      <div class="tags" style="justify-content:center">${gearTags(hero)}</div>` : ''}
      <div class="stats">
        <div><b>${saved.population()}</b>生還</div>
        <div><b>${saved.dead.length}</b>倒れた</div>
        <div><b>${awakened.length}</b>覚醒</div>
      </div>
    </div>
    ${hero ? storyHTML(hero) : ''}
    ${awakened.length ? `<p class="records">覚醒した者 ― ${awakened.map((a) => `${esc(a.name)}「${esc(SKILLS[a.skill].name)}」${a.alive ? '' : '(戦死)'}`).join('、')}</p>` : ''}
    <div class="sh-actions">
      <button class="btn ghost" id="end-title">表紙へ</button>
      <button class="btn primary" id="end-again">再び挑む</button>
    </div>`, false);
  if (hero) $('pt').replaceWith(portrait(hero, 84));
  $('end-title').addEventListener('click', () => { closeSheet(); showTitle(); });
  $('end-again').addEventListener('click', () => { closeSheet(); run = new Run(store.profile, newRng()); save(); enterRun(true); });
}

// ---------- 初回の手引き ----------
const COACH = {
  ruler: ['ruler-wrap', '仕切りを左右に動かすと、強い順に並んだ隊を扉ごとに分けられます。', 'up'],
  plaque: ['plaques', '銘板を押すと、全員をその扉へ送れます。数字は向かう人数です。', 'up'],
  go: ['btn-go', '決めたら「進め」。扉の向こうへ向かいます。', 'down'],
  result: ['btn-alt', '加護を使えば、この結果を一度だけ巻き戻せます。人物を押すと、その者の戦記が読めます。', 'down'],
};
let coachQueue = [];
function maybeCoach(when) {
  if (!run || FAST) return;
  const done = store.coach;
  if (!when && run.phase === 'room' && !done.ruler) coachQueue = ['ruler', 'plaque', 'go'];
  else if (when === 'result' && !done.result && !$('btn-alt').hidden) coachQueue = ['result'];
  else return;
  showCoach();
}
function showCoach() {
  const key = coachQueue.shift();
  if (!key) { hideCoach(); return; }
  const [anchor, text, dir] = COACH[key];
  const el = $(anchor);
  const c = $('coach');
  if (!el || el.offsetParent === null) { store.coach[key] = true; save(); showCoach(); return; }
  c.innerHTML = `${esc(text)}<button class="coach-next">${coachQueue.length ? '次へ' : 'わかった'}</button>`;
  c.hidden = false;
  c.className = dir;
  const r = el.getBoundingClientRect();
  const cw = Math.min(280, window.innerWidth - 32);
  const left = Math.max(16, Math.min(window.innerWidth - cw - 16, r.left + r.width / 2 - cw / 2));
  c.style.width = `${cw}px`;
  c.style.left = `${left}px`;
  c.style.setProperty('--ax', `${Math.max(16, Math.min(cw - 24, r.left + r.width / 2 - left - 6))}px`);
  if (dir === 'up') { c.style.top = `${r.bottom + 12 + window.scrollY}px`; c.style.bottom = ''; c.style.position = 'absolute'; }
  else { c.style.top = `${r.top - 12 + window.scrollY}px`; c.style.position = 'absolute'; c.style.transform = 'translateY(-100%)'; }
  if (dir === 'up') c.style.transform = '';
  c.querySelector('button').addEventListener('click', () => { store.coach[key] = true; save(); sfx.click(); showCoach(); });
}
function hideCoach() { $('coach').hidden = true; coachQueue = []; }

// ---------- 開始 ----------
applySettings();
window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', applySettings);
showTitle();
// 最初の操作で音を鳴らせるようにする(ブラウザの決まり)
window.addEventListener('pointerdown', () => unlock(), { once: true });
