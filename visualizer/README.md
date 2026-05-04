# AlphaForge — Backtest Viewer

Vite + React + TypeScript 製のバックテスト結果ビューワー。FastAPI ダッシュボード (`src/alpha_forge/dashboard/`) に SPA としてマウントされ、`forge dashboard` 一発で API + UI が起動する。

## 特徴

- **4 画面**: Backtest（5タブ：Equity / Metrics / Monthly / Trades / Monte Carlo）/ Walk-Forward / Strategy Compare / IS-OOS
- **3 バリエーション**: `Atlas`（サイドバー）/ `Terminal`（高密度ターミナル）/ `Clarity`（カードレイアウト）
- **Light / Dark テーマ** ＋ **JA/EN i18n**（TopBar から即時切替・URL パラメータ対応）
- **リアルデータ + モックフォールバック**: API オフラインでもモック (`src/mock/btData.ts`) で全画面を描画

## 開発

```bash
# 1) 依存をインストール
npm install

# 2) FastAPI バックエンドを起動 (別ターミナル)
cd ..
FORGE_CONFIG=../alpha-strategies/forge.yaml uv run forge dashboard --port 8000 --no-open

# 3) Vite dev server (HMR、`/api` は 8000 にプロキシ)
cd visualizer
npm run dev
# → http://localhost:5173
```

別の API ホストを使いたい場合は `VITE_API_PROXY=http://other:9000 npm run dev`。

## ビルド

```bash
npm run build
```

`build.outDir = ../src/alpha_forge/dashboard/static/` に成果物を出力するため、ビルドだけで FastAPI 経由の SPA 配信が更新される。

## URL パラメータ

| パラメータ | 例 | 内容 |
|---|---|---|
| `?run_id=<run_id>` | `?run_id=migrated_bbands_rsi_range_v1_AAPL` | 単一バックテスト詳細 |
| `?strategy_id=<id>` | `?strategy_id=ema_cross_v1` | WFO ウィンドウ表示 |
| `?ids=a,b,c` | `?ids=ema_cross_v1,rsi_rev_v1` | 戦略横断比較 |
| `?theme=light\|dark` | `?theme=light` | テーマ初期値の上書き |
| `?variation=atlas\|terminal\|clarity` | `?variation=terminal` | レイアウト初期値の上書き |
| `?lang=ja\|en` | `?lang=en` | 言語初期値の上書き |
| `?density=comfortable\|compact` | `?density=compact` | 密度初期値の上書き |

設定は `localStorage` (`alphaforge.viewer.settings.v1`) にも保存される。

## ディレクトリ構成

```
visualizer/src/
├── main.tsx / App.tsx
├── styles/tokens.css       # CSS 変数 (--bg / --accent / --text 等)
├── i18n/strings.ts         # JA/EN ペア辞書
├── api/                    # client.ts, types.ts (BacktestDetail / WFO / ...)
├── hooks/                  # useTheme, useBacktest, useWFO, useCompare
├── mock/btData.ts          # オフライン用モックデータ
├── components/
│   ├── TopBar.tsx / Sidebar.tsx / VariationBadge.tsx / common.tsx
│   ├── charts/             # EquityChart / DrawdownChart / MonthlyHeatmap / WFOTimeline / MAEMFEScatter / MonteCarloChart
│   ├── metrics/            # MetricsGrid / SignalQualityBadge / CompareTable / ISOOSMetrics
│   └── trades/TradeTable.tsx
└── screens/                # BacktestScreen / WFOScreen / CompareScreen / ISOOSScreen
```

## デザインソース

`claude.ai/design` の handoff バンドルから移植。元のプロトタイプ（HTML + CDN React + Babel standalone）を Vite + TypeScript に再構成しつつ、見た目とインタラクションは寸分違わず維持している。
