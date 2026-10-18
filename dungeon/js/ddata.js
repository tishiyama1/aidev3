// 百人の迷宮:部屋・装備・覚醒・迷宮の主・層の異変の定義。

export const CATS = { beast: '獣', trap: '罠', dark: '闇', magic: '魔' };
export const ELEMS = { holy: '聖', fire: '炎', ice: '氷', thunder: '雷' };

// slot: weapon / armor / charm。tier が高いほど深い層で出る。
export const GEAR = {
  rusty: { slot: 'weapon', name: '錆びた剣', glyph: '錆', atk: 2, tier: 1 },
  steel: { slot: 'weapon', name: '鋼の剣', glyph: '鋼', atk: 5, tier: 2 },
  axe: { slot: 'weapon', name: '戦斧', glyph: '斧', atk: 7, tier: 2 },
  demon: { slot: 'weapon', name: '魔剣', glyph: '魔', atk: 11, tier: 3 },
  holy: { slot: 'weapon', name: '聖剣', glyph: '聖', atk: 8, elem: 'holy', tier: 3 },
  fire: { slot: 'weapon', name: '炎の斧', glyph: '炎', atk: 8, elem: 'fire', tier: 3 },
  ice: { slot: 'weapon', name: '氷の槍', glyph: '氷', atk: 8, elem: 'ice', tier: 3 },
  thunder: { slot: 'weapon', name: '雷の弓', glyph: '雷', atk: 8, elem: 'thunder', tier: 3 },
  dragonspear: { slot: 'weapon', name: '竜殺しの槍', glyph: '槍', atk: 15, tier: 4 },
  leather: { slot: 'armor', name: '革鎧', glyph: '革', def: 0.85, tier: 1 },
  chain: { slot: 'armor', name: '鎖帷子', glyph: '鎖', def: 0.7, tier: 2 },
  plate: { slot: 'armor', name: '板金鎧', glyph: '鎧', def: 0.55, tier: 3 },
  dragonmail: { slot: 'armor', name: '竜鱗の鎧', glyph: '鱗', def: 0.4, tier: 4 },
  amulet: { slot: 'charm', name: 'お守り', glyph: '守', save: true, tier: 1 },
  beastward: { slot: 'charm', name: '獣除けの鈴', glyph: '鈴', cat: 'beast', tier: 1 },
  trapward: { slot: 'charm', name: '罠避けの紐', glyph: '紐', cat: 'trap', tier: 1 },
  lamp: { slot: 'charm', name: '聖なる灯', glyph: '灯', cat: 'dark', tier: 2 },
  sigil: { slot: 'charm', name: '護符', glyph: '符', cat: 'magic', tier: 2 },
  banner: { slot: 'charm', name: '英雄の旗', glyph: '旗', fameMul: 2, tier: 3 },
};
export const GEAR_ORDER = Object.keys(GEAR);

// 覚醒。名前だけで効果が想像できるものにする。
export const SKILLS = {
  immortal: { name: '不死身', glyph: '不' },
  warrior: { name: '一騎当千', glyph: '千' },
  foresight: { name: '予知', glyph: '予' },
  inspire: { name: '鼓舞', glyph: '鼓' },
  trapper: { name: '罠師', glyph: '罠' },
  nightsight: { name: '夜目', glyph: '夜' },
  tamer: { name: '獣使い', glyph: '獣' },
  healer: { name: '癒し手', glyph: '癒' },
  lucky: { name: '強運', glyph: '運' },
  slayer: { name: '竜殺し', glyph: '殺' },
  vessel: { name: '勇者の器', glyph: '器' },
  shadow: { name: '影歩き', glyph: '影' },
  treasure: { name: '宝探し', glyph: '宝' },
  guardian: { name: '守護者', glyph: '護' },
  berserker: { name: '狂戦士', glyph: '狂' },
};
export const SKILL_ORDER = Object.keys(SKILLS);

export const BOSSES = {
  lich: { name: '骨の王', glyph: '骸', weak: 'holy', special: 'doom', specialName: '死の宣告', tell: '骨の王が名を呼ぼうとしている……' },
  dragon: { name: '炎竜', glyph: '竜', weak: 'ice', special: 'inferno', specialName: '業火', tell: '炎竜が大きく息を吸い込んだ……' },
  eye: { name: '深淵の目', glyph: '眼', weak: 'thunder', special: 'madness', specialName: '狂気の凝視', tell: '深淵の目がゆっくりと開いていく……' },
  queen: { name: '百足の女王', glyph: '蟲', weak: 'fire', special: 'poison', specialName: '毒の雨', tell: '天井から何かが滴りはじめた……' },
};

// 層の異変。斥候か予知がなければ見えない。
export const MODS = {
  beasts: { name: '獣が猛る層', text: '獣の気配が濃い。', cat: 'beast', mul: 1.6, w: 3 },
  undead: { name: '死者の層', text: '冷たい風が吹いている。', cat: 'dark', mul: 1.6, w: 3 },
  arcane: { name: '魔力の渦', text: '空気が震えている。', cat: 'magic', mul: 1.6, awaken: 2, w: 2 },
  bounty: { name: '実りの層', text: '床に古い財宝が散らばっている。', loot: 2, w: 2 },
  calm: { name: '静かな層', text: '不思議なほど静かだ。', all: 0.7, w: 2 },
  cursed: { name: '呪われた層', text: '壁に無数の爪痕がある。', all: 1.3, awaken: 3, w: 2 },
};

// kind:
//   fight  … 集団戦。人数と戦力が多いほど一人あたりの危険が下がる(power が敵の強さ)
//   hazard … 一人ずつの危険
//   safe   … 危険なし
// base は基本の死亡率、loot は宝の期待数、fame は生還者が得る名声。
export const ROOMS = [
  { id: 'beast', name: '獣の巣', glyph: '獣', text: '獣の唸り声と骨の山。', kind: 'fight', cat: 'beast', base: 0.3, power: 120, loot: 0.7, fame: 1, w: 10 },
  { id: 'bones', name: '骸骨の回廊', glyph: '骨', text: '鎧を着た骸骨が列をなしている。', kind: 'fight', cat: 'dark', base: 0.3, power: 130, loot: 0.7, fame: 1, w: 9 },
  { id: 'sorcerer', name: '呪術師の間', glyph: '呪', text: '紫の炎の向こうで、誰かが詠唱している。', kind: 'fight', cat: 'magic', base: 0.35, power: 150, loot: 1, fame: 2, w: 7, from: 2 },
  { id: 'traps', name: '罠の廊下', glyph: '罠', text: '床石の色がところどころ違う。', kind: 'hazard', cat: 'trap', base: 0.18, loot: 0.5, fame: 1, w: 9 },
  { id: 'pit', name: '底なしの穴', glyph: '穴', text: '穴の底で何かが光っている。', kind: 'hazard', cat: 'trap', base: 0.4, loot: 2, tier: 1, fame: 3, w: 5, from: 2 },
  { id: 'darkway', name: '闇の通路', glyph: '闇', text: '松明の火が吸い込まれていく。', kind: 'hazard', cat: 'dark', base: 0.2, loot: 0.5, fame: 1, w: 7 },
  { id: 'wyrm', name: '竜の幼体', glyph: '竜', text: '眠る竜の子。腹の下に宝が見える。', kind: 'fight', cat: 'beast', base: 0.45, power: 320, loot: 2, tier: 1, fame: 5, w: 4, from: 4 },
  { id: 'vault', name: '宝物庫', glyph: '宝', text: '鍵の壊れた宝箱がいくつも並んでいる。', kind: 'special', cat: 'trap', loot: 2, w: 6 },
  { id: 'spring', name: '癒しの泉', glyph: '泉', text: '澄んだ水が湧いている。', kind: 'safe', w: 4 },
  { id: 'altar', name: '古い祭壇', glyph: '祭', text: '名もない神の祭壇。', kind: 'special', w: 5 },
  { id: 'forge', name: '鍛冶場', glyph: '鍛', text: 'まだ火の残る炉と金床。', kind: 'safe', w: 3 },
  { id: 'training', name: '訓練場', glyph: '訓', text: '打ち込み用の木人が並んでいる。', kind: 'safe', w: 3 },
  { id: 'stele', name: '碑文の間', glyph: '碑', text: '壁一面に古い文字が刻まれている。', kind: 'hazard', cat: 'magic', base: 0.08, loot: 0, fame: 1, w: 5 },
  { id: 'scout', name: '斥候の道', glyph: '斥', text: '細い抜け道。大勢では通れそうにない。', kind: 'hazard', cat: 'trap', base: 0.08, crowd: 0.02, loot: 0, fame: 1, w: 6 },
  { id: 'prisoners', name: '捕らわれた冒険者', glyph: '囚', text: '檻の中から助けを呼ぶ声がする。', kind: 'fight', cat: 'beast', base: 0.25, power: 110, loot: 0, fame: 2, w: 5, from: 1 },
  { id: 'library', name: '禁書庫', glyph: '書', text: '開いてはいけない本が並んでいる。', kind: 'hazard', cat: 'magic', base: 0.25, loot: 0.3, fame: 2, awaken: 6, w: 4, from: 3 },
  { id: 'fork', name: '分かれ道', glyph: '岐', text: '道が幾筋にも分かれている。', kind: 'special', w: 4 },
];
