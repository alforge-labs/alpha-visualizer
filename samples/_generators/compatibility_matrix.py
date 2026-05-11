"""戦略 × 銘柄 (8 × 5 = 40 セル) の相性マトリクス。

各ペアに対して以下を提供する:

- ``SKILL_MATRIX``  : 0.0〜1.0 の skill 係数（高いほどその戦略がその銘柄で有効）
- ``STRATEGY_PROFILE``: 戦略タイプ（trend/reversion/breakout）、5 年間のトレード数、
  平均保有日数の目安

skill は擬似バックテスト生成器 ``pseudo_backtest`` が equity curve のドリフト、
トレードの勝率、トレードあたりの期待リターンを差別化するために参照する。
"""

from __future__ import annotations

from dataclasses import dataclass

from samples._generators.strategy_defs import list_ids
from samples._generators.synthetic_ohlcv import SYMBOL_REGIMES

# ---------------------------------------------------------------------------
# 戦略プロファイル
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class StrategyProfile:
    """戦略タイプとトレード頻度の目安。

    Attributes:
        kind: 戦略の大分類。``"trend"`` / ``"reversion"`` / ``"breakout"``。
        n_trades_per_5y: 5 年間で生成するトレード数の目安。
        avg_holding_days: 平均保有日数（営業日）。
    """

    kind: str
    n_trades_per_5y: int
    avg_holding_days: int


STRATEGY_PROFILE: dict[str, StrategyProfile] = {
    "sma_crossover_v1":  StrategyProfile(kind="trend",     n_trades_per_5y=75, avg_holding_days=16),
    "rsi_reversion_v1":  StrategyProfile(kind="reversion", n_trades_per_5y=100, avg_holding_days=4),
    "macd_crossover_v1": StrategyProfile(kind="trend",     n_trades_per_5y=80, avg_holding_days=15),
    "bbands_breakout_v1": StrategyProfile(kind="breakout", n_trades_per_5y=45, avg_holding_days=20),
    "range_reversion_v1": StrategyProfile(kind="reversion", n_trades_per_5y=95, avg_holding_days=5),
    "supertrend_adx_v1": StrategyProfile(kind="trend",     n_trades_per_5y=55, avg_holding_days=18),
    "ema_adx_macd_v1":   StrategyProfile(kind="trend",     n_trades_per_5y=50, avg_holding_days=22),
    "donchian_turtle_v1": StrategyProfile(kind="breakout", n_trades_per_5y=35, avg_holding_days=35),
}


# ---------------------------------------------------------------------------
# 40 セル skill テーブル
# ---------------------------------------------------------------------------
#
# 設計原則:
#   - トレンド系 (sma/macd/supertrend/ema-adx-macd) は EQUITY / INDEX / CRYPTO に強く、FX に弱い
#   - 逆張り系 (rsi/range)               は FX / INDEX に強く、CRYPTO に弱い
#   - ブレイクアウト系 (bbands/donchian) は COMMODITY / CRYPTO に強く、FX に弱い
#   - 1.0 は禁止（過度に「完璧」な戦略になり現実味が崩れるため）
#
SKILL_MATRIX: dict[tuple[str, str], float] = {
    # SMA Crossover
    ("sma_crossover_v1", "EQUITY_SYNTH"):    0.65,
    ("sma_crossover_v1", "INDEX_SYNTH"):     0.60,
    ("sma_crossover_v1", "COMMODITY_SYNTH"): 0.50,
    ("sma_crossover_v1", "FX_SYNTH"):        0.30,
    ("sma_crossover_v1", "CRYPTO_SYNTH"):    0.75,
    # RSI Mean Reversion
    ("rsi_reversion_v1", "EQUITY_SYNTH"):    0.50,
    ("rsi_reversion_v1", "INDEX_SYNTH"):     0.75,
    ("rsi_reversion_v1", "COMMODITY_SYNTH"): 0.40,
    ("rsi_reversion_v1", "FX_SYNTH"):        0.85,
    ("rsi_reversion_v1", "CRYPTO_SYNTH"):    0.35,
    # MACD Crossover
    ("macd_crossover_v1", "EQUITY_SYNTH"):    0.62,
    ("macd_crossover_v1", "INDEX_SYNTH"):     0.65,
    ("macd_crossover_v1", "COMMODITY_SYNTH"): 0.52,
    ("macd_crossover_v1", "FX_SYNTH"):        0.32,
    ("macd_crossover_v1", "CRYPTO_SYNTH"):    0.70,
    # Bollinger Bands Breakout
    ("bbands_breakout_v1", "EQUITY_SYNTH"):    0.55,
    ("bbands_breakout_v1", "INDEX_SYNTH"):     0.48,
    ("bbands_breakout_v1", "COMMODITY_SYNTH"): 0.85,
    ("bbands_breakout_v1", "FX_SYNTH"):        0.35,
    ("bbands_breakout_v1", "CRYPTO_SYNTH"):    0.80,
    # Range Reversion (BB + ADX)
    ("range_reversion_v1", "EQUITY_SYNTH"):    0.45,
    ("range_reversion_v1", "INDEX_SYNTH"):     0.65,
    ("range_reversion_v1", "COMMODITY_SYNTH"): 0.35,
    ("range_reversion_v1", "FX_SYNTH"):        0.90,
    ("range_reversion_v1", "CRYPTO_SYNTH"):    0.30,
    # Supertrend + ADX
    ("supertrend_adx_v1", "EQUITY_SYNTH"):    0.78,
    ("supertrend_adx_v1", "INDEX_SYNTH"):     0.60,
    ("supertrend_adx_v1", "COMMODITY_SYNTH"): 0.50,
    ("supertrend_adx_v1", "FX_SYNTH"):        0.32,
    ("supertrend_adx_v1", "CRYPTO_SYNTH"):    0.75,
    # EMA + ADX + MACD Composite
    ("ema_adx_macd_v1", "EQUITY_SYNTH"):    0.80,
    ("ema_adx_macd_v1", "INDEX_SYNTH"):     0.82,
    ("ema_adx_macd_v1", "COMMODITY_SYNTH"): 0.55,
    ("ema_adx_macd_v1", "FX_SYNTH"):        0.40,
    ("ema_adx_macd_v1", "CRYPTO_SYNTH"):    0.65,
    # Donchian Turtle
    ("donchian_turtle_v1", "EQUITY_SYNTH"):    0.58,
    ("donchian_turtle_v1", "INDEX_SYNTH"):     0.50,
    ("donchian_turtle_v1", "COMMODITY_SYNTH"): 0.82,
    ("donchian_turtle_v1", "FX_SYNTH"):        0.30,
    ("donchian_turtle_v1", "CRYPTO_SYNTH"):    0.85,
}


def assert_full_coverage() -> None:
    """8 戦略 × 5 銘柄の全 40 セルが ``SKILL_MATRIX`` に揃っているか検証する。

    Raises:
        AssertionError: いずれかのセルが欠落している、または余分なセルが存在する場合。
    """
    expected: set[tuple[str, str]] = {
        (sid, symbol) for sid in list_ids() for symbol in SYMBOL_REGIMES
    }
    actual = set(SKILL_MATRIX.keys())
    missing = expected - actual
    extra = actual - expected
    if missing or extra:
        raise AssertionError(
            f"compatibility matrix coverage mismatch: missing={sorted(missing)}, "
            f"extra={sorted(extra)}"
        )


def get_skill(strategy_id: str, symbol: str) -> float:
    """``(strategy_id, symbol)`` の skill 係数を返す。

    Raises:
        KeyError: 該当セルが存在しない場合。
    """
    return SKILL_MATRIX[(strategy_id, symbol)]


def get_profile(strategy_id: str) -> StrategyProfile:
    """戦略プロファイルを返す。

    Raises:
        KeyError: 未定義の戦略 ID。
    """
    return STRATEGY_PROFILE[strategy_id]


def pair_seed(strategy_id: str, symbol: str, base: int = 100) -> int:
    """``(strategy_id, symbol)`` ペアに対する決定論的な seed 値を返す。

    Args:
        strategy_id: 戦略 ID。
        symbol: 銘柄シンボル。
        base: 衝突回避用の追加オフセット。

    Returns:
        ``numpy`` 用の 32bit 範囲の正整数。
    """
    ids = list_ids()
    symbols = list(SYMBOL_REGIMES.keys())
    if strategy_id not in ids:
        raise KeyError(f"unknown strategy: {strategy_id!r}")
    if symbol not in symbols:
        raise KeyError(f"unknown symbol: {symbol!r}")
    # 行・列の固定順から seed を組み立てる（プラットフォーム非依存）。
    row = ids.index(strategy_id)
    col = symbols.index(symbol)
    return base + row * 100 + col


assert_full_coverage()
