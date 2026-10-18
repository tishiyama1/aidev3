import { Run, newProfile, mulberry32, kanji, worth, pathById, NIGHTS } from './sim.js';
import { ITEMS, ITEM_ORDER, MODS, FORMS } from './data.js';
import { Crowd, Strip, PATH_COLORS, drawFigure } from './crowd.js';
import { sfx, unlock, setMuted } from './audio.js';

const KEY = 'hyakunin-no-watashi.v1';
const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('ja-JP');
// ?fast で演出を速める(動作確認用)
const SPEED = new URLSearchParams(location.search).has('fast') ? 0.05 : 1;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * SPEED));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const newRng = () => mulberry32((Math.random() * 2 ** 32) >>> 0);

const SORTS = { gold: '金', items: '持ち物', form: '姿' };
const RANKS = [
  [3000, '夢見る人'],
  [6000, '夢の旅人'],
  [10000, '夢の商人'],
  [16000, '夢の長者'],
  [Infinity, '夢の王'],
];

let store = load();
let run = null;
let cuts = [];
let sortMode = 'gold';
let busy = false;

const crowd = new Crowd($('crowd'), (s) => { if (!busy) inspect(s); });
const strip = new Strip($('strip'), (c) => { cuts = c; updateAssign(); });

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && d.profile) return { muted: false, run: null, ...d };
  } catch { /* 保存できない環境でも遊べる */ }
  return { profile: newProfile(), run: null, muted: false };
}

function save() {
  try {
    store.run = run && !run.isOver() ? run.toJSON() : null;
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch { /* noop */ }
}

// ---------- 描画ループ ----------
function frame(now) {
  if (!$('night').hidden) {
    crowd.draw(now);
    strip.draw(now);
  }
  requestAnimationFrame(frame);
}

// ---------- 表紙 ----------
function codexHTML() {
  return ITEM_ORDER.map((k) => {
    const it = ITEMS[k];
    const got = store.profile.codex[k];
    return `<span class="${it.kind}${got ? ' got' : ''}" title="${got ? esc(it.name) : ''}">${got ? it.glyph : '・'}</span>`;
  }).join('');
}

function showTitle() {
  $('hud').hidden = true;
  $('night').hidden = true;
  $('title').hidden = false;
  const hasRun = !!store.run;
  $('btn-continue').hidden = !hasRun;
  const nb = $('btn-new');
  nb.textContent = hasRun ? 'はじめから' : '眠る';
  nb.className = hasRun ? 'btn ghost' : 'btn primary';
  const p = store.profile;
  $('title-records').textContent = p.runs ? `最高 ${fmt(p.best)}文 ・ 十夜を${kanji(p.runs)}度` : '';
  $('title-codex').innerHTML = Object.keys(p.codex).length ? codexHTML() : '';
  const cv = $('title-canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  cv.width = 120 * dpr;
  cv.height = 120 * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawFigure(ctx, 60, 66, 104, { w: 40, form: 'human' });
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

$('btn-continue').addEventListener('click', () => {
  unlock();
  run = new Run(store.profile, newRng(), store.run);
  enterNight();
});

$('btn-new').addEventListener('click', (e) => {
  unlock();
  const start = () => {
    run = new Run(store.profile, newRng());
    save();
    enterNight();
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

// ---------- 夜 ----------
function displayList() {
  const stones = run.selves.filter((s) => s.alive && s.form === 'stone').sort((a, b) => worth(b) - worth(a));
  return run.sorted(sortMode).concat(stones);
}

function evenCuts(k) { return Array.from({ length: k - 1 }, (_, i) => (i + 1) / k); }
function allTo(k, i) { return Array.from({ length: k - 1 }, (_, j) => (j < i ? 0 : 1)); }

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

async function enterNight() {
  busy = true;
  $('title').hidden = true;
  closeSheet();
  if (!run.inNight) {
    run.startNight();
    save();
  }
  $('hud').hidden = false;
  $('night').hidden = false;
  $('mute').classList.toggle('off', store.muted);
  setMuted(store.muted);
  cuts = [];
  ticker('');
  crowd.assign = new Map();
  crowd.highlight = null;
  crowd.dim = 0;
  crowd.sprites.clear();
  renderStage();
  lock(true);
  const night = curtain(`第${kanji(run.night)}夜<small>${run.night === NIGHTS ? '最後の夜' : `残り${kanji(NIGHTS - run.night + 1)}夜`}</small>`, '', 1000);
  await sleep(1300);
  crowd.layout(displayList(), { burst: true });
  sfx.split();
  await night;
  busy = false;
  lock(false);
  if (!run.population()) wakeFlow({});
}

function hud() {
  $('hud-night').textContent = `第${kanji(run.night)}夜`;
  $('hud-stage').textContent = !run.inNight ? '' : run.atDawn() ? '夜明け' : `${run.stageLabel()} ／ ${kanji(run.stageCount)}`;
  $('hud-alive').textContent = run.population();
  $('hud-savings').textContent = `${fmt(run.savings)}文`;
}

function seenText(id) {
  const st = store.profile.seen[id];
  if (!st || !st.n) return '';
  const sv = Math.round((st.s / st.n) * 100);
  const g = Math.round(st.g / st.n);
  return `帰還 ${sv}% ・ ${g >= 0 ? '+' : '−'}${fmt(Math.abs(g))}文`;
}

function renderStage() {
  hud();
  const mod = run.stage?.mod ? MODS[run.stage.mod] : null;
  $('mod-text').textContent = mod ? mod.text : '';
  const paths = $('paths');
  if (run.atDawn()) {
    $('ticker').innerHTML = '';
    paths.style.setProperty('--k', 1);
    paths.innerHTML = `
      <button class="path gate" data-i="0">
        <div class="glyph">門</div>
        <div class="name">夜明けの門</div>
        <div class="text">門の向こうが白みはじめている。</div>
        <div class="foot"><span class="count">${run.population()}<small>人</small></span></div>
      </button>`;
    paths.querySelector('.path').addEventListener('click', go);
    $('btn-go').textContent = 'くぐる';
    $('btn-wake').hidden = true;
    cuts = [];
    strip.set(displayList().filter((s) => s.form !== 'stone'), []);
    crowd.assign = new Map();
    crowd.layout(displayList());
    return;
  }
  $('btn-go').textContent = '進む';
  $('btn-wake').hidden = false;
  const k = run.stage.paths.length;
  if (cuts.length !== k - 1) cuts = evenCuts(k);
  const hidden = mod?.hidden;
  paths.style.setProperty('--k', k);
  paths.innerHTML = run.stage.paths.map((id, i) => {
    const p = pathById(id);
    return `
      <button class="path" data-i="${i}" style="--pc:${PATH_COLORS[i]}">
        <div class="glyph">${hidden ? '？' : p.glyph}</div>
        <div class="name">${hidden ? '……' : esc(p.name)}</div>
        <div class="text">${hidden ? '霧の向こうは見えない。' : esc(p.text)}</div>
        <div class="foot"><span class="count"></span><span class="seen">${hidden ? '' : seenText(id)}</span></div>
      </button>`;
  }).join('');
  paths.querySelectorAll('.path').forEach((el) => {
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
  if (!run || !run.stage) return;
  const groups = run.groupsFor(cuts, sortMode);
  const m = new Map();
  groups.forEach((g, i) => g.forEach((s) => m.set(s.id, i)));
  crowd.assign = m;
  strip.set(run.sorted(sortMode), cuts);
  $('paths').querySelectorAll('.path').forEach((el, i) => {
    const n = groups[i]?.length || 0;
    const c = el.querySelector('.count');
    if (c) c.innerHTML = `${n}<small>人</small>`;
    el.classList.toggle('empty', n === 0);
  });
}

function lock(on) {
  $('btn-go').disabled = on;
  $('btn-wake').disabled = on;
  $('sort').disabled = on;
  strip.locked = on;
  $('paths').style.pointerEvents = on ? 'none' : '';
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
$('btn-wake').addEventListener('click', (e) => {
  if (busy) return;
  unlock();
  armed(e.currentTarget, '本当に目覚める？', () => wakeFlow({ early: true }));
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !busy && !$('night').hidden && $('overlay').hidden) {
    e.preventDefault();
    go();
  }
});

function ticker(text, level = 1) {
  $('ticker').innerHTML = text ? `<span class="lv${level}">${esc(text)}</span>` : '';
}

function applyFx(id, events) {
  id = Number(id);
  // 一人に出る文字は一度にまとめる(金は差し引きだけ)
  const floats = [];
  const net = events.filter((e) => e.t === 'gold').reduce((a, e) => a + e.v, 0);
  for (const e of events) {
    switch (e.t) {
      case 'born': {
        const s = run.selves.find((x) => x.id === id);
        if (s) { crowd.born(s.id, s, e.from); sfx.born(); }
        break;
      }
      case 'die': crowd.die(id); sfx.puff(); break;
      case 'item': {
        const it = ITEMS[e.k];
        floats.push([it.glyph, it.kind === 'treasure' ? '#f3c55a' : it.kind === 'curse' ? '#c39ae0' : '#ece4cf', it.kind === 'treasure']);
        sfx.item();
        break;
      }
      case 'lose': floats.push([`−${ITEMS[e.k].glyph}`, '#8e8aa6', false]); break;
      case 'form': floats.push([FORMS[e.f], '#7cbf86', false]); sfx.morph(); break;
      case 'crown': floats.push(['王', '#f7d675', true]); sfx.rare(); break;
      default: break;
    }
  }
  if (net > 0) { floats.unshift([`+${fmt(net)}`, '#f3c55a', net >= 500]); sfx.coin(); }
  else if (net < 0) floats.unshift([`−${fmt(-net)}`, '#b0708a', false]);
  floats.slice(0, 3).forEach(([text, color, big], i) => crowd.float(id, text, color, big, i));
  crowd.refresh(id);
}

async function playReport(rep) {
  const ids = Object.keys(rep.fx);
  const span = Math.min(1300, 300 + ids.length * 12);
  let deaths = 0, births = 0;
  for (const id of ids) {
    const evs = rep.fx[id];
    if (evs.some((e) => e.t === 'die')) deaths++;
    if (evs.some((e) => e.t === 'born')) births++;
    // 生まれた私は親より少し遅れて出てくる
    const delay = Math.random() * span + (evs.some((e) => e.t === 'born') ? 250 : 0);
    setTimeout(() => applyFx(id, evs), delay * SPEED);
  }
  const notes = rep.notes.slice().sort((a, b) => b.level - a.level).slice(0, 4);
  await sleep(350);
  for (const n of notes) {
    ticker(n.text, n.level);
    if (n.level >= 3) sfx.rare();
    if (n.id != null) setTimeout(() => crowd.ring(n.id, 'rgba(243,197,90,0.95)'), 200);
    await sleep(n.level >= 3 ? 1500 : 1000);
  }
  await sleep(Math.max(0, span + 500 - notes.length * 1000));
  const sum = deaths || births
    ? [deaths ? `${deaths}人が消えた` : '', births ? `${births}人増えた` : ''].filter(Boolean).join('、')
    : '誰も消えなかった';
  if (!notes.length || notes[notes.length - 1].level < 3) ticker(sum, 1);
}

async function go() {
  if (busy || !run || !run.inNight) return;
  unlock();
  if (run.atDawn()) { dawnFlow(); return; }
  busy = true;
  lock(true);
  sfx.go();
  const keepAssign = crowd.assign;
  const rep = run.resolve(cuts, sortMode);
  save();
  crowd.assign = keepAssign;
  $('paths').querySelectorAll('.path').forEach((el) => el.classList.add('fading'));
  await playReport(rep);
  crowd.assign = new Map();
  if (!run.population() || rep.alarm) {
    await sleep(rep.alarm ? 600 : 300);
    wakeFlow({ alarm: rep.alarm });
    return;
  }
  renderStage();
  busy = false;
  lock(false);
}

async function dawnFlow() {
  busy = true;
  lock(true);
  sfx.dawn();
  const d = run.dawn();
  save();
  ticker(`${d.n}人の私が夜明けの門をくぐった`, 2);
  for (const [id, evs] of Object.entries(d.fx)) setTimeout(() => applyFx(id, evs), Math.random() * 900 * SPEED);
  await sleep(2000);
  wakeFlow({ dawn: true });
}

async function wakeFlow(opt) {
  busy = true;
  lock(true);
  crowd.assign = new Map();
  const aliveIds = run.selves.filter((s) => s.alive).map((s) => s.id);
  const before = run.savings;
  const stageCount = run.stageCount;
  const diedTonight = run.dead.length;
  const res = run.wake();
  save();
  if (res.nightmare) {
    sfx.nightmare();
    await curtain('悪夢<small>誰も帰ってこなかった</small>', 'nightmare', 1800);
    showNightmare(diedTonight);
    return;
  }
  if (opt.alarm) await sleep(500);
  // くじ引き:生き残りの上を光が巡り、ゆっくり止まる
  const steps = [];
  if (aliveIds.length > 1) for (let d = 45; d < 430; d *= 1.12) steps.push(d);
  let prev = null;
  for (let i = 0; i < steps.length; i++) {
    let id = res.chosen.id;
    if (i < steps.length - 1) {
      do id = aliveIds[Math.floor(Math.random() * aliveIds.length)]; while (id === prev && aliveIds.length > 1);
    }
    prev = id;
    crowd.highlight = id;
    sfx.tick(1 + (i % 4) * 0.08);
    await sleep(steps[i]);
  }
  crowd.highlight = res.chosen.id;
  sfx.gong();
  for (let t = 0; t <= 1; t += 0.05) { crowd.dim = t; await sleep(30); }
  await sleep(700);
  showWake(res, before, stageCount, opt);
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

function itemTags(items) {
  const counts = {};
  for (const k of items) counts[k] = (counts[k] || 0) + 1;
  return Object.entries(counts).map(([k, n]) => {
    const it = ITEMS[k];
    const glyph = it.glyph === it.name ? '' : `<b>${it.glyph}</b>`;
    return `<span class="tag ${it.kind}">${glyph}${esc(it.name)}${n > 1 ? ` ×${n}` : ''}</span>`;
  }).join('');
}

function formTag(form) {
  return form && form !== 'human' ? `<span class="tag form"><b>${FORMS[form]}</b>${{ cat: '猫の姿', bird: '鳥の姿', stone: '石の姿' }[form]}</span>` : '';
}

function storyHTML(s, stageCount) {
  return `<ul class="story">${s.log.map((e, i) => {
    const at = e.at >= stageCount ? '夜明け' : `${kanji(e.at + 1)}ノ辻`;
    const cls = e.at >= stageCount ? 'dawn' : !s.alive && i === s.log.length - 1 ? 'end' : '';
    return `<li class="${cls}"><span class="at">${at}</span>${esc(e.text)}</li>`;
  }).join('') || '<li><span class="at">一ノ辻</span>まだ何も起きていない</li>'}</ul>`;
}

function inspect(s) {
  crowd.selected = s.id;
  openSheet(`
    <div class="sheet-head">
      <span class="sheet-id ${worth(s) >= 800 ? 'gold' : ''}">#${s.id}</span>
      <span class="sheet-sub">${fmt(s.gold)}文${s.king ? ' ・ 王' : ''}</span>
    </div>
    <div class="sheet-row">${formTag(s.form)}${itemTags(s.items)}</div>
    ${storyHTML(s, run.stageCount)}
    <div class="sheet-actions"><button class="btn ghost" id="sheet-close">閉じる</button></div>
  `, true);
  $('sheet-close').addEventListener('click', closeSheet);
}

function drawDist(canvas, dist, value) {
  const W = canvas.clientWidth || 300, H = canvas.clientHeight || 48;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const max = Math.max(1, ...dist);
  const bw = W / dist.length;
  let marked = false;
  dist.forEach((v, i) => {
    const h = v > 0 ? 2 + (H - 2) * Math.sqrt(v / max) : 1;
    const me = !marked && v === value;
    if (me) marked = true;
    ctx.fillStyle = me ? '#f3c55a' : 'rgba(236,228,207,0.22)';
    ctx.fillRect(i * bw + (bw > 3 ? 0.5 : 0), H - h, Math.max(0.8, bw - (bw > 3 ? 1 : 0)), h);
  });
}

function showWake(res, before, stageCount, opt) {
  const c = res.chosen;
  const r = res.richest;
  const treasures = c.items.filter((k) => ITEMS[k].kind === 'treasure');
  const carry = c.items.filter((k) => ITEMS[k].kind !== 'treasure');
  let lead = `${res.survivors}人の中から、この私が本当の私になった。`;
  if (res.survivors === 1) lead = 'ただ一人生き残った私が、本当の私になった。';
  if (opt.alarm) lead = `目覚ましに起こされた。${lead}`;
  let ghost = '';
  if (res.survivors > 1 && r.id === c.id) ghost = '<div class="ghost-line"><strong>いちばん豊かな私だった。</strong></div>';
  else if (res.survivors > 1 && worth(r) > res.value) {
    const last = r.log.filter((e) => e.at < stageCount).slice(-1)[0];
    ghost = `<div class="ghost-line">いちばん豊かだった私は <strong>#${r.id}</strong>(${fmt(worth(r))}文)。${last ? `<br>「${esc(last.text)}」` : ''}</div>`;
    if (res.poorest.id === c.id) ghost = '<div class="ghost-line"><strong>いちばん貧しい私だった。</strong></div>' + ghost;
  }
  const carryHTML = carry.length || (c.form !== 'human' && c.form !== 'stone')
    ? `<div class="muted">次の夜へ持っていくもの</div><div class="sheet-row">${formTag(c.form === 'stone' ? '' : c.form)}${itemTags(carry)}</div>`
    : '';
  const last = run.isOver();
  openSheet(`
    <div class="sheet-head">
      <span class="sheet-id gold">#${c.id}</span>
      <span class="sheet-sub">${esc(lead)}</span>
    </div>
    <div class="sheet-big">+${fmt(res.value)}文</div>
    <div class="muted">${fmt(c.gold)}文${treasures.length ? ' と' : ''}</div>
    ${treasures.length ? `<div class="sheet-row">${itemTags(treasures)}</div>` : ''}
    <canvas class="dist" id="dist"></canvas>
    ${ghost}
    ${storyHTML(c, stageCount)}
    ${carryHTML}
    <div class="muted">貯え ${fmt(before)} → <span style="color:var(--gold)">${fmt(run.savings)}文</span></div>
    <div class="sheet-actions"><button class="btn primary" id="sheet-next">${last ? '朝' : '次の夜へ'}</button></div>
  `);
  requestAnimationFrame(() => drawDist($('dist'), res.dist, res.value));
  $('sheet-next').addEventListener('click', afterWake);
}

function showNightmare(died) {
  const last = run.isOver();
  openSheet(`
    <div class="sheet-head"><span class="sheet-id" style="color:var(--blood)">悪夢</span></div>
    <p class="sheet-sub">今夜、${died}人の私が消えた。何も持ち帰れなかった。</p>
    <div class="muted">貯え ${fmt(run.savings)}文</div>
    <div class="sheet-actions"><button class="btn primary" id="sheet-next">${last ? '朝' : '次の夜へ'}</button></div>
  `);
  $('sheet-next').addEventListener('click', afterWake);
}

function afterWake() {
  closeSheet();
  crowd.highlight = null;
  crowd.dim = 0;
  if (run.isOver()) showEnd();
  else enterNight();
}

function showEnd() {
  const p = store.profile;
  const score = run.savings;
  const rank = RANKS.find(([v]) => score < v)[1];
  const max = Math.max(1, ...run.history.map((h) => h.value));
  const best = score >= p.best;
  const bars = run.history.map((h) => `<div class="${h.nightmare ? 'nm' : ''}" style="height:${h.nightmare ? 6 : Math.max(2, (h.value / max) * 90)}px" title="${fmt(h.value)}文"></div>`).join('');
  const labels = run.history.map((h) => `<span>${kanji(h.night)}</span>`).join('');
  run = null;
  save();
  $('night').hidden = true;
  $('hud').hidden = true;
  openSheet(`
    <p class="center muted">十夜が明けた</p>
    <div class="rank">${rank}</div>
    <div class="sheet-big center">${fmt(score)}文</div>
    <p class="center muted">${best ? 'これまでで一番の貯え' : `これまでの最高 ${fmt(p.best)}文`}</p>
    <div class="nights">${bars}</div>
    <div class="nights-labels">${labels}</div>
    <div class="codex" style="margin:18px auto 0">${codexHTML()}</div>
    <div class="sheet-actions">
      <button class="btn ghost" id="end-title">表紙</button>
      <button class="btn primary" id="end-again">もう一度眠る</button>
    </div>
  `);
  $('end-title').addEventListener('click', () => { closeSheet(); showTitle(); });
  $('end-again').addEventListener('click', () => {
    run = new Run(store.profile, newRng());
    save();
    enterNight();
  });
}

setMuted(store.muted);
showTitle();
requestAnimationFrame(frame);
