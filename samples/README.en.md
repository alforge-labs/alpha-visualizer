# alpha-visualizer Bundled Sample Data

> [日本語](./README.md) / **English**

`samples/sample-forge/` is a **self-contained** forge project bundled with alpha-visualizer for out-of-the-box demos. All data is **fully synthetic** — redistribution-free and commercial-use-free under the MIT license.

## Launch

```bash
# After installing the package (from PyPI or as editable install)
uv run alpha-vis serve --use-bundled-samples --no-open

# Or specify the path explicitly
uv run alpha-vis serve --forge-dir samples/sample-forge --no-open
```

Open `http://127.0.0.1:8000` to explore:

- **Browse**: 40 backtest results (strategy × symbol) with sortable columns and filters
- **Detail**: equity curve, drawdown, and trade list for any individual run
- **WFO**: 2 Walk-Forward Optimization runs (IS/OOS stability check)
- **Optimize**: 2 Grid search runs (parameter heatmap)
- **Compare**: side-by-side comparison of multiple strategies
- **Ideas**: 5 sample strategy ideas with links to bundled strategies

## Dataset Contents

| Item | Count | Notes |
|------|-------|-------|
| Synthetic OHLCV symbols | 5 | `EQUITY_SYNTH`, `INDEX_SYNTH`, `COMMODITY_SYNTH`, `FX_SYNTH`, `CRYPTO_SYNTH` |
| Strategies | 8 | SMA / RSI / MACD / Bollinger / Range / Supertrend / EMA-ADX-MACD / Donchian |
| Backtest runs | 40 | 8 strategies × 5 symbols, 5 years (1250 business days) |
| WFO optimization runs | 2 | sma_crossover × EQUITY, supertrend_adx × CRYPTO |
| Grid optimization runs | 2 | rsi_reversion × INDEX, bbands_breakout × COMMODITY |
| Idea memos | 5 | `linked_strategies` link to bundled strategies |
| DB size | ~5.1 MB | within the 8 MB budget |

### Symbol Character (5 symbols)

| Symbol | Expected MDD | Expected Total Return | Story |
|--------|--------------|----------------------|-------|
| `EQUITY_SYNTH` | -42% | +29% | calm-bull → 2008-style crash → recovery |
| `INDEX_SYNTH` | -41% | +57% | long calm → 2020-style V-shaped recovery |
| `COMMODITY_SYNTH` | -44% | +76% | sideways → spike → blow-off → slow bleed |
| `FX_SYNTH` | -14% | +20% | mean-reverting AR(1) throughout |
| `CRYPTO_SYNTH` | -85% | +157% | bubble → crash × 2 + flash-crash → recovery |

### Strategies (8 strategies)

| ID | Type | Key Indicators |
|----|------|----------------|
| `sma_crossover_v1` | trend | SMA 20/60 crossover |
| `rsi_reversion_v1` | reversion | RSI 30/70 |
| `macd_crossover_v1` | trend | MACD(12,26,9) signal cross |
| `bbands_breakout_v1` | breakout | Bollinger Bands(20, 2.0) |
| `range_reversion_v1` | reversion (filtered) | BBands lower + ADX |
| `supertrend_adx_v1` | trend (filtered) | Supertrend + ADX |
| `ema_adx_macd_v1` | trend (composite) | EMA(50) + ADX + MACD |
| `donchian_turtle_v1` | breakout | Donchian 20/10 (turtle-style) |

HMM, MTF, and proprietary optimized parameters are **excluded** by design.

## Regenerate

```bash
uv run python samples/build_samples.py
```

The script is fully deterministic — re-running it produces byte-identical DB files and JSON (the CI runs `git diff --exit-code` to enforce this).

## Layout

```
samples/
├── README.md                          # 日本語版
├── README.en.md                       # this file
├── build_samples.py                   # deterministic regeneration script
├── _generators/                       # internal modules (do not call directly)
│   ├── synthetic_ohlcv.py             # per-symbol regime-based OHLCV synthesis
│   ├── strategy_defs.py               # 8 strategy JSON definitions
│   ├── pseudo_backtest.py             # 40-run pseudo backtest generation
│   ├── pseudo_wfo.py                  # WFO pseudo results
│   ├── pseudo_grid.py                 # Grid pseudo results
│   ├── compatibility_matrix.py        # strategy × symbol compatibility table
│   ├── ideas_defs.py                  # 5 sample ideas
│   └── writers.py                     # SQLite / JSON / YAML writers
└── sample-forge/                      # target for `alpha-vis serve --forge-dir`
    ├── forge.yaml
    └── data/
        ├── results/backtest_results.db
        ├── strategies/*.json          # 8 files
        └── ideas/ideas.json
```

## License and Caveats

- This sample dataset is **fully synthetic** and contains no real financial instrument prices.
- Symbol names always carry the `_SYNTH` suffix. Do not confuse them with real tickers such as `AAPL` or `BTC`.
- The 8 bundled strategies are **textbook combinations** of technical indicators (SMA / RSI / MACD / Bollinger / ADX / Donchian). HMM-based and proprietary optimized strategies are intentionally excluded.
- For commercial backtesting engines, full-scale optimization, and live trading, please use [AlphaForge](https://alforgelabs.com) (commercial license).
