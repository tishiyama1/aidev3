# 百人の私

眠るたびに、夢の中で百人に分かれる。
目覚めるとき、生き残った私の中から誰か一人が「本当の私」になる。

運を一回のサイコロではなく、自分で形を作る「確率の分布」として扱うブラウザゲームです。

## 遊ぶ

ビルドは不要です。静的ファイルをそのまま配信します。

```sh
python3 -m http.server 8000
# http://localhost:8000/ を開く
```

ES Modules を使っているため、`index.html` をファイルとして直接開くのではなく、HTTP で配信してください。

## GitHub Pages で公開する

1. このリポジトリを GitHub に push する
2. リポジトリの Settings → Pages → Build and deployment で
   Source を「Deploy from a branch」、Branch を公開したいブランチの `/ (root)` にする
3. 数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で遊べる

外部サービスは Google Fonts だけです(読み込めない場合は端末の明朝体で表示されます)。進行状況はブラウザの localStorage に保存されます。

## ファイル構成

| パス | 内容 |
|---|---|
| `index.html` / `css/style.css` | 画面 |
| `js/data.js` | 道・持ち物・姿・夜の異変の定義 |
| `js/sim.js` | ゲームの中身(DOM に依存しない) |
| `js/crowd.js` | 群衆と並びの帯の描画 |
| `js/audio.js` | Web Audio で合成する効果音 |
| `js/main.js` | 画面遷移と演出 |
| `tools/balance.mjs` | 戦略ボットで十夜を何千回も回すバランス検証 |
| `tools/playtest.cjs` / `tools/fullrun.cjs` | Playwright による通し動作確認 |

```sh
node tools/balance.mjs 1000      # 戦略ごとの得点分布
NODE_PATH=$(npm root -g) node tools/fullrun.cjs "http://localhost:8000/?fast" /tmp/shots
```

URL に `?fast` を付けると演出が速くなります(動作確認用)。

<details>
<summary>設計メモ(ネタバレを含みます)</summary>

- ゲーム内にルール説明はありません。プレイヤーは群衆の動きと結果から仕組みを見つけます。
- 道の多くは一人ずつ独立に結果を引きますが、人数で結果が変わる道があります(祭・大蛇・王を探す村・崩れかけた橋・無人の蔵・渡し舟)。狼は一番小さな群れを襲います。
- 目覚めたときは生存者から一様に一人を選ぶので、貧しい私を危険な道へ送るほど、豊かな私が選ばれやすくなります。この「生存者バイアス」を使う戦略は有効ですが、人数が必要な出来事や全滅(悪夢)の危険とぶつかるように調整しています。
- 選ばれた私の道具・呪い・姿(猫や鳥)は次の夜の百人全員に引き継がれます。
- バランスの目安(`tools/balance.mjs`):単純な戦略は平均 4,000〜5,000 文、先読みするボットは平均 8,500 文前後でした。上手さで期待値はおよそ二倍になりますが、同じ戦略でも上位一割と下位一割で三倍近い差が出ます。

</details>
