import { Run, newProfile, mulberry32, kanji, roomById, levelOf, atk, power, FLOORS, ROOMS_PER_FLOOR } from './dsim.js';
import { GEAR, SKILLS, BOSSES, MODS, CATS, ELEMS, SKILL_ORDER } from './ddata.js';
import { Crowd, Strip, PATH_COLORS } from '../../js/crowd.js';
import { sfx, unlock, setMuted } from '../../js/audio.js';

const KEY = 'hyakunin-dungeon.v1';
const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('ja-JP');
// ?fast で演出を速める(動作確認用)
const SPEED = new URLSearchParams(location.search).has('fast') ? 0.05 : 1;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * SPEED));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const newRng = () => mulberry32((Math.random() * 2 ** 32) >>> 0);
const pct = (p) => `${Math.round(p * 100)}%`;

const SORTS = { power: '戦力', fame: '名声', wounds: '傷' };
const ELEM_COLORS = { holy: '#fff2b0', fire: '#ff7a4a', ice: '#8fd3ff', thunder: '#c9a8ff' };
const PALE = [214, 203, 186];
const AMBER = [242, 166, 74];

let store = load();
let run = null;
let cuts = [];
let sortMode = 'power';
let busy = false;
let pending = null;
let lastReport = null;
let campSel = null; // 野営で選んでいる戦利品の番号、または 'honor'

// ---------- 冒険者の絵 ----------
function snapAdv(a) {
  return {
    lv: levelOf(a), wounds: a.wounds, skill: a.skill, fame: a.fame,
    weapon: a.gear.weapon, elem: a.gear.weapon ? GEAR[a.gear.weapon].elem : null, armor: !!a.gear.armor,
  };
}

function drawAdv(ctx, x, y, c, s, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const t = Math.min(1, (s.lv - 1) / 8);
  const col = PALE.map((v, i) => Math.round(v + (AMBER[i] - v) * t));
  const fill = `rgb(${col.join(',')})`;
  if (s.skill) {
    ctx.shadowColor = 'rgba(242,166,74,0.95)';
    ctx.shadowBlur = c * 0.5;
  }
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x - c * 0.1, y - c * 0.02);
  ctx.lineTo(x + c * 0.1, y - c * 0.02);
  ctx.lineTo(x + c * 0.21, y + c * 0.32);
  ctx.lineTo(x - c * 0.21, y + c * 0.32);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y - c * 0.17, c * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  if (s.armor) {
    ctx.strokeStyle = 'rgba(30,24,18,0.55)';
    ctx.lineWidth = Math.max(1, c * 0.05);
    ctx.beginPath();
    ctx.moveTo(x - c * 0.14, y + c * 0.06);
    ctx.lineTo(x + c * 0.14, y + c * 0.06);
    ctx.stroke();
  }
  if (s.weapon) {
    ctx.strokeStyle = s.elem ? ELEM_COLORS[s.elem] : '#cfd3d8';
    ctx.lineWidth = Math.max(1, c * 0.05);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + c * 0.2, y + c * 0.2);
    ctx.lineTo(x + c * 0.38, y - c * 0.22);
    ctx.stroke();
  }
  if (s.skill) {
    ctx.strokeStyle = '#f2a64a';
    ctx.lineWidth = Math.max(1, c * 0.04);
    ctx.beginPath();
    ctx.arc(x, y - c * 0.17, c * 0.19, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < s.wounds; i++) {
    ctx.fillStyle = '#cf5a4e';
    ctx.beginPath();
    ctx.arc(x - c * 0.3, y + c * (0.28 - i * 0.16), Math.max(1.5, c * 0.055), 0, Math.PI * 2);
    ctx.fill();
  }
  if (s.fame >= 40) {
    ctx.fillStyle = '#f7d27a';
    ctx.font = `${Math.max(7, c * 0.26)}px serif`;
    ctx.textAlign = 'center';
    ctx.fillText('★', x - c * 0.3, y - c * 0.2);
  }
  ctx.restore();
}

const crowd = new Crowd($('crowd'), (a) => { if (!busy) inspect(a); }, { snap: snapAdv, draw: drawAdv });
const strip = new Strip($('strip'), (c) => { cuts = c; updateAssign(); }, { value: power });

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && d.profile) return { muted: false, run: null, ...d };
  } catch { /* 保存できない環境でも遊べる */ }
  return { profile: newProfile(), run: null, muted: false };
}

function save() {
  try {
    store.run = run && run.phase !== 'over' ? run.toJSON() : null;
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch { /* noop */ }
}

function frame(now) {
  if (!$('floor').hidden) {
    crowd.draw(now);
    if (!$('strip-wrap').hidden) strip.draw(now);
  }
  requestAnimationFrame(frame);
}

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
  }, 2600);
}

async function curtain(html, cls = '', hold = 1100) {
  const c = $('curtain');
  $('curtain-text').innerHTML = html;
  c.className = cls;
  c.hidden = false;
  await sleep(hold);
  c.classList.add('fade');
  await sleep(900);
  c.hidden = true;
  c.className = '';
}

function ticker(text, level = 1) {
  $('ticker').innerHTML = text ? `<span class="lv${level}">${esc(text)}</span>` : '';
}

// ---------- 表紙 ----------
function showTitle() {
  $('hud').hidden = true;
  $('floor').hidden = true;
  $('title').hidden = false;
  closeSheet();
  const hasRun = !!store.run;
  $('btn-continue').hidden = !hasRun;
  const nb = $('btn-new');
  nb.textContent = hasRun ? 'はじめから' : '挑む';
  nb.className = hasRun ? 'btn ghost' : 'btn primary';
  const p = store.profile;
  $('title-records').textContent = p.runs ? `討伐 ${kanji(p.wins)} ・ 挑戦 ${kanji(p.runs)}` : '';
  const seen = Object.keys(p.codex).length + Object.keys(p.bosses).length;
  $('title-codex').innerHTML = seen
    ? Object.entries(BOSSES).map(([k, b]) => `<span class="${p.bosses[k] ? 'got curse' : ''}" title="${p.bosses[k] ? esc(b.name) : ''}">${p.bosses[k] ? b.glyph : '・'}</span>`).join('')
      + SKILL_ORDER.map((k) => `<span class="${p.codex['s:' + k] ? 'got treasure' : ''}" title="${p.codex['s:' + k] ? esc(SKILLS[k].name) : ''}">${p.codex['s:' + k] ? SKILLS[k].glyph : '・'}</span>`).join('')
    : '';
  const cv = $('title-canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  cv.width = 120 * dpr;
  cv.height = 120 * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawAdv(ctx, 56, 66, 104, { lv: 4, wounds: 0, skill: null, fame: 0, weapon: 'steel', elem: null, armor: true });
}

$('btn-continue').addEventListener('click', () => {
  unlock();
  run = new Run(store.profile, newRng(), store.run);
  enter(false);
});

$('btn-new').addEventListener('click', (e) => {
  unlock();
  const start = () => {
    run = new Run(store.profile, newRng());
    save();
    enter(true);
  };
  if (store.run) armed(e.currentTarget, '本当に？', start);
  else start();
});

$('mute').addEventListener('click', () => {
  store.muted = !store.muted;
  setMuted(store.muted);
  $('mute').classList.toggle('off', store.muted);
  save();
});

// ---------- 迷宮 ----------
const floorName = (f) => (f > FLOORS ? '最深部' : `地下${kanji(f)}層`);
const roomLabel = (r) => `${kanji(r + 1)}ノ間`;

function displayList() { return run.sorted(sortMode); }

async function enter(fresh) {
  busy = true;
  $('title').hidden = true;
  closeSheet();
  $('hud').hidden = false;
  $('floor').hidden = false;
  $('mute').classList.toggle('off', store.muted);
  setMuted(store.muted);
  cuts = [];
  pending = null;
  ticker('');
  crowd.assign = new Map();
  crowd.highlight = null;
  crowd.dim = 0;
  crowd.sprites.clear();
  render();
  const c = curtain(fresh ? '百人の迷宮<small>百人の冒険者が、迷宮の入口に立った</small>' : `${floorName(run.floor)}<small>遠征の続き</small>`, '', 1000);
  await sleep(1300);
  crowd.layout(displayList(), { burst: true });
  sfx.split();
  await c;
  busy = false;
  lock(false);
  if (run.phase === 'camp') openCamp();
}

function hud() {
  $('hud-floor').textContent = floorName(run.floor);
  $('hud-room').textContent = run.phase === 'room' ? `${roomLabel(run.roomIdx)} ／ ${kanji(ROOMS_PER_FLOOR)}` : run.phase === 'camp' ? '野営' : run.phase === 'boss' ? '決戦' : '';
  $('hud-pop').textContent = run.population();
  $('hud-grace').textContent = run.grace ? `✦${run.grace}` : '—';
}

function lore() {
  const b = BOSSES[run.bossId];
  const t = run.traits;
  const name = t.name ? b.name : '？？？';
  const weak = t.weak ? ELEMS[b.weak] : '？';
  const sp = t.special ? b.specialName : '？';
  $('lore').innerHTML = `主 <b>${esc(name)}</b> ・ 弱点 <b>${weak}</b> ・ 必殺 <b>${esc(sp)}</b>`;
  const m = run.mods[run.floor];
  $('mod-text').textContent = run.phase === 'room' && run.floorKnown() ? (m ? `${MODS[m].name}:${MODS[m].text}` : 'この層は平穏だ。') : '';
}

function render() {
  hud();
  lore();
  $('btn-alt').hidden = true;
  $('btn-alt').className = 'btn ghost';
  if (run.phase === 'room') renderRoom();
  else if (run.phase === 'camp') { renderRoomShell(); openCamp(); }
  else if (run.phase === 'boss') renderBoss();
  else if (run.phase === 'over') showEnd();
}

function renderRoomShell() {
  $('paths').hidden = false;
  $('boss').hidden = true;
  $('strip-wrap').hidden = true;
  $('paths').innerHTML = '';
  $('btn-go').hidden = true;
}

function evenCuts(k) { return Array.from({ length: k - 1 }, (_, i) => (i + 1) / k); }
function allTo(k, i) { return Array.from({ length: k - 1 }, (_, j) => (j < i ? 0 : 1)); }

function renderRoom() {
  $('paths').hidden = false;
  $('boss').hidden = true;
  $('strip-wrap').hidden = false;
  $('btn-go').hidden = false;
  $('btn-go').textContent = '進む';
  const k = run.stage.rooms.length;
  if (cuts.length !== k - 1) cuts = evenCuts(k);
  $('paths').style.setProperty('--k', k);
  $('paths').innerHTML = run.stage.rooms.map((id, i) => {
    const r = roomById(id);
    return `
      <button class="path" data-i="${i}" style="--pc:${PATH_COLORS[i]}">
        <div class="glyph">${r.glyph}</div>
        <div class="name">${esc(r.name)}</div>
        <div class="text">${esc(r.text)}</div>
        <div class="foot"><span class="count"></span></div>
        <div class="est"></div>
      </button>`;
  }).join('');
  $('paths').querySelectorAll('.path').forEach((el) => {
    el.addEventListener('click', () => {
      if (busy) return;
      cuts = allTo(k, Number(el.dataset.i));
      updateAssign();
    });
  });
  updateAssign();
  crowd.layout(displayList());
}

function updateAssign() {
  if (!run || run.phase !== 'room' || !run.stage) return;
  const groups = run.groupsFor(cuts, sortMode);
  const m = new Map();
  groups.forEach((g, i) => g.forEach((a) => m.set(a.id, i)));
  crowd.assign = m;
  strip.set(run.sorted(sortMode), cuts);
  $('paths').querySelectorAll('.path').forEach((el, i) => {
    const g = groups[i] || [];
    el.querySelector('.count').innerHTML = `${g.length}<small>人</small>`;
    el.classList.toggle('empty', !g.length);
    const est = el.querySelector('.est');
    const e = run.estimate(run.stage.rooms[i], g);
    if (!e.known) { est.className = 'est unknown'; est.textContent = '見込み ？'; return; }
    if (e.empty) { est.className = 'est'; est.textContent = ''; return; }
    const q = e.sure ? '' : '?';
    est.className = `est${e.survive < 0.8 ? ' risky' : ''}`;
    const n = (x) => (x > 0 && x < 1 ? '1未満' : `約${Math.round(x)}`);
    est.innerHTML = `生還 <b>${pct(e.survive)}${q}</b><br>倒れる ${n(e.deaths)}人 ・ 傷 ${n(e.wounds)}人`;
  });
}

function lock(on) {
  $('btn-go').disabled = on;
  $('btn-alt').disabled = on;
  $('sort').disabled = on;
  strip.locked = on;
  $('paths').style.pointerEvents = on ? 'none' : '';
  $('boss').querySelectorAll('button').forEach((b) => { b.disabled = on || b.dataset.off === '1'; });
}

$('sort').addEventListener('click', () => {
  if (busy) return;
  const keys = Object.keys(SORTS);
  sortMode = keys[(keys.indexOf(sortMode) + 1) % keys.length];
  $('sort').textContent = `並び：${SORTS[sortMode]}`;
  updateAssign();
  crowd.layout(displayList());
});

$('btn-go').addEventListener('click', go);
$('btn-alt').addEventListener('click', alt);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !busy && !$('floor').hidden && $('overlay').hidden && !$('btn-go').hidden) {
    e.preventDefault();
    go();
  }
});

function applyFx(id, events) {
  id = Number(id);
  const floats = [];
  for (const e of events) {
    switch (e.t) {
      case 'born': {
        const a = run.advs.find((x) => x.id === id);
        if (a) { crowd.born(a.id, a, null); sfx.born(); }
        break;
      }
      case 'die': crowd.die(id); sfx.puff(); break;
      case 'wound': floats.push(['傷', '#e58a7a', false]); break;
      case 'heal': floats.push(['癒', '#7cbf86', false]); break;
      case 'lvup': floats.push([`Lv${e.lv}`, '#f2a64a', false]); sfx.coin(); break;
      case 'loot': floats.push([GEAR[e.k].glyph, '#efe3cc', GEAR[e.k].tier >= 3]); sfx.item(); break;
      case 'lose': floats.push([`−${GEAR[e.k].glyph}`, '#a8987f', false]); break;
      case 'awaken': floats.push([SKILLS[e.k].name, '#f7d27a', true]); crowd.ring(id, 'rgba(242,166,74,0.95)'); sfx.rare(); break;
      default: break;
    }
  }
  floats.slice(0, 3).forEach(([text, color, big], i) => crowd.float(id, text, color, big, i));
  crowd.refresh(id);
}

async function playFx(fx, notes) {
  const ids = Object.keys(fx);
  const span = Math.min(1300, 300 + ids.length * 12);
  for (const id of ids) setTimeout(() => applyFx(id, fx[id]), (Math.random() * span + (fx[id].some((e) => e.t === 'born') ? 250 : 0)) * SPEED);
  const top = notes.slice().sort((a, b) => b.level - a.level).slice(0, 4);
  await sleep(350);
  for (const n of top) {
    ticker(n.text, n.level);
    if (n.id != null) setTimeout(() => crowd.ring(n.id, 'rgba(242,166,74,0.95)'), 200);
    await sleep(n.level >= 3 ? 1500 : 1000);
  }
  await sleep(Math.max(0, span + 500 - top.length * 1000));
}

function resultLines(sum) {
  if (!sum.sent) return [['quiet', '誰も行かなかった']];
  const L = [];
  for (const [cause, n] of Object.entries(sum.died)) L.push(['bad', `${cause} ${n}人`]);
  if (sum.wounded) L.push(['bad', `傷を負った ${sum.wounded}人`]);
  for (const id of sum.awakened) {
    const a = run.advs.find((x) => x.id === id);
    if (a) L.push(['note', `#${id} が「${SKILLS[a.skill].name}」に覚醒`]);
  }
  for (const t of sum.revealed) L.push(['note', t]);
  if (sum.lvup) L.push(['gold', `腕を上げた ${sum.lvup}人`]);
  if (sum.loot.length) L.push(['gold', `見つけた:${sum.loot.map((k) => GEAR[k].name).join('、')}`]);
  if (sum.recruits) L.push(['good', `${sum.recruits}人が隊に加わった`]);
  if (sum.healed) L.push(['good', `${sum.healed}人の傷が癒えた`]);
  if (sum.grace) L.push(['gold', '加護を得た']);
  if (sum.quiet && L.length === 0) L.push(['quiet', `何も起きなかった ${sum.quiet}人`]);
  else if (sum.quiet) L.push(['quiet', `ほかの ${sum.quiet}人は何事もなかった`]);
  if (!L.length) L.push(['quiet', '全員が無事に通り抜けた']);
  return L;
}

function showResults(rep) {
  $('paths').innerHTML = rep.rooms.map((id, i) => {
    const r = roomById(id);
    const sum = rep.summaries[i];
    return `
      <div class="path result${sum.sent ? '' : ' empty'}" style="--pc:${PATH_COLORS[i]}">
        <div class="res-head"><span class="glyph">${r.glyph}</span><span class="name">${esc(r.name)}</span></div>
        <div class="res-count">${sum.sent}<small>人</small> → <b>${sum.alive}</b><small>人</small></div>
        <ul class="res-lines">${resultLines(sum).map(([c, t]) => `<li class="${c}">${esc(t)}</li>`).join('')}</ul>
      </div>`;
  }).join('');
  $('strip-wrap').hidden = true;
  $('hud-pop').textContent = run.population();
  $('hud-grace').textContent = run.grace ? `✦${run.grace}` : '—';
}

async function go() {
  if (busy || !run) return;
  unlock();
  if (pending) {
    const p = pending;
    pending = null;
    crowd.assign = new Map();
    $('btn-alt').hidden = true;
    if (p === 'end') { showEnd(); return; }
    if (p === 'prophecy') { prophecyFlow(); return; }
    render();
    return;
  }
  if (run.phase === 'boss') { if (run.boss.ready) prophecyFlow(); return; }
  if (run.phase !== 'room') return;
  busy = true;
  lock(true);
  sfx.go();
  const keep = crowd.assign;
  const rep = run.resolve(cuts, sortMode);
  lastReport = rep;
  save();
  crowd.assign = keep;
  $('paths').querySelectorAll('.path').forEach((el) => el.classList.add('fading'));
  await playFx(rep.fx, rep.notes);
  showResults(rep);
  const deaths = rep.summaries.reduce((s, x) => s + Object.values(x.died).reduce((a, b) => a + b, 0), 0);
  if (!rep.notes.some((n) => n.level >= 3)) ticker(deaths ? `${deaths}人が倒れた` : '誰も倒れなかった', 1);
  pending = run.phase === 'over' ? 'end' : 'next';
  $('btn-go').textContent = pending === 'end' ? '……' : run.phase === 'camp' ? '野営する' : '次へ';
  if (run.grace >= 1) {
    $('btn-alt').hidden = false;
    $('btn-alt').className = 'btn ghost grace';
    $('btn-alt').textContent = `巻き戻す ✦${run.grace}`;
  }
  busy = false;
  lock(false);
  $('sort').disabled = true;
  strip.locked = true;
}

function alt() {
  if (busy || !run) return;
  if (pending && lastReport && run.grace >= 1) {
    armed($('btn-alt'), '加護を使う？', () => {
      run.rewind(lastReport);
      lastReport = null;
      pending = null;
      save();
      sfx.dawn();
      crowd.sprites.clear();
      crowd.assign = new Map();
      $('btn-alt').hidden = true;
      $('sort').disabled = false;
      strip.locked = false;
      render();
      crowd.layout(displayList(), { instant: true });
      ticker('加護が時を巻き戻した', 2);
    });
  }
}

// ---------- 野営 ----------
function openCamp() {
  campSel = null;
  renderCamp([]);
}

function rosterHTML(mode) {
  const odds = new Map(run.prophecyOdds().map((o) => [o.id, o.p]));
  const list = run.living().slice().sort((a, b) => (mode === 'honor' ? b.fame - a.fame : power(b) - power(a)) || a.id - b.id).slice(0, 14);
  return `<div class="roster">${list.map((a) => `
    <button data-id="${a.id}">
      <span class="rid">#${a.id}</span>
      <span>Lv${levelOf(a)} ・ 戦力${power(a)} ・ 名声${a.fame}${a.wounds ? ` ・ 傷${a.wounds}` : ''}${a.skill ? ` ・ ${SKILLS[a.skill].name}` : ''}
        <br><span class="rgear">${['weapon', 'armor', 'charm'].map((s) => (a.gear[s] ? GEAR[a.gear[s]].name : '')).filter(Boolean).join(' / ') || '装備なし'}</span></span>
      <span class="rodds">${pct(odds.get(a.id) || 0)}</span>
    </button>`).join('')}</div>`;
}

function renderCamp(msgs) {
  const living = run.living();
  const wounded = living.filter((a) => a.wounds).length;
  const odds = run.prophecyOdds().slice(0, 3);
  const last = run.floor >= FLOORS;
  const stash = run.stash.map((k, i) => [k, i]).sort((x, y) => GEAR[y[0]].tier - GEAR[x[0]].tier);
  const acts = [['rest', '休', '休息'], ['train', '鍛', '鍛錬'], ['pray', '祈', '祈り'], ['honor', '讃', '称える']];
  openSheet(`
    <div class="sheet-head"><span class="sheet-id">野営</span><span class="sheet-sub">${floorName(run.floor)} ・ 隊 ${living.length}人 ・ 傷 ${wounded}人 ・ 加護 ${run.grace ? `✦${run.grace}` : 'なし'}</span></div>
    <div class="camp-sec"><h3>予言の見込み</h3>
      <div class="odds">${odds.map((o) => { const a = run.advs.find((x) => x.id === o.id); return `<span>#${o.id} <b>${pct(o.p)}</b>(一撃 ${pct(run.strikeChance(a))})</span>`; }).join('')}</div>
    </div>
    <div class="camp-sec"><h3>戦利品 ${run.stash.length ? `(${run.stash.length})` : ''}</h3>
      <div class="stash">${stash.map(([k, i]) => `<button data-i="${i}" class="${campSel === i ? 'sel' : ''}"><b>${GEAR[k].glyph}</b>${esc(GEAR[k].name)}</button>`).join('') || '<span class="muted">なし</span>'}</div>
      ${run.stash.length ? '<div class="sheet-actions" style="margin-top:8px"><button class="btn ghost" id="auto-equip">自動で配る</button></div>' : ''}
      ${typeof campSel === 'number' ? `<p class="muted">${esc(GEAR[run.stash[campSel]].name)}を誰に託す？</p>${rosterHTML('power')}` : ''}
    </div>
    <div class="camp-sec"><h3>今夜の過ごし方</h3>
      <div class="camp-actions">${acts.map(([k, g, n]) => `<button data-act="${k}" class="${campSel === k ? 'on' : ''}" ${run.camped ? 'disabled' : ''}><b>${g}</b>${n}</button>`).join('')}</div>
      ${campSel === 'honor' && !run.camped ? `<p class="muted">誰を称える？</p>${rosterHTML('honor')}` : ''}
    </div>
    ${msgs.length ? `<div class="ghost-line">${msgs.map(esc).join('<br>')}</div>` : ''}
    <div class="sheet-actions"><button class="btn primary" id="camp-next" ${run.camped ? '' : 'disabled'}>${last ? '主のもとへ' : '次の層へ'}</button></div>
  `);
  const sheet = $('sheet');
  sheet.querySelectorAll('.stash button').forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.i);
    campSel = campSel === i ? null : i;
    renderCamp(msgs);
  }));
  $('auto-equip')?.addEventListener('click', () => {
    run.autoEquip();
    campSel = null;
    for (const a of run.living()) crowd.refresh(a.id);
    sfx.item();
    save();
    renderCamp(['装備を配り直した']);
  });
  sheet.querySelectorAll('.camp-actions button').forEach((b) => b.addEventListener('click', () => {
    const act = b.dataset.act;
    if (act === 'honor') { campSel = campSel === 'honor' ? null : 'honor'; renderCamp(msgs); return; }
    const out = run.camp(act);
    afterCampAction(out);
  }));
  sheet.querySelectorAll('.roster button').forEach((b) => b.addEventListener('click', () => {
    const id = Number(b.dataset.id);
    if (campSel === 'honor') {
      afterCampAction(run.camp('honor', id));
      crowd.ring(id, 'rgba(242,166,74,0.95)');
      return;
    }
    if (typeof campSel === 'number') {
      const name = GEAR[run.stash[campSel]].name;
      run.equip(campSel, id);
      campSel = null;
      crowd.refresh(id);
      sfx.item();
      save();
      renderCamp([`#${id} に${name}を託した`]);
    }
  }));
  $('camp-next').addEventListener('click', nextFloor);
}

function afterCampAction(out) {
  campSel = null;
  sfx.dawn();
  for (const a of run.living()) crowd.refresh(a.id);
  save();
  hud();
  renderCamp(out);
}

async function nextFloor() {
  closeSheet();
  busy = true;
  lock(true);
  run.nextFloor();
  save();
  cuts = [];
  ticker('');
  if (run.phase === 'boss') {
    sfx.gong();
    const b = BOSSES[run.bossId];
    await curtain(`${run.traits.name ? b.name : '迷宮の主'}<small>最深部</small>`, 'nightmare', 1300);
  } else {
    await curtain(`${floorName(run.floor)}<small>${run.floor === FLOORS ? '主の気配がする' : ''}</small>`, '', 700);
  }
  busy = false;
  render();
  lock(false);
}

// ---------- 決戦 ----------
function renderBoss(tell) {
  $('paths').hidden = true;
  $('strip-wrap').hidden = true;
  $('boss').hidden = false;
  const b = BOSSES[run.bossId];
  const bs = run.boss;
  const t = run.traits;
  const odds = run.prophecyOdds().slice(0, 3);
  const ready = bs.ready;
  $('boss').innerHTML = `
    <div class="boss-head">
      <div class="boss-glyph">${t.name ? b.glyph : '？'}</div>
      <div>
        <div class="boss-name">${esc(t.name ? b.name : '迷宮の主')}</div>
        <div class="boss-traits">弱点 ${t.weak ? ELEMS[b.weak] : '？'} ・ 必殺 ${esc(t.special ? b.specialName : '？')} ${bs.round ? ` ・ ${kanji(bs.round)}合目` : ''}</div>
      </div>
    </div>
    <div class="hpbar${ready ? ' ready' : ''}"><div style="width:${(bs.hp / bs.max) * 100}%"></div></div>
    <div class="tell">${esc(tell || (ready ? '主が膝をついた。今なら届く。' : bs.charge ? b.tell : ''))}</div>
    <div class="odds">予言の見込み ${odds.map((o) => `<span>#${o.id} <b>${pct(o.p)}</b></span>`).join('')}</div>
    ${ready ? '' : `<div class="stances">
      <button data-s="attack"><b>攻</b>攻める</button>
      <button data-s="guard"><b>守</b>守る</button>
      <button data-s="grace" class="s-grace" data-off="${run.grace < 1 ? 1 : 0}"><b>護</b>加護 ✦${run.grace}</button>
    </div>`}`;
  $('boss').querySelectorAll('.stances button').forEach((el) => {
    el.disabled = el.dataset.off === '1';
    el.addEventListener('click', () => bossTurn(el.dataset.s));
  });
  $('btn-go').hidden = !ready;
  $('btn-go').textContent = '予言を聞く';
  hud();
  crowd.layout(displayList());
}

async function bossTurn(stance) {
  if (busy) return;
  unlock();
  busy = true;
  lock(true);
  sfx.go();
  const rep = run.bossRound(stance);
  save();
  await playFx(rep.fx, rep.notes);
  const deaths = Object.values(rep.deaths).reduce((a, b) => a + b, 0);
  ticker(`${fmt(rep.dmg)}の傷を与えた。${deaths ? `${deaths}人が倒れた` : '誰も倒れなかった'}`, 2);
  busy = false;
  if (run.phase === 'over') { await sleep(800); showEnd(); return; }
  renderBoss();
  lock(false);
}

function weightedPick(odds) {
  let x = Math.random();
  for (const o of odds) { x -= o.p; if (x < 0) return o.id; }
  return odds[odds.length - 1].id;
}

async function prophecyFlow() {
  if (busy) return;
  busy = true;
  lock(true);
  const odds = run.prophecyOdds();
  const res = run.prophecy();
  save();
  ticker('予言が勇者を選ぶ……', 2);
  const steps = [];
  for (let d = 50; d < 450; d *= 1.12) steps.push(d);
  for (let i = 0; i < steps.length; i++) {
    crowd.highlight = i === steps.length - 1 ? res.hero : weightedPick(odds);
    sfx.tick(1 + (i % 4) * 0.08);
    await sleep(steps[i]);
  }
  crowd.highlight = res.hero;
  sfx.gong();
  const hero = run.advs.find((a) => a.id === res.hero);
  ticker(`予言は #${res.hero} を選んだ(一撃の見込み ${pct(res.chance)})`, 3);
  await sleep(1800);
  if (res.success) {
    sfx.rare();
    ticker(`#${res.hero} の一撃が届いた`, 3);
    crowd.float(res.hero, '討', '#f7d27a', true);
    await sleep(1600);
    crowd.highlight = null;
    showEnd();
    return;
  }
  sfx.nightmare();
  ticker(res.fell ? `一撃は届かず、#${res.hero} は返り討ちにあった` : `一撃は届かなかった。#${res.hero} は深手を負った`, 2);
  if (res.fell) crowd.die(res.hero);
  else crowd.refresh(hero.id);
  await sleep(1400);
  crowd.highlight = null;
  busy = false;
  if (run.phase === 'over') { showEnd(); return; }
  renderBoss('主が怒りに燃えている……');
  lock(false);
}

// ---------- 紙 ----------
function openSheet(html, dismissable = false) {
  $('sheet').innerHTML = html;
  $('overlay').hidden = false;
  $('overlay').onclick = dismissable ? (e) => { if (e.target === $('overlay')) closeSheet(); } : null;
}

function closeSheet() {
  $('overlay').hidden = true;
  $('sheet').innerHTML = '';
  crowd.selected = null;
}

function atLabel(e) {
  if (e.f > FLOORS) return '決戦';
  return `${kanji(e.f)}層${e.r >= ROOMS_PER_FLOOR ? '野営' : `${kanji(e.r + 1)}ノ間`}`;
}

function storyHTML(a) {
  return `<ul class="story">${a.log.map((e, i) => `<li class="${!a.alive && i === a.log.length - 1 ? 'end' : ''}"><span class="at">${atLabel(e)}</span>${esc(e.text)}</li>`).join('') || '<li><span class="at">入口</span>まだ何も起きていない</li>'}</ul>`;
}

function gearTags(a) {
  return ['weapon', 'armor', 'charm'].filter((s) => a.gear[s]).map((s) => `<span class="gearchip"><b>${GEAR[a.gear[s]].glyph}</b>${esc(GEAR[a.gear[s]].name)}</span>`).join('');
}

function inspect(a) {
  if (!run) return;
  crowd.selected = a.id;
  const xp = Object.entries(CATS).map(([k, n]) => `${n}${a.xp[k] || 0}`).join(' ');
  openSheet(`
    <div class="sheet-head">
      <span class="sheet-id ${a.skill ? 'gold' : ''}">#${a.id}</span>
      <span class="sheet-sub">Lv${levelOf(a)} ・ 攻${atk(a)} ・ 戦力${power(a)} ・ 名声${a.fame}${a.wounds ? ` ・ 傷${a.wounds}` : ''}</span>
    </div>
    <div class="sheet-row">${a.skill ? `<span class="tag treasure"><b>${SKILLS[a.skill].glyph}</b>${esc(SKILLS[a.skill].name)}</span>` : ''}${gearTags(a)}</div>
    <div class="muted">経験 ${xp}</div>
    ${storyHTML(a)}
    <div class="sheet-actions"><button class="btn ghost" id="sheet-close">閉じる</button></div>
  `, true);
  $('sheet-close').addEventListener('click', closeSheet);
}

function showEnd() {
  const r = run.result;
  const p = store.profile;
  const awakened = run.advs.filter((a) => a.skill);
  const fallenHero = run.dead.slice().sort((a, b) => b.fame - a.fame)[0];
  const hero = r.win ? run.advs.find((a) => a.id === r.hero) : fallenHero;
  const b = BOSSES[run.bossId];
  const head = r.win
    ? `<p class="center muted">${esc(b.name)}を討った</p><div class="rank">踏破</div>`
    : `<p class="center muted">${r.floor > FLOORS ? `${esc(run.traits.name ? b.name : '迷宮の主')}の前に` : `${floorName(r.floor)}で`}</p><div class="rank" style="color:var(--blood)">全滅</div>`;
  const stats = [
    `生還 ${run.population()}人`,
    `倒れた ${run.dead.length}人`,
    `覚醒 ${awakened.length}人`,
    r.win ? `予言 ${kanji(r.strikes)}度目` : '',
  ].filter(Boolean).join(' ・ ');
  const saved = run;
  run = null;
  save();
  $('floor').hidden = true;
  $('hud').hidden = true;
  openSheet(`
    ${head}
    <p class="center muted">${stats}</p>
    ${hero ? `
      <div class="sheet-head" style="margin-top:14px"><span class="sheet-id gold">#${hero.id}</span>
      <span class="sheet-sub">${r.win ? '予言に選ばれた勇者' : '最も名高かった者'} ・ Lv${levelOf(hero)} ・ 名声${hero.fame}${hero.skill ? ` ・ ${esc(SKILLS[hero.skill].name)}` : ''}</span></div>
      <div class="sheet-row">${gearTags(hero)}</div>
      ${storyHTML(hero)}` : ''}
    ${awakened.length ? `<div class="muted">覚醒した者:${awakened.map((a) => `#${a.id}「${esc(SKILLS[a.skill].name)}」${a.alive ? '' : '(戦死)'}`).join('、')}</div>` : ''}
    <p class="center muted" style="margin-top:12px">討伐 ${kanji(p.wins)} ・ 挑戦 ${kanji(p.runs)}</p>
    <div class="sheet-actions">
      <button class="btn ghost" id="end-title">表紙</button>
      <button class="btn primary" id="end-again">再び挑む</button>
    </div>
  `);
  void saved;
  $('end-title').addEventListener('click', () => { closeSheet(); showTitle(); });
  $('end-again').addEventListener('click', () => {
    run = new Run(store.profile, newRng());
    save();
    enter(true);
  });
}

setMuted(store.muted);
showTitle();
requestAnimationFrame(frame);
