# alpha-visualizer — Backtest Viewer (frontend)

Vite + React + TypeScript 製のバックテスト結果ビューワー。`alpha-visualizer` パッケージの FastAPI バックエンド (`src/alpha_visualizer/`) に SPA としてマウントされ、`vis serve` 一発で API + UI が起動する。

## 特徴

- **3 ページ**: Browse（戦略一覧）/ Detail（4 タブ：Backtest / IS-OOS / WFO / Run History）/ Compare（戦略比較）
- **2 バリエーション**: **Atelier**（Light, クリーム × テラコッタ。anthropic.com 風のエディトリアル）/ **Lab**（Dark, 深いプラム × 温かい琥珀。研究機関の計器パネル風）
- **JA / EN i18n**（DetailToolbar のトグル・URL パラメータ・localStorage で永続化）
- **チャート 2 段構え（ハイブリッド方針）**:
  - **金融時系列**（Equity / Drawdown / WFO window 等）は [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts) (Apache 2.0) を採用予定。multi-pane 時間軸同期・クロスヘア・スムーズスクロール・対数スケールを標準装備。PoC として `BacktestScreen` の Equity + Drawdown を実装（feature flag `?tv=1` / `VITE_USE_LIGHTWEIGHT_CHARTS=1` で切替、安定確認後にデフォルト化予定）。詳細は issue #180。
  - **分析プロット**（MonthlyHeatmap / CorrelationHeatmap / ReturnDistribution / AnnualReturnsBar 等）は引き続き [visx](https://airbnb.io/visx/) ベース。SVG 描画と a11y、ヒートマップやスキャッターの自由度を優先。
- **リアルデータ + モックフォールバック**: API オフラインでもモック (`src/mock/btData.ts`) で全画面を描画

## 開発

```bash
# 1) 依存をインストール (visx の transitive peer 解決のため strict-peer-dependencies=false を .npmrc で設定)
pnpm install

# 2) FastAPI バックエンドを起動 (別ターミナル、リポジトリルートから)
cd ..
uv run vis serve --forge-dir /path/to/alpha-strategies --port 8000

# 3) Vite dev server (HMR、`/api` は 8000 にプロキシ)
cd frontend
pnpm run dev
# → http://localhost:5173
```

別の API ホストを使いたい場合は `VITE_API_PROXY=http://other:9000 pnpm run dev`。

## ビルド

```bash
pnpm run build
```

`build.outDir = ../src/alpha_visualizer/static/` に成果物を出力するため、ビルドだけで FastAPI 経由の SPA 配信が更新される。

## URL パラメータ

| パラメータ | 例 | 内容 |
|---|---|---|
| `?run_id=<run_id>` | `?run_id=migrated_bbands_rsi_range_v1_AAPL` | 単一バックテスト詳細 |
| `?strategy_id=<id>` | `?strategy_id=ema_cross_v1` | WFO ウィンドウ表示 |
| `?ids=a,b,c` | `?ids=ema_cross_v1,rsi_rev_v1` | 戦略横断比較 |
| `?theme=light\|dark` | `?theme=light` | テーマ初期値の上書き（参考。Variation が主軸） |
| `?variation=atelier\|lab` | `?variation=lab` | バリエーション初期値の上書き |
| `?lang=ja\|en` | `?lang=en` | 言語初期値の上書き |
| `?density=comfortable\|compact` | `?density=compact` | 密度初期値の上書き |

旧バリエーション (`atlas` / `terminal` / `clarity`) は **廃止**。未知値は `atelier` にフォールバックする。設定は `localStorage` (`alphaforge.viewer.settings.v1`) にも保存される。

## デザインシステム

| 役割 | トークン |
|---|---|
| Type families | `--serif` (Source Serif 4) / `--sans` (Inter Tight) / `--mono` (JetBrains Mono) ※全て **OFL 1.1 セルフホスト**（[`THIRDPARTY_FONTS.md`](./THIRDPARTY_FONTS.md)） |
| Type scale | `--fs-display` / `--fs-h1` / `--fs-h2` / `--fs-h3` / `--fs-body` / `--fs-caption` / `--fs-mono-sm` |
| 背景 / 表面 | `--bg` / `--bg2` / `--surface` / `--surface-2` |
| テキスト | `--text` / `--text2` / `--text3` |
| 罫線 | `--border` / `--border-h` |
| アクセント | `--accent` / `--accent-strong` / `--accent-glow` / `--accent-bg` |
| 意味色 | `--success` / `--warn` / `--danger` |
| Spacing | `--space-1..8`（4px ベース） |
| Radius | `--radius-xs/sm/md/lg/pill` |
| Motion | `--motion-fast/base/stage` |

トークン定義は `src/design/tokens.css`。各値は `[data-variation="atelier"]` と `html[data-variation="lab"]` のスコープで切り替わる。共通プリミティブは `src/design/primitives/`（Card / SectionHeader / TabBar / Tab / Stat / Pill / Chip / Button / Toolbar / Divider / KeyValue）。

## ディレクトリ構成

```
visualizer/src/
├── main.tsx / router.tsx
├── design/
│   ├── tokens.css            # CSS 変数（Atelier / Lab）
│   ├── useChartTheme.ts      # tokens.css を JS から読むフック
│   └── primitives/           # 共通 UI プリミティブ
├── charts/visx/              # visx 製チャート（MonthlyHeatmap / 分析プロット）。Equity/Drawdown 旧実装も flag 撤去まで残置
├── charts/tv/                # TradingView lightweight-charts 製チャート（issue #180）。EquityDrawdownPaneTV と純粋ヘルパー
├── components/
│   ├── DetailToolbar.tsx / StrategyHero.tsx / MetricsSummaryBarV2.tsx
│   ├── browser/              # Browse 画面用テーブル・パネル
│   ├── charts/               # 残りのチャート（Rolling / ReturnDistribution / ...）
│   ├── metrics/              # MetricsGrid / SignalQualityBadge / CompareTable / ISOOSMetrics
│   └── trades/TradeTable.tsx
├── pages/                    # BrowsePage / DetailPage / ComparePage
├── screens/                  # BacktestScreen / WFOScreen / CompareScreen / ISOOSScreen
├── hooks/                    # useTheme / useBacktest / useStrategyList
├── api/                      # client.ts / types.ts
├── i18n/strings.ts           # JA/EN ペア辞書
└── mock/btData.ts            # オフライン用モックデータ
```
