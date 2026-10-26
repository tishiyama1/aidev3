// 冒険者の名前と外見。ゲームの判定には使わない(見た目と物語のためだけ)。

const NAMES = `ハヤテ アカネ イオリ ウツギ エニシ オボロ カエデ キリ クオン ケイ コハク サクヤ シグレ スズ セツナ ソラ
タキ チトセ ツバキ トウマ ナギ ニシキ ヌイ ネネ ノワキ ハク ヒスイ フブキ ホムラ マシロ ミナセ ムツキ メイ
モミジ ヤクモ ユズリハ ヨル ライ リン ルリ レン ロウ ワカバ アサギ イサナ カゲロウ キョウ クロガネ コトハ
サザレ シノ スバル ゼン ソウゲツ タマキ チカゲ ツユ トキワ ナツメ ニイロ ハルカ ヒバリ フジ ホタル マトイ
ミヤビ ムクロ ヤエ ユウギリ ヨイ ラン リョウ ルカ レイ ロッカ ワタリ アマネ イブキ ウタ オウカ カナタ キサラ
ゲン コノハ サイ シズク スイ セイラン ソウ タケル チヨ ツムギ トワ ナオ ハヅキ ヒナタ フウガ ホノカ マユ ミコト
モリ ヤマト ユキ ヨシノ リク アオイ イチカ カイ クレハ コウ サネ ジン タツミ テン ナミ ハヤト ヒイロ マコト
ミツル ユラ リツ アヤメ イズミ オリエ カスミ キヨ ゴロウ シオン タエ`.split(/\s+/).filter(Boolean);

// 外套の色(くすんだ染料の色)
export const CLOAKS = ['#7a3b2e', '#3f5a6e', '#4f6b45', '#6b5a3a', '#5a3f5e', '#8a6a3a', '#3a4a4a', '#6e2f3f', '#4a4f6e', '#7b6e5a'];
export const HAIRS = ['#1c1714', '#3b2a1e', '#5a3d24', '#8a7a6a', '#2a2a30', '#6b2a1e'];
export const SKINS = ['#e8c8a6', '#d9b08a', '#c79a74', '#b5835e'];
// 0:素顔 1:頭巾 2:兜 3:角兜 4:鉢巻
export const HEADS = 5;

export function hash(a, b) {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (b + 0x7f4a7c15), 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

// 遠征ごとに名前の並びを混ぜ、同じ遠征の中では重ならないようにする
function order(seed) {
  const idx = NAMES.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = hash(seed, i) % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

const cache = new Map();
export function nameFor(seed, n) {
  if (!cache.has(seed)) cache.set(seed, order(seed));
  const o = cache.get(seed);
  const base = NAMES[o[(n - 1) % NAMES.length]];
  const gen = Math.floor((n - 1) / NAMES.length);
  return gen ? `${base}${['', '二', '三', '四'][gen] || gen + 1}` : base;
}

export function lookFor(seed, n) {
  const h = hash(seed, n * 7919);
  return {
    cloak: h % CLOAKS.length,
    hair: (h >>> 4) % HAIRS.length,
    skin: (h >>> 8) % SKINS.length,
    head: (h >>> 12) % HEADS,
    torch: ((h >>> 16) % 7) === 0, // 七人に一人ほどが松明を掲げる
  };
}
