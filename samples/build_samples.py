"""alpha-visualizer 同梱サンプルデータの決定論的再生成スクリプト。

ユースケース:
    uv run python samples/build_samples.py

完了後、`samples/sample-forge/` は alpha-visualizer のサンプル forge_dir として
そのまま使える状態になる:

    uv run vis serve --forge-dir samples/sample-forge --no-open

設計方針:
    - 完全合成データ（実銘柄を含まない）で法的に再配布フリー。
    - 教科書的指標を組み合わせた 8 戦略のみを同梱（HMM 系・MTF 最適化は除外）。
    - `alpha_forge` には一切依存しない（独立 OSS パッケージとしての清潔さを保つため）。
    - seed 固定で完全に決定論的。CI で diff=0 を検証する想定。

Step 1 時点ではディレクトリ骨格のみ整備し、本体ロジックは後続ステップで
順次差し込んでいく（`_generators/` 配下に分割実装）。
"""

from __future__ import annotations

import pathlib
import sys

SAMPLES_DIR = pathlib.Path(__file__).resolve().parent
SAMPLE_FORGE_DIR = SAMPLES_DIR / "sample-forge"


def main() -> int:
    """サンプル生成のオーケストレーター（Step 1 ではプレースホルダ）。

    Returns:
        プロセス終了コード（0=成功）。
    """
    # Step 2 以降で _generators からの呼び出しを順次差し込む。
    # Step 2: synthetic_ohlcv.build_all()
    # Step 3: strategy_defs.build_all()
    # Step 4: pseudo_backtest.run_grid(...)
    # Step 5: pseudo_wfo.build() / pseudo_grid.build()
    # Step 6: writers.write_forge_dir(...) で sample-forge/ に書き出し
    print(f"[samples] target forge_dir = {SAMPLE_FORGE_DIR}")
    print("[samples] Step 1 skeleton ready. Generators will be wired in subsequent steps.")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
