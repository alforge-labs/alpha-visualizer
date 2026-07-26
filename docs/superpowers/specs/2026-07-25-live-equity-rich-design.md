# Live ページ Equity 表示のリッチ化 — 設計

- 日付: 2026-07-25
- 対象: `alpha-visualizer` Live ページ（`/live`）＋ `alpha-forge` `live replay`
- 状態: 設計承認済み・実装計画待ち

## 背景と問題

Live ページの Equity 表示は素の `Sparkline` と開始／終了日ラベルだけで、軸・数値・インタラクションが一切ない。投資家が最初に知りたい「いくらになったか」「市場に勝てているか」「今何を持っているか」のいずれにも答えられていない。

一方 Detail ページには `EquityDrawdownPaneTV`（TradingView 製・ドローダウンペイン／ベンチマーク線／viewport 同期／PNG 出力／a11y データ表）が既にあり、Live からは使われていない。

## ゴール

Live ページを、combine portfolio の運用状況を投資家目線で判断できる画面にする。

**成功条件**

1. 現在評価額・累計損益・現在ドローダウンが数値で読める
2. 市場指数およびバックテストとの優劣が一目で分かる
3. エクイティ推移が軸・グリッド・ツールチップ付きで読める
4. 現在の建玉構成（銘柄・数量・構成比・含み損益）が分かる
5. 旧 DB（新列なし）でもクラッシュせず、ベンチマークなしとして描画される

## 非ゴール（意図的に含めない）

| 項目 | 理由 |
|---|---|
| 主要ドローダウン期間テーブル | 現状データは 51 日・最大 DD 0.71%。上位 3 件を並べてもノイズ。ドローダウンペインと最大 DD カードで足りる |
| 月次リターンヒートマップ | 実績 2 ヶ月弱では升目が 2 つしか埋まらない。運用 1 年超で再検討 |
| ローリング Sharpe | 34 点では窓が取れない |
| CSV 出力 | 今回の成功条件に寄与しない。必要になった時点で `lib/csv.ts` を流用すれば足りる |

## アーキテクチャ

```
alpha-forge live replay --benchmark QQQ --initial-capital 1000000 [--compare]
  │
  ├─ receipts → position 系列 + cash 系列                （既存）
  ├─ equity = initial_capital + cash 増減 + 建玉評価額     （既存）
  ├─ benchmark_equity : 指数 B&H を live 期間で正規化      （新規）
  ├─ backtest_equity  : combine エンジンの合算 equity を切出し・正規化（新規）
  └─ positions        : 最終建玉 + 現金                   （新規）
        │
        ▼  live_position_summaries に 3 列追加
   benchmark_equity_json / backtest_equity_json / positions_json
        │
        ▼  visualizer は SQLite を読むだけ（alpha-forge 非依存を維持）
   LiveDataRepository → schemas/live.py → LivePositionView
```

### 設計上の決定

**正規化の基準を揃える**: 3 系列とも「live 開始時点 = `initial_capital`」に正規化する。同一軸に乗り、乖離がそのまま超過リターンとして読める。

**backtest_equity は再計算しない**: `CombinedStrategyBacktestEngine.run()` は既に合算 equity（`combined.value`）を返しており、`--compare` 時に metrics だけ取って捨てている。切り出して正規化するだけでよい。したがって `backtest_equity` は `--compare` 指定時のみ入る。

**建玉は再構築値であることを明示する**: visualizer は DB のみを読むため、ブローカーの現在建玉ではなくイベントからの再構築値になる。実測で GLD に +2 株の差異が出ている（`/status` の実口座値とは別物）。UI に注記を置く。

**ベンチマーク欠損で replay 全体を失敗させない**: 指数の価格データが無い場合は警告してベンチマークだけ落とし、replay は成功させる。ベンチマークは付加情報であり、これで全体を落とすのは筋が悪い。

## 画面構成

投資家が見る順序（いくらになったか → 市場に勝てているか → どう推移したか → 何を持っているか）に沿って並べる。

1. **KPI 行** — 現在評価額（＋前日比）／累計損益（額・%）／現在 DD（＋ピークからの日数）／計測期間
2. **超過リターン** — vs 指数 B&H、vs バックテスト（pt 表記）

各値の定義を以下に固定する。equity 系列を `e[0..n-1]`、日付を `d[0..n-1]` とする。

| 項目 | 定義 |
|---|---|
| 現在評価額 | `e[n-1]` |
| 前日比 | `e[n-1] / e[n-2] - 1`。`n < 2` なら非表示 |
| 累計損益（額） | `e[n-1] - initial_capital` |
| 累計損益（%） | `e[n-1] / e[0] - 1`。`e[0]` は live 開始時点なので `initial_capital` に等しい |
| 現在 DD | `e[n-1] / max(e[0..n-1]) - 1`（0 以下） |
| ピークからの日数 | `d[n-1] - d[argmax(e)]` の暦日数 |
| 計測期間 | `d[n-1] - d[0]` の暦日数と `d[0]` の日付 |
| 超過リターン | 累計リターンの差。`(e[n-1]/e[0] - 1) - (b[n-1]/b[0] - 1)` をパーセントポイントで表示 |
| 構成比 | `銘柄の評価額 / (建玉評価額合計 + 現金)` |
3. **エクイティ＋ドローダウンペイン** — Live／指数 B&H／BT combine の 3 系列、系列トグル、PNG 出力、a11y データ表
4. **指標カード（既存）** — トータルリターン／CAGR／シャープ／最大 DD／ボラティリティ（BT 比較付き）
5. **建玉テーブル** — 銘柄・数量・平均取得単価・現在値・評価額・構成比・含み損益、合計行（建玉合計／現金）、再構築値の注記

現状は資産の約 90% が現金である。これは combine の建玉サイジングが $100k 基準のままで $1M 口座に対して小さいためで、表示上の不具合ではなく実態。5 で構成比を出すことでこの事実が可視化される。

## バックエンド（alpha-forge）

### 追加データ

| キー | 内容 | 前提 |
|---|---|---|
| `benchmark_equity` | `[(iso, value)]` | `--benchmark` または `forge.yaml` 指定時 |
| `backtest_equity` | `[(iso, value)]` | `--compare` 時 |
| `positions` | 銘柄・数量・平均取得単価・現在値・評価額・構成比・含み損益 ＋ 現金 | 常時 |

**平均取得単価**は移動平均原価法で receipts から算出する。買い: `(cost × qty + price × q) / (qty + q)`、売り: 数量のみ減らし単価は据え置き。

### 設定と CLI

```yaml
# forge.yaml（新設セクション）
live:
  benchmark: "QQQ"
```

`config.py` に `LiveConfig` を追加する。`live replay --benchmark SPY` で都度上書きでき、どちらも未指定ならベンチマーク線を出さない（後方互換）。

### スキーマとマイグレーション

`live_position_summaries` に 3 列追加する。

```
+ benchmark_equity_json  TEXT
+ backtest_equity_json   TEXT
+ positions_json         TEXT
```

`metadata.create_all()` は既存テーブルに列を追加しない。既存の `backtest_results.db` にはこのテーブルが既に存在するため、これだけでは INSERT が `table has no column named ...` で落ちる。`backtest/db_repository.py` に既にある流儀を踏襲し、`__init__` で `ALTER TABLE ... ADD COLUMN` を試みて `duplicate column name` のみ握り潰す。

## フロントエンド（alpha-visualizer）

### `EquityDrawdownPaneTV` の拡張

```ts
export interface EquityOverlay {
  label: string
  values: number[]
  color?: string
  dashed?: boolean
}
```

`overlays?: EquityOverlay[]` を追加する。既存の `benchmark` / `showBenchmark` は据え置きで、`BacktestScreen` / `ISOOSScreen` は無改修。

`useEquityViewport` の入力を `{ equity, dates, benchmark, overlays }` に拡張し、`sliceByRange` が overlays も同一インデックスでスライスするようにする。ここを共通化しないとレンジ切替時に系列間で日付がずれる。

Live からは `isCutoffIdx = 0` を渡す（`makeCutoffMarkers` は `cutoffIdx <= 0` でマーカーなし）。

### 責務分離（ADR-0001 / ADR-0002 準拠）

| ファイル | 役割 |
|---|---|
| `lib/liveEquity.ts` | ドローダウン系列・現在 DD・ピーク経過日数・前日比・超過リターン・構成比の純粋関数 |
| `components/live/LiveKpiRow.tsx` | KPI 行 ＋ 超過リターン |
| `components/live/LivePositionsTable.tsx` | 建玉テーブル |
| `components/live/LivePositionView.tsx` | 組み立て（既存を刷新） |

`LivePositionView` は現在 200 行超で、分割せずに追加すると 400 行級になる。上記の分割で各ファイルを 100〜150 行に収める。

### visualizer 側スキーマ

`db.py` に同 3 列（nullable）を追加し、`repositories/live.py` でパース、`schemas/live.py` に型を定義、`pnpm run gen` で TS 型を再生成する。旧 DB（列なし）では 500 を返さず「ベンチマークなし」として描画する。

## テスト戦略

**純粋関数（`lib/liveEquity.test.ts`）** — 中心。空配列・1 点・全同値（ゼロ除算）、ドローダウンが `[0, -x, 0]` の形になること、超過リターンの符号（Live が上回れば正）、前日比が直近 2 点であることを検証する。

**後方互換（最重要）** — `LivePositionView.test.tsx` に、ベンチマーク・建玉が `null` の旧 DB 応答でクラッシュせず KPI とチャートが描画されるケースを置く。列を追加した以上、既存 DB を読む経路が必ず存在する。

**共有コンポーネント** — `EquityDrawdownPaneTV` の既存テスト（ビジュアル回帰含む）が無改修で通ることを回帰の番人とし、`overlays` を渡したときに系列が増えることを追加検証する。

**Python** — `test_replay_combine.py` に `benchmark_equity` / `backtest_equity` / `positions` の検証、`test_portfolio_alert_replay.py` に移動平均原価法の検証（買い増しで加重平均、売却で単価据え置き）。CLI は `--benchmark` の伝播・`forge.yaml` 既定値・未指定時 `None` を検証する。

## CI 上の注意

| 項目 | 対応 |
|---|---|
| `db.py` のスキーマ変更 | `E2E fixture drift check` と `OSS sample-forge drift check` が落ちる。`tests/fixtures/build_e2e_fixture.py` と `samples/build_samples.py` を再生成してコミットする |
| Live ページの見た目変更 | `visual-regression` ジョブが落ちる。`pnpm run screenshots` で `docs/screenshots/{ja,en}/` を再撮影する |
| alpha-forge は PR に CI が走らない | マージ前にローカルで `pytest` / `ruff` / `mypy` / `generate_codemap.py --check` を実行する |

## PR 構成

alpha-forge → alpha-visualizer の順にマージする（visualizer が読む列を先に作る必要がある）。ドキュメントは `alforge-labs/mkdocs_src` の `cli-reference/live.md`（`--benchmark`）と `alpha-visualizer/features.md`（Live ページ）を同一 PR で更新する。
