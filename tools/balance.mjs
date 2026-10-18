// 戦略ボットで十夜を何度も回し、得点の分布を見る。
// node tools/balance.mjs [runs]
import { Run, newProfile, mulberry32, NIGHTS } from '../js/sim.js';
import { pathById } from '../js/sim.js';

const RUNS = Number(process.argv[2] || 2000);

const risk = (id) => pathById(id).risk;
const evenCuts = (k) => Array.from({ length: k - 1 }, (_, i) => (i + 1) / k);
// 道 i に全員を送る仕切り
const allTo = (k, i) => Array.from({ length: k - 1 }, (_, j) => (j < i ? 0 : 1));

const strategies = {
  even: (run) => evenCuts(run.stage.paths.length),
  random: (run) => Array.from({ length: run.stage.paths.length - 1 }, () => run.rng()).sort((a, b) => a - b),
  safe: (run) => {
    const ps = run.stage.paths;
    const i = ps.reduce((b, id, j) => (risk(id) < risk(ps[b]) ? j : b), 0);
    return allTo(ps.length, i);
  },
  reckless: (run) => {
    const ps = run.stage.paths;
    const i = ps.reduce((b, id, j) => (risk(id) > risk(ps[b]) ? j : b), 0);
    return allTo(ps.length, i);
  },
  // 上位二割を安全な道へ、残りを一番危険な道へ。道の並びに合わせて仕切りを置く。
  cull: (run) => {
    const ps = run.stage.paths;
    const order = ps.map((id, j) => [risk(id), j]).sort((a, b) => a[0] - b[0]);
    const safe = order[0][1], wild = order[order.length - 1][1];
    if (safe === wild) return evenCuts(ps.length);
    // 先頭 20% を safe, 残りを wild に。間の道は 0 人。
    const share = ps.map((_, j) => (j === safe ? 0.2 : j === wild ? 0.8 : 0));
    // 並び順の上から道0,1,2…なので、上位を safe に送るには safe が先頭でないといけない。
    // 仕切りは順番固定なので、safe < wild のときだけ上位を safe に送れる。
    if (safe > wild) { share[safe] = 0.8; share[wild] = 0.2; }
    const cuts = [];
    let acc = 0;
    for (let j = 0; j < ps.length - 1; j++) { acc += share[j]; cuts.push(acc); }
    return cuts;
  },
};

function play(strat, seed, wakeAt) {
  const rng = mulberry32(seed);
  const run = new Run(newProfile(), rng);
  let nightmares = 0;
  while (!run.isOver()) {
    run.startNight();
    while (!run.atDawn()) {
      const rep = run.resolve(strategies[strat](run), 'gold');
      if (rep.alarm) break;
      if (!run.population()) break;
      if (wakeAt && run.stageIdx >= wakeAt) break;
    }
    if (run.atDawn() && run.population()) run.dawn();
    const r = run.wake();
    if (r.nightmare) nightmares++;
  }
  return { score: run.savings, nightmares, history: run.history };
}

const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
for (const name of Object.keys(strategies)) {
  const scores = [];
  let nm = 0;
  for (let i = 0; i < RUNS; i++) {
    const r = play(name, 1000 + i);
    scores.push(r.score);
    nm += r.nightmares;
  }
  scores.sort((a, b) => a - b);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  console.log(
    name.padEnd(9),
    'mean', Math.round(mean).toString().padStart(7),
    'p10', q(scores, 0.1).toString().padStart(6),
    'med', q(scores, 0.5).toString().padStart(6),
    'p90', q(scores, 0.9).toString().padStart(7),
    'max', scores[scores.length - 1].toString().padStart(7),
    'nightmare/run', (nm / RUNS).toFixed(2),
  );
}

// 先読みボット:各候補の振り分けを複製した夜で試し、生存者の平均価値が最大になるものを選ぶ。
import { worth } from '../js/sim.js';
function lookahead(run) {
  const k = run.stage.paths.length;
  const cands = [];
  for (let i = 0; i < k; i++) cands.push(allTo(k, i));
  cands.push(evenCuts(k));
  if (k === 2) cands.push([0.2], [0.8]);
  else cands.push([0.2, 0.2], [0.2, 1], [0, 0.8], [0.8, 0.8]);
  let best = cands[0], bestV = -Infinity;
  for (const cuts of cands) {
    let v = 0;
    for (let t = 0; t < 6; t++) {
      const data = JSON.parse(JSON.stringify(run));
      const sim = new Run(newProfile(), mulberry32((run.rng() * 1e9) | 0), data);
      sim.resolve(cuts, 'gold');
      const alive = sim.selves.filter((s) => s.alive);
      const mean = alive.length ? alive.reduce((a, s) => a + worth(s), 0) / alive.length : 0;
      v += alive.length < 15 ? mean * (alive.length / 15) : mean;
    }
    if (v > bestV) { bestV = v; best = cuts; }
  }
  return best;
}
strategies.lookahead = lookahead;
{
  const scores = [];
  let nm = 0;
  const N = Math.min(RUNS, 200);
  for (let i = 0; i < N; i++) { const r = play('lookahead', 1000 + i); scores.push(r.score); nm += r.nightmares; }
  scores.sort((a, b) => a - b);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  console.log('lookahead', 'mean', Math.round(mean), 'p10', q(scores, 0.1), 'med', q(scores, 0.5), 'p90', q(scores, 0.9), 'nightmare/run', (nm / N).toFixed(2));
}
