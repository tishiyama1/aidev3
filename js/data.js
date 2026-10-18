// 夢の中の持ち物・姿・道・夜の異変の定義。
// 道の run(group, ctx) はその道へ送られた私たちを一括で処理する。

export const ITEMS = {
  lantern: { name: '提灯', glyph: '灯', kind: 'tool', value: 20 },
  umbrella: { name: '傘', glyph: '傘', kind: 'tool', value: 20 },
  key: { name: '錆びた鍵', glyph: '鍵', kind: 'tool', value: 40 },
  charm: { name: 'お守り', glyph: '守', kind: 'tool', value: 40 },
  mask: { name: '狐の面', glyph: '面', kind: 'tool', value: 60 },
  doll: { name: '市松人形', glyph: '人', kind: 'curse', value: 0 },
  pearl: { name: '真珠', glyph: '珠', kind: 'treasure', value: 150 },
  bell: { name: '金の鈴', glyph: '鈴', kind: 'treasure', value: 120 },
  horn: { name: '鬼の角', glyph: '角', kind: 'treasure', value: 300 },
  scale: { name: '竜の鱗', glyph: '鱗', kind: 'treasure', value: 500 },
  moon: { name: '月のかけら', glyph: '月', kind: 'treasure', value: 3000 },
};

export const ITEM_ORDER = ['lantern', 'umbrella', 'key', 'charm', 'mask', 'doll', 'pearl', 'bell', 'horn', 'scale', 'moon'];

export const FORMS = { human: '人', cat: '猫', bird: '鳥', stone: '石' };

export const MODS = {
  wolves: { name: '狼', text: '遠くで狼が吠えている。', w: 3 },
  fullmoon: { name: '満月', text: '満月。なにもかもが明るい。', w: 2, goldMul: 2 },
  redmoon: { name: '赤い月', text: '赤い月が出ている。', w: 2, deathMul: 1.6 },
  fog: { name: '濃霧', text: '濃い霧で、道の先が見えない。', w: 1, hidden: true },
};

// risk はバランス検証用のボットだけが参照する目安(画面には出さない)。
export const PATHS = [
  {
    id: 'bridge', name: '吊り橋', glyph: '橋', text: '揺れる吊り橋。板が何枚か抜けている。', w: 10, risk: 1,
    run(g, c) {
      for (const s of g) {
        if (s.form === 'human' && c.risk(s, 0.12, '吊り橋から落ちた')) continue;
        c.gainLog(s, c.ri(5, 20), '吊り橋を渡り、');
      }
    },
  },
  {
    id: 'river', name: '黒い川', glyph: '川', text: '黒い川。底で何かが光っている。', w: 9, risk: 2,
    run(g, c) {
      for (const s of g) {
        if (s.form === 'bird') { c.gainLog(s, c.ri(2, 10), '川の上を飛んで渡り、'); continue; }
        if (c.risk(s, s.form === 'cat' ? 0.5 : 0.22, '黒い川に沈んだ')) continue;
        if (c.r() < 0.15) { c.give(s, 'pearl'); c.log(s, '川底で真珠を見つけた'); }
        else c.gainLog(s, c.ri(2, 10), '川を泳ぎきり、');
      }
    },
  },
  {
    id: 'fox', name: '狐の賭場', glyph: '狐', text: '狐たちが丁半をしている。「旦那、ひと勝負」', w: 9, risk: 0,
    run(g, c) {
      for (const s of g) {
        if (s.form === 'cat') { c.log(s, '狐の賭場に入ったが、猫は相手にされなかった'); continue; }
        let gold = s.gold;
        const lent = gold <= 0;
        if (lent) gold = Math.round(10 * c.D);
        const pw = c.has(s, 'mask') ? 0.62 : c.has(s, 'doll') ? 0.4 : 0.5;
        let wins = 0;
        let lost = false;
        for (;;) {
          if (c.r() < pw) {
            wins++;
            gold *= 2;
            if (c.r() > 0.6) break;
          } else { lost = true; gold = 0; break; }
        }
        c.setGold(s, gold);
        if (lost) {
          if (lent) c.log(s, wins ? `狐に元手を借りて${wins}勝したが、最後に負けた` : '狐に元手を借りて丁半に負けた');
          else c.log(s, wins ? `丁半で${wins}勝したあと、身ぐるみ剥がされた` : '丁半で一文無しになった');
        } else {
          c.log(s, `丁半で${wins}連勝し、${gold}文になった`);
        }
        if (wins >= 4) c.note(`#${s.id} が丁半で${wins}連勝${lost ? 'したあと全部すった' : 'した'}`, wins >= 6 ? 3 : 2, s);
      }
    },
  },
  {
    id: 'dragon', name: '竜の顎', glyph: '竜', text: '大きく開いた竜の口。喉の奥に金貨の山。', w: 5, risk: 3, from: 2,
    run(g, c) {
      for (const s of g) {
        if (c.risk(s, 0.88, '竜に呑まれた')) continue;
        c.gainLog(s, c.ri(200, 300), '竜の喉の奥から生還し、', '持ち帰った');
        if (c.r() < 0.25) { c.give(s, 'scale'); c.log(s, '竜の鱗を剥がしてきた'); }
        c.note(`#${s.id} が竜の顎から生還した`, 2, s);
      }
    },
  },
  {
    id: 'fog', name: '霧の道', glyph: '霧', text: '白い霧。何も見えない。', w: 8, risk: 1,
    run(g, c) {
      for (const s of g) {
        const r = c.r();
        if (r < 0.07) c.kill(s, '霧に溶けて消えた');
        else if (r < 0.19) c.gainLog(s, c.ri(30, 60), '霧の中で財布を拾い、', '手に入れた');
        else if (r < 0.27) c.split(s, '霧の中でもう一人の私に出会った', '霧の中から現れた');
        else c.log(s, '霧の道を抜けた');
      }
    },
  },
  {
    id: 'cave', name: '洞窟', glyph: '洞', text: '暗い洞窟。奥から水の滴る音。', w: 8, risk: 2,
    run(g, c) {
      for (const s of g) {
        const lit = c.has(s, 'lantern');
        if (c.risk(s, lit ? 0.04 : 0.32, '暗闇で足を踏み外した')) continue;
        const r = c.r();
        if (r < 0.09 && c.give(s, 'key')) c.log(s, '洞窟で錆びた鍵を拾った');
        else if (r < 0.15 && c.give(s, 'lantern')) c.log(s, '洞窟で古い提灯を拾った');
        else c.gainLog(s, c.ri(20, 60), lit ? '提灯で奥まで照らし、' : '手探りで洞窟を抜け、');
      }
    },
  },
  {
    id: 'door', name: '鍵の扉', glyph: '扉', text: '重い扉。鍵穴がひとつ。', w: 6, risk: 0, from: 1,
    run(g, c) {
      for (const s of g) {
        if (!c.has(s, 'key')) { c.log(s, '扉の前でしばらく待った'); continue; }
        c.take(s, 'key');
        c.gainLog(s, c.ri(200, 320), '鍵で扉を開け、', '見つけた');
        if (c.r() < 0.2) { c.give(s, 'bell'); c.log(s, '扉の奥で金の鈴も見つけた'); }
      }
    },
  },
  {
    id: 'market', name: '夢の市', glyph: '市', text: '夢の市。なんでも売っている。', w: 7, risk: 0,
    run(g, c) {
      const price = Math.round(15 * c.D);
      const wares = [['lantern', 3], ['umbrella', 3], ['key', 2], ['charm', 2], ['mask', 1.5], ['doll', 1.2]];
      for (const s of g) {
        if (s.form === 'cat') { c.log(s, '市をうろついて魚の匂いを嗅いだ'); continue; }
        const cand = wares.filter(([k]) => !c.has(s, k));
        if (s.gold < price || !cand.length) { c.log(s, '市を眺めて歩いた'); continue; }
        const k = c.pickW(cand);
        c.add(s, -price);
        c.give(s, k);
        c.log(s, `市で${ITEMS[k].name}を買った`);
      }
    },
  },
  {
    id: 'festival', name: '夢の祭', glyph: '祭', text: '太鼓の音。人が増えるほど賑やかになる。', w: 5, risk: 0, from: 1,
    run(g, c) {
      const n = g.length;
      for (const s of g) c.gainLog(s, n + c.ri(0, 5), `${n}人で祭を楽しみ、`, 'もらった');
      if (n >= 60) c.note(`${n}人の私で祭が大いに盛り上がった`, 2);
    },
  },
  {
    id: 'snake', name: '白い大蛇', glyph: '蛇', text: '白い大蛇が道をふさいでいる。', w: 6, risk: 2, from: 1,
    run(g, c) {
      const n = g.length;
      if (n >= 30) {
        c.note(`${n}人の私に驚いて大蛇が逃げ出した`, 1);
        for (const s of g) {
          c.gainLog(s, c.ri(15, 30), '大勢で大蛇を追い払い、');
          if (c.r() < 0.05) { c.give(s, 'scale'); c.log(s, '大蛇の落とした鱗を拾った'); }
        }
        return;
      }
      let eaten = 0;
      for (const s of c.shuffle(g.slice())) {
        if (eaten < 8) {
          eaten++;
          if (!c.doom(s, '白い大蛇に呑まれた')) c.log(s, '大蛇の腹から這い出した');
        } else c.log(s, '大蛇が満腹のうちに通り抜けた');
      }
    },
  },
  {
    id: 'pillar', name: '崩れかけた橋', glyph: '柱', text: '崩れかけた橋。誰かが支えれば渡れる。', w: 5, risk: 2, from: 2,
    run(g, c) {
      const n = g.length;
      if (n <= 10) {
        for (const s of g) if (!c.risk(s, 0.5, '崩れた橋ごと落ちた')) c.log(s, '崩れる橋をどうにか渡りきった');
        return;
      }
      const order = c.shuffle(g.slice());
      for (const s of order.slice(0, 10)) { c.setForm(s, 'stone'); c.log(s, '橋を支えて石になった'); }
      for (const s of order.slice(10)) c.gainLog(s, c.ri(60, 100), '石になった私たちの上を渡り、', '向こう岸で拾った');
      c.note('十人の私が石になって橋を支えた', 1);
    },
  },
  {
    id: 'cats', name: '猫の集会', glyph: '猫', text: '猫たちが集まって、こちらを手招きしている。', w: 5, risk: 0,
    run(g, c) {
      for (const s of g) {
        if (s.form === 'cat') {
          if (c.r() < 0.3) { c.give(s, 'bell'); c.log(s, '猫の仲間から金の鈴をもらった'); }
          else c.log(s, '猫の集会で丸くなった');
          continue;
        }
        if (c.r() < 0.35) { c.setForm(s, 'cat'); c.log(s, '猫になった'); }
        else c.log(s, '猫を撫でて帰った');
      }
    },
  },
  {
    id: 'cliff', name: '花畑の崖', glyph: '崖', text: '崖の下に花畑。かなり高い。', w: 6, risk: 3, from: 1,
    run(g, c) {
      for (const s of g) {
        if (s.form === 'bird') c.log(s, '花畑へ舞い降りた');
        else if (s.form === 'cat') c.log(s, '崖からくるりと回って着地した');
        else if (c.has(s, 'umbrella')) c.log(s, '傘を開いてふわりと崖を降りた');
        else if (c.risk(s, 0.5, '崖から落ちた')) continue;
        else c.log(s, '崖から飛び降りて、奇跡的に助かった');
        if (c.r() < 0.07) { c.give(s, 'pearl'); c.log(s, '花畑で真珠を見つけた'); }
        else c.gainLog(s, c.ri(40, 80), '花畑で');
      }
    },
  },
  {
    id: 'torii', name: '千本鳥居', glyph: '鳥', text: '果てしなく続く鳥居。くぐるたびに何かが変わる。', w: 6, risk: 0,
    run(g, c) {
      for (const s of g) {
        const r = c.r();
        if (r < 0.12) {
          if (c.setForm(s, 'bird')) c.log(s, '鳥居をくぐるうちに鳥になった'); else c.log(s, '鳥居の上で羽を休めた');
        } else if (r < 0.22) {
          if (c.setForm(s, 'cat')) c.log(s, '鳥居をくぐるうちに猫になった'); else c.log(s, '鳥居の下で昼寝をした');
        } else if (r < 0.38 && s.form !== 'human') {
          c.setForm(s, 'human'); c.log(s, '鳥居をくぐって人に戻った');
        } else if (r < 0.5 && c.has(s, 'doll')) {
          c.take(s, 'doll'); c.log(s, '人形を鳥居の陰に置いてきた');
        } else if (r < 0.55 && c.give(s, 'doll')) {
          c.log(s, 'いつの間にか人形を抱いていた');
        } else if (r < 0.62 && c.give(s, 'mask')) {
          c.log(s, '鳥居の脇で狐の面を拾った');
        } else c.log(s, '鳥居を抜けた');
      }
    },
  },
  {
    id: 'shrine', name: '小さな社', glyph: '社', text: '苔むした社。賽銭箱がある。', w: 6, risk: 0,
    run(g, c) {
      for (const s of g) {
        const pay = Math.floor(s.gold * 0.2);
        if (pay) c.add(s, -pay);
        const r = c.r();
        if (r < 0.015 && s.gold > 0) {
          c.setGold(s, s.gold * 5);
          c.log(s, '神託を授かり、金が五倍になった');
          c.note(`#${s.id} に神託が降りた`, 2, s);
        } else if (c.has(s, 'doll') && pay >= Math.round(10 * c.D)) {
          c.take(s, 'doll'); c.log(s, `賽銭を${pay}文入れ、人形を納めた`);
        } else if (r < 0.25 && c.give(s, 'charm')) {
          c.log(s, pay ? `賽銭を${pay}文入れ、お守りを授かった` : '手を合わせ、お守りを授かった');
        } else c.log(s, pay ? `賽銭を${pay}文入れた` : '社に手を合わせた');
      }
    },
  },
  {
    id: 'lottery', name: '富くじ', glyph: '籤', text: '富くじ売りが声を張り上げている。', w: 6, risk: 0,
    run(g, c) {
      const price = Math.round(10 * c.D);
      for (const s of g) {
        if (s.form === 'cat') { c.log(s, '猫には富くじを売ってもらえなかった'); continue; }
        if (s.gold < price) { c.log(s, '富くじを買う金がなかった'); continue; }
        c.add(s, -price);
        if (c.r() < 0.012) {
          const w = c.add(s, Math.round(1000 * c.D));
          c.log(s, `富くじが当たり、${w}文を手にした`);
          c.note(`#${s.id} が富くじに当たった`, 3, s);
        } else c.log(s, '富くじは外れた');
      }
    },
  },
  {
    id: 'village', name: '王を探す村', glyph: '王', text: '村人たちが新しい王を探している。', w: 4, risk: 0, from: 2,
    run(g, c) {
      const n = g.length;
      if (n < 10) {
        for (const s of g) c.log(s, '村に入ったが、旅人が少なすぎて相手にされなかった');
        return;
      }
      const king = c.pick(g);
      for (const s of g) if (s !== king) c.gainLog(s, c.ri(3, 8), `#${king.id} の戴冠を祝い、`, 'の祝い金をもらった');
      king.king = true;
      const w = c.add(king, Math.round(600 * c.D));
      c.push(king, { t: 'crown' });
      c.log(king, `王に選ばれ、${w}文を授かった`);
      c.note(`${n}人の中から #${king.id} が王に選ばれた`, 3, king);
    },
  },
  {
    id: 'mirror', name: '鏡の間', glyph: '鏡', text: '鏡だらけの部屋。鏡の中の私が手招きしている。', w: 6, risk: 1,
    run(g, c) {
      for (const s of g) {
        if (!s.alive) continue;
        const r = c.r();
        if (r < 0.14) c.split(s, '鏡の中からもう一人の私が出てきた', '鏡の中から出てきた');
        else if (r < 0.24) {
          const others = g.filter((x) => x !== s && x.alive);
          if (!others.length) { c.log(s, '鏡の間を抜けた'); continue; }
          const o = c.pick(others);
          const a = s.gold, b = o.gold;
          c.setGold(s, b); c.setGold(o, a);
          c.log(s, `鏡越しに #${o.id} と財布が入れ替わった`);
          c.log(o, `鏡越しに #${s.id} と財布が入れ替わった`);
        } else if (r < 0.29) c.doom(s, '鏡の中に閉じ込められた');
        else c.log(s, '鏡の間を抜けた');
      }
    },
  },
  {
    id: 'alley', name: '暗い路地', glyph: '路', text: '暗い路地。誰かが後をつけてくる。', w: 5, risk: 1,
    run(g, c) {
      for (const s of g) {
        if (!s.alive) continue;
        const r = c.r();
        if (r < 0.13) {
          const vs = g.filter((x) => x !== s && x.alive && x.gold > 0);
          if (!vs.length) { c.log(s, '路地を抜けた'); continue; }
          const v = c.pick(vs);
          const t = Math.ceil(v.gold / 2);
          c.add(v, -t); c.add(s, t);
          c.log(s, `闇にまぎれて #${v.id} から${t}文を盗んだ`);
          c.log(v, `#${s.id} に${t}文を盗まれた`);
          if (t >= 300) c.note(`#${s.id} が #${v.id} から${t}文を盗んだ`, 2, s);
        } else if (r < 0.19) c.doom(s, '路地の闇に消えた');
        else c.log(s, '路地を抜けた');
      }
    },
  },
  {
    id: 'onsen', name: '湯けむりの宿', glyph: '湯', text: '湯けむりの立つ宿。ここで少し休める。', w: 5, risk: 0,
    run(g, c) {
      for (const s of g) {
        if (s.form !== 'human' && c.r() < 0.4) { c.setForm(s, 'human'); c.log(s, '湯に浸かって人の姿に戻った'); }
        else if (c.has(s, 'doll') && c.r() < 0.3) { c.take(s, 'doll'); c.log(s, '人形を湯に流した'); }
        else c.log(s, '湯に浸かって休んだ');
      }
    },
  },
  {
    id: 'rest', name: '道端', glyph: '休', text: '道端の石に腰かける。', w: 6, risk: 0,
    run(g, c) {
      for (const s of g) {
        const r = c.r();
        if (r < 0.03) c.gainLog(s, c.ri(5, 15), '通りすがりの誰かに', 'もらった');
        else if (r < 0.04 && c.give(s, 'doll')) c.log(s, '気づくと隣に人形が座っていた');
        else c.log(s, '道端で休んだ');
      }
    },
  },
  {
    id: 'thunder', name: '雷の丘', glyph: '雷', text: '雷が落ち続ける丘。頂で何かが光っている。', w: 5, risk: 2, from: 2,
    run(g, c) {
      for (const s of g) {
        const um = c.has(s, 'umbrella');
        if (c.risk(s, um ? 0.6 : 0.2, um ? '掲げた傘に雷が落ちた' : '雷に打たれた')) continue;
        if (c.r() < 0.3) { c.give(s, 'bell'); c.log(s, '丘の頂で金の鈴を拾った'); }
        else c.gainLog(s, c.ri(20, 40), '雷の丘を越え、');
      }
    },
  },
  {
    id: 'moonboat', name: '月への舟', glyph: '舟', text: '月まで行くという舟。帰りの舟は見当たらない。', w: 3, risk: 3, from: 3, night: 2,
    run(g, c) {
      for (const s of g) {
        const r = c.r();
        if (r < 0.03) {
          c.give(s, 'moon');
          c.log(s, '月に触れ、かけらを持ち帰った');
          c.note(`#${s.id} が月のかけらを持ち帰った`, 3, s);
        } else if (r < 0.38) c.kill(s, '月へ行ったきり戻らなかった');
        else c.gainLog(s, c.ri(20, 50), '月を眺めて戻り、舟底で');
      }
    },
  },
  {
    id: 'stars', name: '星降る野', glyph: '星', text: '空から星が降ってくる。', w: 6, risk: 1,
    run(g, c) {
      for (const s of g) {
        const r = c.r();
        if (r < 0.025) c.doom(s, '降ってきた星に当たった');
        else if (r < 0.035) {
          c.setGold(s, s.gold * 10 + Math.round(50 * c.D));
          c.log(s, '流れ星に願いをかけ、金が十倍になった');
          c.note(`#${s.id} の願いが流れ星に届いた`, 3, s);
        } else if (r < 0.3) c.gainLog(s, Math.round(8 * Math.exp(c.r() * 2.6)), '星のかけらを集め、', 'になった');
        else c.log(s, '星を見上げた');
      }
    },
  },
  {
    id: 'oni', name: '鬼の腕相撲', glyph: '鬼', text: '鬼が腕相撲の相手を探している。', w: 5, risk: 1, from: 2,
    run(g, c) {
      for (const s of g) {
        if (s.form !== 'human') { c.log(s, '鬼に笑われて相手にされなかった'); continue; }
        const r = c.r();
        if (r < 1 / 6) {
          c.setGold(s, s.gold * 3 + Math.round(30 * c.D));
          c.log(s, '鬼に腕相撲で勝ち、金が三倍になった');
          if (c.r() < 0.2) {
            c.give(s, 'horn'); c.log(s, '鬼の角を折り取った');
            c.note(`#${s.id} が鬼の角を手に入れた`, 2, s);
          }
        } else if (r < 0.23) c.doom(s, '鬼に投げ飛ばされて消えた');
        else {
          const t = Math.floor(s.gold / 2);
          if (t) c.add(s, -t);
          c.log(s, t ? `腕相撲に負け、${t}文取られた` : '腕相撲に負けた');
        }
      }
    },
  },
  {
    id: 'well', name: '古井戸', glyph: '井', text: '底の見えない井戸。小判の音がする。', w: 5, risk: 2,
    run(g, c) {
      for (const s of g) {
        if (c.r() >= 0.5) { c.log(s, '井戸を覗き込んだだけだった'); continue; }
        if (s.form === 'bird') { c.gainLog(s, c.ri(100, 180), '井戸の底まで舞い降り、', '見つけた'); continue; }
        if (c.risk(s, 0.45, '井戸の底へ落ちていった')) continue;
        c.gainLog(s, c.ri(100, 180), '井戸に落ちたが、底で', '見つけた');
      }
    },
  },
  {
    id: 'twins', name: '二股の道', glyph: '双', text: '道が二つに分かれ、また一つに戻っている。', w: 4, risk: 0, from: 1,
    run(g, c) {
      for (const s of g) {
        const r = c.r();
        if (r < 0.18) c.split(s, '分かれ道で二人になった', '分かれ道で生まれた');
        else if (r < 0.22) c.kill(s, '分かれ道の向こうへ行ったまま戻らなかった');
        else c.log(s, '二股の道を抜けた');
      }
    },
  },
  {
    id: 'pawn', name: '質屋', glyph: '質', text: 'なんでも買い取る質屋。奥で狸が算盤を弾いている。', w: 4, risk: 0, from: 1,
    run(g, c) {
      for (const s of g) {
        const sell = s.items.filter((k) => ITEMS[k].kind !== 'curse');
        let total = 0;
        for (const k of sell) { c.take(s, k); total += ITEMS[k].value; }
        if (total) c.add(s, total);
        let msg = sell.length ? `質屋で持ち物を売り、${total}文を受け取った` : '質屋に売るものがなかった';
        if (c.has(s, 'doll')) {
          const fee = Math.round(20 * c.D);
          if (s.gold >= fee) { c.add(s, -fee); c.take(s, 'doll'); msg += `。人形は${fee}文払って引き取ってもらった`; }
          else msg += '。人形は引き取りを断られた';
        }
        c.log(s, msg);
      }
    },
  },
  {
    id: 'yomi', name: '黄泉の渡し', glyph: '冥', text: '黄泉の渡し。舟守が黙って手を差し出している。', w: 3, risk: 0, from: 3, night: 2,
    run(g, c) {
      const fee = Math.round(40 * c.D);
      for (const s of g) {
        if (s.gold < fee) { c.log(s, '舟守は首を横に振った'); continue; }
        c.add(s, -fee);
        const pool = c.run.dead;
        if (pool.length && c.r() < 0.5) {
          const d = c.pick(pool);
          c.revive(d);
          c.log(s, `${fee}文払い、黄泉から #${d.id} を連れ戻した`);
          c.log(d, `#${s.id} に黄泉から連れ戻された`);
          c.note(`#${s.id} が黄泉から #${d.id} を連れ戻した`, 1, d);
        } else c.log(s, `${fee}文払ったが、誰も戻らなかった`);
      }
    },
  },
  {
    id: 'tengu', name: '天狗の森', glyph: '天', text: '天狗が木の上からこちらを見下ろしている。', w: 4, risk: 2, from: 2,
    run(g, c) {
      for (const s of g) {
        if (c.r() >= 0.22) { c.log(s, '天狗の森を抜けた'); continue; }
        if (c.r() < 0.5) c.doom(s, '天狗に攫われ、空から落とされた');
        else c.gainLog(s, c.ri(150, 250), '天狗に攫われ、宝の山から', '分けてもらった');
      }
    },
  },
  {
    id: 'shadow', name: '影踏み', glyph: '影', text: '自分の影が勝手に歩き出した。', w: 5, risk: 1,
    run(g, c) {
      for (const s of g) {
        const r = c.r();
        if (r < 0.12 && s.gold > 0) { c.setGold(s, 0); c.log(s, '影に財布を持ち去られた'); }
        else if (r < 0.24 && s.gold > 0) { c.setGold(s, s.gold * 2); c.log(s, '影が同じだけの金を拾ってきた'); }
        else if (r < 0.27) c.split(s, '影がもう一人の私になった', '影から生まれた');
        else c.log(s, '影を踏んで遊んだ');
      }
    },
  },
  {
    id: 'sake', name: '酒蔵', glyph: '酒', text: '甘い匂いの漂う酒蔵。', w: 4, risk: 1,
    run(g, c) {
      for (const s of g) {
        const r = c.r();
        if (r < 0.05) c.doom(s, '酒樽に落ちて浮かんでこなかった');
        else if (r < 0.45 && s.gold > 0) {
          const m = c.r() * 3;
          c.setGold(s, s.gold * m);
          c.log(s, m > 1 ? '酔って目が覚めると、金が増えていた' : '酔って目が覚めると、金が減っていた');
        } else c.gainLog(s, c.ri(5, 15), '酒をひと口もらい、ついでに', 'もらった');
      }
    },
  },
  {
    id: 'kura', name: '無人の蔵', glyph: '蔵', text: '誰もいない蔵。床に金が散らばっている。', w: 3, risk: 2, from: 2,
    run(g, c) {
      const n = g.length;
      if (n > 20) {
        c.note(`${n}人で踏み込んだので蔵の床が抜けた`, 1);
        for (const s of g) if (!c.risk(s, 0.4, '抜けた床から奈落へ落ちた')) c.log(s, '抜けた床の縁にしがみついて助かった');
        return;
      }
      for (const s of g) c.gainLog(s, c.ri(100, 200), 'そっと蔵に忍び込み、');
    },
  },
  {
    id: 'ferry', name: '渡し舟', glyph: '渡', text: '小さな渡し舟が一艘だけ。', w: 5, risk: 2,
    run(g, c) {
      c.shuffle(g.slice()).forEach((s, i) => {
        if (i < 8) { c.gainLog(s, c.ri(20, 40), '渡し舟に乗れて、対岸で'); return; }
        if (s.form === 'bird') { c.log(s, '舟の上を飛んで渡った'); return; }
        if (!c.risk(s, s.form === 'cat' ? 0.45 : 0.25, '舟に乗れず、川で溺れた')) c.log(s, '舟に乗れず、泳いで渡った');
      });
    },
  },
  {
    id: 'toro', name: '灯籠流し', glyph: '灯', text: '川面を灯籠がゆっくり流れていく。', w: 4, risk: 0,
    run(g, c) {
      for (const s of g) {
        if (c.r() < 0.3 && c.give(s, 'lantern')) c.log(s, '流れてきた灯籠を拾った');
        else c.gainLog(s, c.ri(3, 12), '灯籠を流し、川辺で');
      }
    },
  },
  {
    id: 'crow', name: '烏の森', glyph: '烏', text: '烏たちが光り物を狙っている。', w: 4, risk: 0, from: 1,
    run(g, c) {
      for (const s of g) {
        const tr = s.items.filter((k) => ITEMS[k].kind === 'treasure');
        if (tr.length && c.r() < 0.4) {
          const k = c.pick(tr);
          c.take(s, k);
          c.log(s, `烏に${ITEMS[k].name}を奪われた`);
          if (k === 'moon' || k === 'scale') c.note(`#${s.id} が烏に${ITEMS[k].name}を奪われた`, 2, s);
        } else if (c.r() < 0.08) {
          const k = c.pickW([['pearl', 5], ['bell', 5], ['horn', 1]]);
          c.give(s, k);
          c.log(s, `烏が${ITEMS[k].name}を落としていった`);
        } else if (s.gold > 0 && c.r() < 0.2) {
          const t = Math.ceil(s.gold * 0.3);
          c.add(s, -t);
          c.log(s, `烏に${t}文くわえて行かれた`);
        } else c.log(s, '烏に睨まれながら森を抜けた');
      }
    },
  },
];
