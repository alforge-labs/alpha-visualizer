# alpha-visualizer 同梱サンプルデータ

> **日本語版** / [English](./README.en.md)

`samples/sample-forge/` は alpha-visualizer の動作確認用に同梱された **自己完結型** の forge プロジェクトです。すべて **完全に合成** されたデータで、再配布フリー（MIT）・商用利用フリーです。

## 起動方法

```bash
# パッケージインストール後（PyPI または editable install）
uv run alpha-vis serve --use-bundled-samples --no-open

# またはパスを明示
uv run alpha-vis serve --forge-dir samples/sample-forge --no-open
```

ブラウザで `http://127.0.0.1:8000` を開くと、以下が確認できます：

- **Browse 画面**: 40 件のバックテスト結果（戦略 × 銘柄）の一覧と並べ替え／フィルタ
- **Detail 画面**: 任意の 1 ランの equity curve・ドローダウン・トレード一覧
- **WFO 画面**: 2 件の Walk-Forward Optimization 結果（IS/OOS の安定性）
- **Optimize 画面**: 2 件の Grid 最適化結果（パラメータヒートマップ）
- **Compare 画面**: 任意の複数戦略を並列比較
- **Ideas 画面**: 5 件のサンプル戦略アイデアメモ

## サンプルデータの内訳

| 項目 | 件数 | 備考 |
|------|------|------|
| 銘柄（合成 OHLCV） | 5 | `EQUITY_SYNTH`, `INDEX_SYNTH`, `COMMODITY_SYNTH`, `FX_SYNTH`, `CRYPTO_SYNTH` |
| 戦略 | 8 | SMA / RSI / MACD / Bollinger / Range / Supertrend / EMA-ADX-MACD / Donchian |
| バックテストラン | 40 | 8 戦略 × 5 銘柄、5 年分（1250 営業日） |
| WFO 最適化ラン | 2 | sma_crossover × EQUITY、supertrend_adx × CRYPTO |
| Grid 最適化ラン | 2 | rsi_reversion × INDEX、bbands_breakout × COMMODITY |
| アイデアメモ | 5 | linked_strategies で同梱戦略へ動線 |
| DB サイズ | 約 5.1 MB | 8 MB 予算内 |

### 銘柄のキャラクター（5 銘柄）

| 銘柄 | 期待 MDD | 期待 Total Return | ストーリー |
|------|----------|-------------------|------------|
| `EQUITY_SYNTH` | -42% | +29% | calm-bull → 2008 風 crash → recovery |
| `INDEX_SYNTH` | -41% | +57% | 長期 calm → 2020 風 V 字回復 |
| `COMMODITY_SYNTH` | -44% | +76% | sideways → spike → blow-off → slow bleed |
| `FX_SYNTH` | -14% | +20% | 全期間 mean-reverting（AR(1) ノイズ） |
| `CRYPTO_SYNTH` | -85% | +157% | bubble → crash × 2 + flash-crash → recovery |

### 戦略一覧（8 戦略）

| ID | 種別 | 主要指標 |
|----|------|----------|
| `sma_crossover_v1` | トレンド | SMA 20/60 クロス |
| `rsi_reversion_v1` | 逆張り | RSI 30/70 |
| `macd_crossover_v1` | トレンド | MACD(12,26,9) シグナル交差 |
| `bbands_breakout_v1` | ブレイクアウト | Bollinger Bands(20, 2.0) |
| `range_reversion_v1` | 逆張り（フィルタ付き） | BBands 下限 + ADX |
| `supertrend_adx_v1` | トレンド（フィルタ付き） | Supertrend + ADX |
| `ema_adx_macd_v1` | トレンド（複合） | EMA(50) + ADX + MACD |
| `donchian_turtle_v1` | ブレイクアウト | Donchian 20/10（タートル風） |

HMM / MTF / 最適化済みパラメータといった商用差別化要素は **含みません**。

## 再生成

```bash
uv run python samples/build_samples.py
```

スクリプトは seed 固定で完全に決定論的に動作します。再実行しても同じバイトの DB ファイル・JSON が出力されます（CI で `git diff --exit-code` を回す前提）。

## ディレクトリ構成

```
samples/
├── README.md                          # 本ファイル
├── README.en.md                       # 英語版
├── build_samples.py                   # 決定論的再生成スクリプト
├── _generators/                       # 内部モジュール群（直接呼び出し非推奨）
│   ├── synthetic_ohlcv.py             # 銘柄レジーム合成 OHLCV
│   ├── strategy_defs.py               # 8 戦略 JSON 定義
│   ├── pseudo_backtest.py             # 40 ラン擬似バックテスト
│   ├── pseudo_wfo.py                  # Walk-Forward Optimization 擬似結果
│   ├── pseudo_grid.py                 # Grid 最適化擬似結果
│   ├── compatibility_matrix.py        # 戦略 × 銘柄 相性表
│   ├── ideas_defs.py                  # 5 件のサンプルアイデア
│   └── writers.py                     # SQLite/JSON/YAML 書き出し
└── sample-forge/                      # alpha-vis serve --forge-dir のターゲット
    ├── forge.yaml
    └── data/
        ├── results/backtest_results.db
        ├── strategies/*.json          # 8 ファイル
        └── ideas/ideas.json
```

## ライセンスと注意書き

- 本サンプルは **完全に合成** で、実在する金融商品の価格データを一切含みません。
- 銘柄シンボルは `_SYNTH` サフィックス必須です。`AAPL` や `BTC` 等の実銘柄との取り違えは避けてください。
- 同梱する 8 戦略はテクニカル指標の **教科書的な組み合わせのみ**（SMA / RSI / MACD / Bollinger / ADX / Donchian）で、商用最適化や HMM 系は含みません。
- 商用バックテストエンジン・本格的な最適化・本番運用には [AlphaForge](https://alforgelabs.com)（商用ライセンス）をご利用ください。
