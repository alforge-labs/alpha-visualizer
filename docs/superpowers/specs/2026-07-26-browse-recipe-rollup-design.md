# ブラウズ画面のレシピ・ロールアップ — 設計

- 日付: 2026-07-26
- 対象: `alpha-visualizer` ブラウズページ（`/browse`）フロントエンドのみ
- 状態: 設計承認済み・実装計画待ち
- 位置づけ: ブラウズ画面刷新 3 部作の **第 1 部（SP1）**

## 背景と問題

ブラウズ画面が実運用データ（475 戦略）で機能していない。実測値は次のとおり（`alpha-strategies` を `--forge-dir` に指定し 1440×900 で計測）。

| 計測項目 | 実測値 |
|---|---|
| 戦略数 | 475 |
| ページ全高 | 43,483px（**48.3 画面分**） |
| 表の 1 行目に到達するまでのスクロール量 | 2,657px（約 3 画面） |
| 銘柄アトラスの高さ | 1,999px |
| 表の 1 行の高さ | 86px |
| DOM ノード数 | 7,887（ページング・仮想化なし） |

しかし行数以上に深刻なのは中身である。

| 内訳 | 件数 |
|---|---|
| バックテスト未実行（全指標列が `—` の空行） | **325 件 / 68%** |
| Sharpe ≥ 1.0 | 26 件（5.5%） |
| Sharpe ≥ 1.5 | 5 件（1.1%） |
| 同名で区別不能な戦略 | 324 件が 116 グループに該当（最大 **15 件が完全同名**） |
| symbol 列が空欄 | 334 件（うち **311 件は `target_symbols` から判明済み**、真に不明は 23 件） |

現状は「3 件の当たりを、449 行のノイズと 325 行の空行の中から探す」画面になっている。行高の圧縮やページングの追加では解決しない。

### 同名 15 件の正体

`AMD EMA+ SuperTrend Trend Following v1` は 15 件存在する。中身を確認すると、すべて同一レシピ（AMD × EMA × SuperTrend）のパラメータ違いで、`/explore-strategies` の反復ラン（`repeat` / `repeat2` / `repeat3` / `gate_recheck` / `post917`）が生成した `_optimized` 出力だった。

```
amd_ema_st_v1_optimized                ema_fast=23 ema_slow=80 st_length=14 …
amd_ema_st_v2_optimized                ema_fast=10 ema_slow=40 st_length=14 …
amd_ema_st_repeat_v1_optimized         ema_fast=25 ema_slow=80 st_length=14 …
amd_ema_st_gate_recheck_v1_optimized   ema_fast=28 ema_slow=75 st_length=12 …
…（計 15 件、うちバックテスト実行済みは 1 件のみ）
```

**表示単位が `strategy_id` である必要はない。** 利用者が知りたいのは「AMD × EMA × SuperTrend の最良は Sharpe いくつか（何試行中か）」であり、15 行に分けて並べる情報価値はない。これが本設計の中心的な洞察である。

## ゴール

ブラウズ画面を、475 戦略の実データで「今どれが一番良いか」を判断できる画面にする。

**成功条件**

1. 実データ（475 戦略）でページ全高が **8,000px 未満**
2. 表の 1 行目が **700px 以内**に現れる
3. 同一レシピの複数試行が 1 行に畳まれ、展開すると個別 `strategy_id` が見える
4. レシピ行の指標は**単一 variant の実測値**であり、列ごとの最大値を混ぜた合成値ではない
5. 既定で未実行を除外するが、除外件数を常時表示し、トグルで復帰できる
6. `symbol` 列の空欄 311 件が `target_symbols` で埋まる
7. 既存機能（比較チェックボックス・スライドパネル・ソート・グループ・レンズ）が回帰しない

## 3 部作の分割

本 spec は SP1 のみを対象とする。SP2 / SP3 は個別に spec を書く。

| | 内容 | 単体での成果 |
|---|---|---|
| **SP1（本 spec）** | レシピ・ロールアップ、未実行の既定除外、行圧縮、クローム圧縮、`symbol` フォールバック、`strategy_id` 表示 | 475 行 → 136 行。48 画面 → 7 画面 |
| SP2 | カバレッジモード（銘柄 × レシピのマトリクス）。銘柄アトラスを正式に置換 | 「次に何を回すか」が分かる |
| SP3 | 整理モード（未実行 scaffold 235 件・孤児 run 116 ID・重複名 116 グループ・Sharpe < 0 の 38 件）＋ 削除実行。`alpha-forge` に孤児 run 掃除コマンドを新設 | 死蔵を実際に消せる |

## 非ゴール（SP1 で意図的に含めないもの）

| 項目 | 理由 |
|---|---|
| 3 モードタブのシェル | 切り替え先が 1 つしかないタブバーは投機的な抽象化。SP2 で 2 つ目のモードができた時点で導入する |
| 行の仮想化 | 136 行 × 44px なら不要。導入するとスクリーンショット撮影と E2E が難しくなるだけで、削減効果はロールアップと既定フィルタが既に出している |
| レンズバー（`SavedViews`）の変更 | 50px。2,657px の問題の 2% に過ぎず、既存機能を壊すリスクの方が大きい。触らない |
| グループトグル（`GroupByToggle`）の変更 | 48px。同上。レシピ行に対しても既存のグループ化ロジックはそのまま機能する |
| バックエンド API の変更 | 475 戦略で 209KB の一括レスポンスは解析が瞬時で、ボトルネックは DOM 側。ロールアップは既に取得済みのデータからフロントで計算できる |
| 戦略の削除 | SP3 の範囲。破壊的操作は独立した spec とレビューに分ける |

## アーキテクチャ

```
GET /api/strategies  →  StrategyListItem[] （475 件・209KB・変更なし）
        │
        ▼
lib/recipes.ts（新規・純関数）
  buildRecipes(items) → Recipe[]
    キー: (name, 実効銘柄, timeframe)
    各 Recipe = { key, name, symbol, timeframe, variants[], best, runCount }
        │
        ▼
hooks/useStrategyList.ts
  既存の filter → sort を通した items からレシピを構築
  includeUnrun（URL param）で未実行のみのレシピを出し入れ
        │
        ▼
components/browser/StrategyTable.tsx（分割）
  RecipeRow      … 折り畳み時の 1 行（best variant の実測値）
  VariantRow     … 展開時の子行（strategy_id を主表示）
  StrategyTableFooter … 表示/除外件数の開示
```

`alpha-forge` にも `alpha-visualizer` のバックエンドにも変更を入れない。SP1 はフロントエンド単独で完結する。

## レシピの定義

### ロールアップキー

`(name, 実効銘柄, timeframe)` の 3 つ組。

`name` 単独では不十分であることを実データで確認した。6 グループが別銘柄を含み、たとえば `KAMA + RSI(loose) + 4h Trend + Tight Trailing SL` は AUDUSD / EURUSD / GBPUSD / USDJPY の 4 通貨ペアにまたがる。これを 1 行に潰すと別物が混ざる。

| キー | レシピ数 | 実行実績あり | 正しさ |
|---|---|---|---|
| `name` のみ | 267 | 130 | 別銘柄が混ざる（6 グループ） |
| `(name, 実効銘柄, timeframe)` | **275** | **136** | 正しい |

`timeframe` は現データでは 1 グループも分割しない（同名で時間軸が異なる例はゼロ）。それでもキーに含める。同名・同銘柄で 1d と 1h があれば、それは異なるレシピだからである。

### 実効銘柄

```
実効銘柄 = item.symbol || item.target_symbols[0] || null
```

`item.symbol` は最新バックテストが実際に回した銘柄、`target_symbols[0]` は戦略定義上の対象銘柄。**実行済みなら実際に回した銘柄が真**なので、この優先順を逆にしてはならない。

`??` ではなく `||` を使う。API は `None` を返すため通常は `null` だが、空文字列が来た場合も定義側へフォールバックさせたい（`??` は空文字列を通してしまう）。`target_symbols` が空配列のとき `[0]` は `undefined` になるので、最後に `|| null` で正規化する。

この修正の副次的効果として、銘柄フィルタの選択肢が 35 → 46 に増える。

### best variant の選択

```
best = variants の中で latest_sharpe が最大のもの（null は候補外）
       同値の場合は last_run_at が新しいもの
       実行済み variant が 1 つも無ければ null
```

**レシピ行に表示する指標（return / max DD / profit factor / win rate / 最終実行 / sparkline）は、すべて `best` という単一 variant から取る。** 列ごとに max / min を取ると、実在しない戦略の成績を合成表示することになる。これは目に見えないため、テストで固定する（下記「テスト戦略」参照）。

### 集計値

| フィールド | 意味 |
|---|---|
| `variantCount` | レシピに属する戦略数（例: 15） |
| `runCount` | うちバックテスト実行済みの数（例: 1） |
| `best` | 上記の単一 variant、または `null` |

行には `15 試行中 1 件実行` の形で両方を出す。AMD の例では 15 試行あるのに 1 件しか回っていないことが一目で分かり、これは SP3 の整理対象の予告にもなる。

## 画面の構成

### 高さの内訳

現状の値はすべて実データで DOM 実測したもの（推定ではない）。

| 要素 | 現状（実測） | SP1 後 | 差 |
|---|---|---|---|
| 銘柄アトラス | 1,999px | 既定で折り畳み（約 40px） | **−1,959** |
| ヒーロー（eyebrow + h1 + 説明文 + 統計 + リンク） | 346px | 統計を横一列に集約（約 140px） | −206 |
| `FilterBar`（検索 + 銘柄 35 チップ 3 段 + 時間軸 3 チップ + 数値 2 つ） | 160px | チップ折り畳みで 1 段に（約 60px） | −100 |
| レンズ（`SavedViews`） | 58px | 変更なし | 0 |
| グループトグル | 58px | 変更なし | 0 |
| skip-link + nav + footer | 120px | 変更なし | 0 |
| 表本体 | 40,785px（475 行・1 行あたり平均 86px） | 136 行 × 44px = 5,984px | **−34,801** |
| **ページ全高** | **43,483px** | **約 6,460px** | **−85%** |

### ヒーローの圧縮

現在の h1「登録済みの戦略を一覧する」と 2 行の説明文（「最新のバックテスト結果を一覧で比較し…」）は初回利用者向けのオンボーディング文で、日常利用では場所を取るだけである。

- **削除**: 説明文。初回利用者への案内は既存の空状態（`alpha-vis serve --use-bundled-samples` と AlphaForge への誘導）が担っており、失われない
- **維持**: `Heroline` の統計（戦略数 / 銘柄数 / 最高 Sharpe / 7 日以内の実行数）。これは日常的に有用
- **縮小**: h1 を 1 行に収まるサイズへ。eyebrow は維持

### 銘柄アトラスの折り畳み

1,999px の `SymbolAtlas` を `<details>` 相当のトグルで既定折り畳みにする。**削除はしない** — SP2 でカバレッジモードが正式な置き場所になるまで、機能を失わせないため。

### 銘柄チップの折り畳み

`FilterBar` は 35 個の銘柄をすべてチップとして描画し 3 段に折り返している（実効銘柄の導入後は 46 個に増える）。これを既定折り畳みのグループにし、ラベルに件数を出す（`銘柄で絞る（46）`）。選択中のチップがある場合は展開状態を初期値とする（選択が見えないまま絞られている状態を作らない）。

### 未実行トグル

`FilterBar` に「未実行を含める」チェックボックスを追加する。URL param（`include_unrun=1`）で表現し、既存のフィルタと同じく共有可能にする。

## 行の設計

### 現状の 86px の内訳

`StrategyRow` は戦略名（`--serif` 1.0625rem）と、その下に銘柄・時間軸の `Chip` を縦に積む 2 段構成で、`padding: 14px 12px` が付く。

### SP1 の 44px 構成

名前・ID・銘柄・時間軸を 1 行に収める。名前は `text-overflow: ellipsis` で切り、`title` 属性に全文を入れる（`マルチアセット HMM×BB+RSI v1 (原油 CL=F)` のような長い名前があるため）。

```
▸ AMD EMA+ SuperTrend Trend Following v1   AMD 1d  0.76  +12.4%  -18.2%  1.84  58.3%  2026-04-13  ∿
  15 試行中 1 件実行
```

`padding` を `14px` → `8px` にし、フォントサイズは維持する（可読性を犠牲にしない）。

### レシピ行と variant 子行

- レシピ行に `variantCount > 1` なら展開トグル（`▸` / `▾`）を出す。`variantCount === 1` のレシピは展開する意味がないのでトグルを出さない
- 展開時は variant を `latest_sharpe` 降順で子行として描画。子行は `strategy_id` を主表示にする（同名 15 件では ID が唯一の識別子）
- 展開状態は `StrategyTable` のローカル state。URL には持たせない（既存の `collapsedKeys` と同じ方針）
- 比較チェックボックスは **variant 行に置く**。比較対象は個別戦略であり、レシピは比較できない。レシピ行のチェックボックスは `best` variant を選ぶショートカットとする。`best` が `null`（未実行のみのレシピ）の場合、比較しても指標が無く無意味なのでチェックボックスを `disabled` にする

### 詳細への遷移

レシピ行の名前リンクは `best` variant の `/detail/{id}` へ向ける。`best` が `null`（未実行のみのレシピ）の場合は最初の variant へ向ける。

## Fail Loud — 隠したものは必ず数える

既定で未実行を除外するが、黙って切ってはならない。フッタに常時表示する。

```
136 レシピ表示 / 全 275 レシピ（未実行のみ 139 レシピを非表示）· 475 戦略
```

フィルタが効いている場合はそれも合わせて反映する。現在のフッタ（`${items.length}件 / 全${total}件`）を置き換える。

## 変更ファイル

| ファイル | 変更 |
|---|---|
| `frontend/src/lib/recipes.ts` | **新規**。`buildRecipes` / `effectiveSymbol` / `pickBestVariant` の純関数 |
| `frontend/src/lib/__tests__/recipes.test.ts` | **新規**。ロールアップの単体テスト |
| `frontend/src/hooks/useStrategyList.ts` | `recipes` と `includeUnrun` を state に追加 |
| `frontend/src/components/browser/StrategyTable.tsx` | 601 行。レシピ行・variant 子行・44px 化。**行コンポーネントを別ファイルへ分割**（現状に追加すると 800 行を超える） |
| `frontend/src/components/browser/RecipeRow.tsx` | **新規**（`StrategyTable.tsx` からの分割） |
| `frontend/src/components/browser/VariantRow.tsx` | **新規**（同上） |
| `frontend/src/screens/BrowseScreen.tsx` | ヒーロー圧縮、銘柄アトラス折り畳み |
| `frontend/src/components/browser/FilterBar.tsx` | 銘柄チップ折り畳み、未実行トグル |
| `frontend/src/components/browser/Heroline.tsx` | 横一列レイアウトへ |
| `tests/fixtures/build_e2e_fixture.py` | 多 variant レシピ・未実行戦略を含む行を追加 |
| `frontend/e2e/specs/browse.spec.ts` | ロールアップ・展開・件数開示の E2E |
| `docs/screenshots/{ja,en}/browse.png` | 再撮影 |

`StrategyTable.tsx` の分割は本設計に必要な範囲に限る。既存の `GroupHeaderRow` や空状態は移動しない。

## テスト戦略

### `lib/recipes.ts` の単体テスト（判別力が要る箇所）

1. **別銘柄が混ざらない** — 同名で銘柄が違う 2 件が別レシピになる。`name` のみをキーにする実装へ退行させると落ちる
2. **best variant の指標が列混合でない** — Sharpe 最大の variant と return 最大の variant を別にしたデータで、行が Sharpe 最大 variant の return を返すことを固定する。列ごとに `Math.max` を取る実装では落ちる
3. **実効銘柄の優先順** — `symbol` と `target_symbols[0]` が異なる item で `symbol` が採られる。逆順にすると落ちる
4. **未実行のみのレシピ** — `best === null` かつ `runCount === 0`。`includeUnrun` が false のとき除外される
5. **同値 Sharpe のタイブレーク** — `last_run_at` が新しい方が best になる
6. **`timeframe` がキーに含まれる** — 同名・同銘柄で 1d と 1h が別レシピになる

上記 2 と 3 は、実装を単純化した際に静かに壊れうる箇所であり、ablation（実装を退行させてテストが落ちることの確認）を実装計画に含める。

### フッタ件数のテスト

表示件数・全レシピ数・除外件数が、与えたデータから機械的に導かれることを固定する。ハードコードした期待値ではなく、fixture から計算した値と比較する。

### E2E / スクリーンショット

`build_e2e_fixture.py` の現行 fixture は戦略数が少なくロールアップを検証できない。次を追加する。

- 3 variant を持つレシピ 1 件（うち 2 件実行済み・1 件未実行）
- 全 variant 未実行のレシピ 1 件
- 同名・別銘柄の 2 件（キーの正しさを画面で確認できるように）
- `symbol` が空で `target_symbols` のみ持つ戦略 1 件

fixture の金額・指標は**手打ちせず** equity 系列から導出する。前回（PR #332）、手打ちした fixture が実データでは起こらない矛盾を生み、撮影した PNG を目視して初めて気付いた経緯がある。

`db.py` のスキーマは変更しないため fixture drift は起こらない。`samples/build_samples.py` は `tests/fixtures/build_e2e_fixture.py` と独立で、スキーマ変更を伴わない本変更では再生成不要である（スキーマを変えた場合は両方の再生成が必要になる）。

## リスクと対応

| リスク | 対応 |
|---|---|
| ロールアップで既存の比較・スライドパネルが壊れる | 比較は variant 行に置き、対象が常に個別戦略であることを保つ。E2E に既存フローの回帰テストを含める |
| `StrategyTable.tsx` の分割で挙動が変わる | 分割は行コンポーネントの切り出しのみ。既存テスト（`StrategyTable.test.tsx`）を先に通してから分割する |
| 44px 化で可読性が落ちる | フォントサイズは変えず `padding` のみ削る。実データのスクリーンショットで目視確認する |
| ヒーローの説明文削除が初回利用者に不利 | 空状態のオンボーディング文が残ることを E2E で確認する |
| 銘柄アトラスの折り畳みが「消えた」と誤認される | ラベルに件数を出す（`銘柄アトラス（46 銘柄）`）。SP2 で正式に置換する |

## 検証基準（実装完了の判定）

1. 実データ 475 戦略でページ全高 < 8,000px、表の 1 行目 < 700px（Playwright で実測）
2. フッタの件数が実データと一致（136 / 275 / 139 / 475）
3. `AMD EMA+ SuperTrend Trend Following v1` が 1 行で表示され、展開すると 15 件の `strategy_id` が出る
4. `symbol` 列の空欄が 334 → 23 件に減る
5. `uv run pytest tests/ -q` / `uv run ruff check src/ tests/` が通る
6. `cd frontend && pnpm run build`（`tsc -b && vite build`）が exit 0
7. `pnpm vitest run` / `pnpm run lint` が通る
8. `pnpm run screenshots` が全件通り、`browse.png` が再撮影される
