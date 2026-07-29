"""``services.backtest`` 純関数の property-based testing。

数値計算が中心の関数を ``hypothesis`` で網羅的に検証する。
個別ケース (test_backtest.py) では捉えきれない不変条件 (invariants) を担保する。
"""

from __future__ import annotations

import math

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from alpha_visualizer.services.backtest import (
    compute_buy_hold_equity,
    compute_daily_returns,
    compute_drawdown,
    shape_equity,
    shape_monthly_returns,
    split_metrics,
)

# Hypothesis profile: CI で時間がかかりすぎないように deadline と max_examples を抑える。
SETTINGS = settings(
    max_examples=100,
    deadline=2000,  # 2 秒/case
    suppress_health_check=[HealthCheck.too_slow],
)

# 安全な float（NaN / Inf を除く有限値、絶対値が極端でない）
finite_floats = st.floats(
    min_value=-1e6,
    max_value=1e6,
    allow_nan=False,
    allow_infinity=False,
)
positive_floats = st.floats(
    min_value=1e-3,
    max_value=1e6,
    allow_nan=False,
    allow_infinity=False,
)


class TestComputeDrawdown:
    """compute_drawdown の不変条件:

    1. 出力長 = 入力長
    2. 全要素が <= 0 (drawdown は非正値)
    3. 単調増加 equity に対しては全要素 0
    """

    @given(values=st.lists(finite_floats, min_size=0, max_size=200))
    @SETTINGS
    def test_output_length_equals_input(self, values: list[float]) -> None:
        result = compute_drawdown(values)
        assert len(result) == len(values)

    @given(values=st.lists(positive_floats, min_size=1, max_size=200))
    @SETTINGS
    def test_all_values_non_positive(self, values: list[float]) -> None:
        # 現実の equity は正の値を想定。負値時は分母が負となり drawdown の
        # 意味論が壊れる（既知の制約・既存ユニットテストでも触れていない）。
        result = compute_drawdown(values)
        for v in result:
            # 浮動小数点誤差で微かに正になり得るため tolerance 込み
            assert v <= 1e-9

    @given(start=positive_floats, growths=st.lists(positive_floats, min_size=0, max_size=50))
    @SETTINGS
    def test_monotone_increasing_yields_zero_drawdown(
        self, start: float, growths: list[float]
    ) -> None:
        # 単調増加列を構築（各ステップで非負の正の伸びを加算）
        values: list[float] = [start]
        for g in growths:
            values.append(values[-1] + g)
        result = compute_drawdown(values)
        # 単調増加 → 各時点が peak、drawdown は常に 0
        assert all(abs(v) < 1e-9 for v in result)


class TestComputeDailyReturns:
    """compute_daily_returns の不変条件:

    1. 入力長 N → 出力長 N-1（N < 2 なら空）
    2. 全 finite な出力
    3. 同値連続 → 全 0
    """

    @given(values=st.lists(positive_floats, min_size=0, max_size=200))
    @SETTINGS
    def test_length_relation(self, values: list[float]) -> None:
        result = compute_daily_returns(values)
        if len(values) < 2:
            assert result == []
        else:
            assert len(result) == len(values) - 1

    @given(values=st.lists(positive_floats, min_size=2, max_size=200))
    @SETTINGS
    def test_all_outputs_finite(self, values: list[float]) -> None:
        result = compute_daily_returns(values)
        for v in result:
            assert math.isfinite(v)

    @given(constant=positive_floats, n=st.integers(min_value=2, max_value=100))
    @SETTINGS
    def test_constant_values_yield_zero_returns(self, constant: float, n: int) -> None:
        values = [constant] * n
        result = compute_daily_returns(values)
        assert all(abs(v) < 1e-9 for v in result)


class TestSplitMetrics:
    """split_metrics（実分割計算・issue #349）の不変条件:

    1. cutoff_idx <= 0 or >= len(values) → (None, None)
    2. 取引は IS/OOS に漏れなく振り分けられる: is_total + oos_total == 全取引数
    3. 出力の数値はすべて有限値
    4. 総リターンは複利で合成される: (1+is)(1+oos) ≈ 1+total
    """

    @given(
        values=st.lists(positive_floats, min_size=4, max_size=200),
        cutoff_ratio=st.floats(min_value=0.1, max_value=0.9),
        n_trades=st.integers(min_value=0, max_value=50),
    )
    @SETTINGS
    def test_trades_split_sums(
        self, values: list[float], cutoff_ratio: float, n_trades: int
    ) -> None:
        total = len(values)
        cutoff_idx = max(1, min(total - 1, int(total * cutoff_ratio)))
        dates = [f"2020-{1 + i // 28:02d}-{1 + i % 28:02d}" for i in range(total)]
        trades = [
            {"exit_date": dates[i % total], "pnl": 1.0 if i % 2 == 0 else -1.0}
            for i in range(n_trades)
        ]
        is_m, oos_m = split_metrics(values, dates, trades, cutoff_idx)
        if is_m is None or oos_m is None:
            return
        assert int(is_m["total_trades"]) + int(oos_m["total_trades"]) == n_trades

    @given(
        values=st.lists(positive_floats, min_size=4, max_size=200),
        cutoff_ratio=st.floats(min_value=0.1, max_value=0.9),
    )
    @SETTINGS
    def test_all_outputs_finite(
        self, values: list[float], cutoff_ratio: float
    ) -> None:
        total = len(values)
        cutoff_idx = max(1, min(total - 1, int(total * cutoff_ratio)))
        is_m, oos_m = split_metrics(values, [""] * total, [], cutoff_idx)
        for m in (is_m, oos_m):
            if m is None:
                continue
            for v in m.values():
                assert math.isfinite(float(v))

    @given(
        values=st.lists(
            st.floats(min_value=1.0, max_value=1e6, allow_nan=False, allow_infinity=False),
            min_size=4,
            max_size=200,
        ),
        cutoff_ratio=st.floats(min_value=0.1, max_value=0.9),
    )
    @SETTINGS
    def test_total_return_compounds(
        self, values: list[float], cutoff_ratio: float
    ) -> None:
        total = len(values)
        cutoff_idx = max(1, min(total - 1, int(total * cutoff_ratio)))
        is_m, oos_m = split_metrics(values, [""] * total, [], cutoff_idx)
        if is_m is None or oos_m is None:
            return
        if "total_return_pct" not in is_m or "total_return_pct" not in oos_m:
            return
        r_is = is_m["total_return_pct"] / 100.0
        r_oos = oos_m["total_return_pct"] / 100.0
        combined = (1.0 + r_is) * (1.0 + r_oos)
        expected = values[-1] / values[0]
        # total_return_pct は 4 桁丸め（粒度 5e-7）。丸め誤差は相手側の
        # (1+r) 倍で増幅されるため、許容誤差を丸め粒度から導出する。
        eps = 5e-7
        tol = 2.0 * eps * ((1.0 + abs(r_is)) + (1.0 + abs(r_oos)))
        assert combined == pytest.approx(expected, rel=1e-6, abs=tol)

    @given(n=st.integers(min_value=2, max_value=100))
    @SETTINGS
    def test_cutoff_at_boundary_returns_none(self, n: int) -> None:
        # cutoff_idx == 0 or cutoff_idx >= len(values) では分割不可
        values = [100.0 + i for i in range(n)]
        for boundary in (0, n, n + 1):
            is_m, oos_m = split_metrics(values, [""] * n, [], boundary)
            assert is_m is None and oos_m is None


class TestShapeEquity:
    """shape_equity の不変条件: dates と values の長さが一致する。"""

    @given(
        n=st.integers(min_value=0, max_value=100),
        v=st.lists(finite_floats, min_size=0, max_size=100),
    )
    @SETTINGS
    def test_dates_values_same_length(self, n: int, v: list[float]) -> None:
        # dict 形式の equity curve
        raw = [
            {"date": f"2024-01-{(i % 28) + 1:02d}", "value": v[i] if i < len(v) else 0.0}
            for i in range(n)
        ]
        dates, values = shape_equity(raw)
        assert len(dates) == len(values)


class TestShapeMonthlyReturns:
    """shape_monthly_returns の不変条件: 年ごとに必ず 12 要素の配列を返す。"""

    @given(
        years=st.lists(
            st.integers(min_value=1900, max_value=2100), min_size=1, max_size=5
        ),
        months=st.lists(st.integers(min_value=1, max_value=12), min_size=1, max_size=12),
    )
    @SETTINGS
    def test_each_year_has_12_slots(
        self, years: list[int], months: list[int]
    ) -> None:
        raw: dict[str, float] = {}
        for y in years:
            for m in months:
                raw[f"{y:04d}-{m:02d}"] = 1.5
        result = shape_monthly_returns(raw)
        for year, bucket in result.items():
            assert isinstance(year, int)
            assert len(bucket) == 12


class TestComputeBuyHoldEquity:
    """compute_buy_hold_equity の不変条件: 入力非空かつ正の場合、先頭が 100 (anchor)。"""

    @given(values=st.lists(positive_floats, min_size=1, max_size=100))
    @SETTINGS
    def test_first_value_is_100_when_data_present(self, values: list[float]) -> None:
        record = {"buy_hold_curve": [{"value": v, "date": "x"} for v in values]}
        result = compute_buy_hold_equity(record)
        # values[0] が finite で 0 でないとき先頭は 100.0 になる
        if values[0] != 0.0 and math.isfinite(values[0]):
            assert result[0] == pytest.approx(100.0)
