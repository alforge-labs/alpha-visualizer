"""alpha-visualizer 同梱サンプルデータの決定論的再生成スクリプト。

ユースケース:
    uv run python samples/build_samples.py

完了後、``samples/sample-forge/`` は alpha-visualizer のサンプル forge_dir として
そのまま使える状態になる::

    uv run alpha-vis serve --forge-dir samples/sample-forge --no-open

設計方針:
    - 完全合成データ（実銘柄を含まない）で法的に再配布フリー。
    - 教科書的指標を組み合わせた 8 戦略のみを同梱（HMM 系・MTF 最適化は除外）。
    - ``alpha_forge`` には一切依存しない。
    - seed 固定で完全に決定論的。CI で diff=0 を検証する想定。
"""

from __future__ import annotations

import pathlib
import sys

# `python samples/build_samples.py` で起動された場合、Python はスクリプトの親
# (= samples/) しか sys.path に入れないので、プロジェクトルートを補足して
# `samples._generators` を import できるようにする。
_ROOT = pathlib.Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from samples._generators import (  # noqa: E402  ← path 補正後の import が意図
    ideas_defs,
    pseudo_backtest,
    pseudo_grid,
    pseudo_wfo,
    strategy_defs,
    synthetic_ohlcv,
    writers,
)

SAMPLES_DIR = pathlib.Path(__file__).resolve().parent
SAMPLE_FORGE_DIR = SAMPLES_DIR / "sample-forge"


def main() -> int:
    """サンプル生成のオーケストレーター。

    Returns:
        プロセス終了コード（0=成功）。
    """
    print(f"[samples] target forge_dir = {SAMPLE_FORGE_DIR}")

    print("[samples] step 1/6: synthesizing 5 OHLCV symbols ...")
    ohlcv = synthetic_ohlcv.build_all()

    print(f"[samples] step 2/6: loading {len(strategy_defs.list_ids())} strategies ...")
    strategies = strategy_defs.build_all()

    print("[samples] step 3/6: building 40 pseudo backtests ...")
    bt_runs = pseudo_backtest.build_all_runs(ohlcv)

    print(f"[samples] step 4/6: building {len(pseudo_wfo.WFO_PAIRS)} WFO runs ...")
    wfo_runs = pseudo_wfo.build_all_wfo(ohlcv)

    print(f"[samples] step 5/6: building {len(pseudo_grid.GRID_PAIRS)} Grid runs ...")
    grid_runs = pseudo_grid.build_all_grid(ohlcv)

    print("[samples] step 6/6: writing sample-forge/ ...")
    ideas = ideas_defs.build_all()
    stats = writers.write_forge_dir(
        SAMPLE_FORGE_DIR,
        strategies=strategies,
        ideas=ideas,
        bt_runs=bt_runs,
        wfo_runs=wfo_runs,
        grid_runs=grid_runs,
    )

    print()
    print("=== summary ===")
    for key, value in stats.items():
        if key == "db_size_bytes":
            print(f"  {key:>20s}: {value:,} bytes ({value / 1024:,.1f} KB)")
        else:
            print(f"  {key:>20s}: {value}")
    print()
    print("[ok] sample-forge/ ready. Launch with:")
    print("    uv run alpha-vis serve --forge-dir samples/sample-forge --no-open")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
