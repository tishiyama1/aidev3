// 百人の迷宮:ボットで遠征を繰り返し、勝率や覚醒の数を測る。
// node tools/dbalance.mjs [runs]
import { Run, newProfile, mulberry32, power, FLOORS } from '../dungeon/js/dsim.js';

const RUNS = Number(process.argv[2] || 300);
const evenCuts = (k) => Array.from({ length: k - 1 }, (_, i) => (i + 1) / k);
const allTo = (k, i) => Array.from({ length: k - 1 }, (_, j) => (j < i ? 0 : 1));

function score(run) {
  const living = run.living();
  const pw = living.reduce((s, a) => s + power(a), 0);
  const traits = Object.values(run.traits).filter(Boolean).length;
  return pw + 6 * run.stash.length + 60 * traits + 25 * run.grace + 4 * living.length;
}

function candidates(k) {
  const c = [];
  for (let i = 0; i < k; i++) c.push(allTo(k, i));
  c.push(evenCuts(k));
  if (k === 2) c.push([0.15], [0.85], [0.3], [0.7]);
  else c.push([0.1, 0.2], [0.1, 0.9], [0, 0.1], [0.8, 0.9], [0.1, 0.55], [0.45, 0.9]);
  return c;
}

const strategies = {
  random: {
    room: (run) => Array.from({ length: run.stage.rooms.length - 1 }, () => run.rng()).sort((a, b) => a - b),
    camp: (run) => { run.autoEquip(); run.camp(['rest', 'train', 'pray', 'honor'][Math.floor(run.rng() * 4)]); },
    stance: (run) => (run.boss.charge && run.grace > 0 ? 'grace' : 'attack'),
  },
  even: {
    room: (run) => evenCuts(run.stage.rooms.length),
    camp: (run) => { run.autoEquip(); run.camp('rest'); },
    stance: () => 'attack',
  },
  // 見込みを見て、全員を一番安全な部屋へ送る(碑文は優先)
  human: {
    room: (run) => {
      const ids = run.stage.rooms;
      const all = run.living();
      let best = 0, bv = -Infinity;
      ids.forEach((id, i) => {
        const e = run.estimate(id, all);
        let v = e.known ? e.survive : 0.7;
        if (id === 'stele' && Object.values(run.traits).some((x) => !x)) v += 0.15;
        if (id === 'prisoners' || id === 'vault') v += 0.05;
        if (v > bv) { bv = v; best = i; }
      });
      return allTo(ids.length, best);
    },
    camp: (run) => {
      run.autoEquip();
      const living = run.living();
      if (living.filter((a) => a.wounds).length > living.length * 0.35) run.camp('rest');
      else if (run.floor >= 5 && run.prophecyOdds()[0].p < 0.5) run.camp('honor', run.living().reduce((x, a) => (a.fame > x.fame ? a : x)).id);
      else run.camp('train');
    },
    stance: (run) => (run.boss.charge && run.grace > 0 ? 'grace' : 'attack'),
  },
  smart: {
    room: (run) => {
      let best = null, bv = -Infinity;
      for (const cuts of candidates(run.stage.rooms.length)) {
        let v = 0;
        for (let t = 0; t < 4; t++) {
          const sim = new Run(run.profile, mulberry32((run.rng() * 1e9) | 0), JSON.parse(run.snapshot()));
          sim.resolve(cuts, 'power');
          v += score(sim);
        }
        if (v > bv) { bv = v; best = cuts; }
      }
      return best;
    },
    camp: (run) => {
      run.autoEquip();
      const living = run.living();
      const wounded = living.filter((a) => a.wounds).length;
      const top = run.prophecyOdds()[0];
      if (wounded > living.length * 0.35) run.camp('rest');
      else if (run.floor >= 4 && top.p < 0.6) {
        const cands = living.slice().sort((a, b) => b.fame - a.fame).slice(0, 5);
        const best = cands.reduce((x, a) => (run.strikeChance(a) > run.strikeChance(x) ? a : x));
        run.camp('honor', best.id);
      } else if (run.grace < 2) run.camp('pray');
      else run.camp('train');
    },
    stance: (run) => (run.boss.charge && run.grace > 0 ? 'grace' : run.boss.charge ? 'guard' : 'attack'),
  },
};

function play(name, seed, stats) {
  const st = strategies[name];
  const run = new Run(newProfile(), mulberry32(seed));
  for (const k of Object.keys(run.profile.known)) delete run.profile.known[k];
  while (run.phase !== 'over') {
    if (run.phase === 'room') run.resolve(st.room(run), 'power');
    else if (run.phase === 'camp') {
      stats.popAt[run.floor] = (stats.popAt[run.floor] || 0) + run.population();
      st.camp(run);
      run.nextFloor();
    } else if (run.phase === 'boss') {
      if (run.boss.ready) {
        const r = run.prophecy();
        stats.strikes++;
        stats.strikeOdds += r.odds[0].p;
      } else run.bossRound(st.stance(run));
    }
  }
  stats.awak += run.advs.filter((a) => a.skill).length;
  stats.recruits += run.advs.filter((a) => a.joined > 1).length;
  return run.result;
}

for (const name of Object.keys(strategies)) {
  const N = name === 'smart' ? Math.min(RUNS, 60) : RUNS;
  const stats = { popAt: {}, awak: 0, recruits: 0, strikes: 0, strikeOdds: 0 };
  let wins = 0, wiped = 0, fled = 0, reachBoss = 0, surv = 0;
  for (let i = 0; i < N; i++) {
    const r = play(name, 5000 + i, stats);
    if (r.win) { wins++; surv += r.survivors; }
    else if (r.reason === 'fled') fled++;
    else wiped++;
    if (r.win || r.floor > FLOORS) reachBoss++;
  }
  const pops = Object.entries(stats.popAt).map(([f, v]) => `${f}:${Math.round(v / N)}`).join(' ');
  console.log(`${name.padEnd(7)} win ${(wins / N * 100).toFixed(0)}%  boss到達 ${(reachBoss / N * 100).toFixed(0)}%  全滅 ${wiped} 逃走 ${fled}  勝利時生存 ${wins ? Math.round(surv / wins) : '-'}  覚醒/回 ${(stats.awak / N).toFixed(1)}  救出 ${(stats.recruits / N).toFixed(1)}  予言本命率 ${stats.strikes ? (stats.strikeOdds / stats.strikes * 100).toFixed(0) : '-'}%`);
  console.log(`        野営時の人数 ${pops}`);
}
