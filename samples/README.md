# alpha-visualizer 同梱サンプルデータ

> **日本語版** / [English](./README.en.md)

このディレクトリには alpha-visualizer の動作確認用サンプルデータと、その決定論的な再生成スクリプトが格納されています。

## 概要

`samples/sample-forge/` は `vis serve --forge-dir samples/sample-forge` ですぐに起動できる、完結した forge プロジェクトです。同梱データは **完全に合成** されており、実在する金融商品の価格データを一切含みません。再配布フリー・商用利用フリー（MIT ライセンス）です。

> Step 1 時点では骨格のみ。サンプルデータ本体は後続ステップで生成されます。

## 起動

```bash
uv run vis serve --forge-dir samples/sample-forge --no-open
```

## 再生成

```bash
uv run python samples/build_samples.py
```

スクリプトは seed 固定で完全に決定論的に動作します。再実行しても同じ DB バイト列が出力されます。

## 構造（最終形・予定）

```
samples/
├── README.md                          # 本ファイル
├── README.en.md                       # 英語版
├── build_samples.py                   # 決定論的再生成スクリプト
├── _generators/                       # 内部モジュール群（直接呼び出し非推奨）
│   ├── synthetic_ohlcv.py             # 銘柄ごとのレジーム合成 OHLCV
│   ├── strategy_defs.py               # 8 戦略 JSON の手書き複製
│   ├── pseudo_backtest.py             # 40 ラン擬似バックテスト生成
│   ├── pseudo_wfo.py                  # Walk-Forward Optimization 擬似結果
│   ├── pseudo_grid.py                 # Grid 最適化擬似結果
│   ├── compatibility_matrix.py        # 戦略 × 銘柄 相性表
│   └── writers.py                     # SQLite/JSON/YAML 書き出し
└── sample-forge/                      # vis serve --forge-dir のターゲット
    ├── forge.yaml
    └── data/
        ├── results/backtest_results.db
        ├── strategies/*.json          # 8 ファイル
        └── ideas/ideas.json
```

## ライセンスと注意書き

- 本サンプルは **完全に合成** で、実在する金融商品の価格データを一切含みません。
- 銘柄シンボルは `_SYNTH` サフィックス必須です（`EQUITY_SYNTH`, `INDEX_SYNTH`, `COMMODITY_SYNTH`, `FX_SYNTH`, `CRYPTO_SYNTH`）。`AAPL` や `BTC` 等の実銘柄との取り違えは避けてください。
- 同梱する 8 戦略はテクニカル指標の **教科書的な組み合わせのみ**（SMA / RSI / MACD / Bollinger / ADX / Donchian）で、商用最適化や HMM 系は含みません。
- 商用バックテストエンジン・最適化・本番運用には [alpha-forge](https://github.com/ysakae/alpha-forge)（商用ライセンス）をご利用ください。
