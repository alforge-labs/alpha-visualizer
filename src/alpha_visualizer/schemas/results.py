"""バックテスト結果 API レスポンス用 Pydantic モデル。

リストは ``services.backtest.summarize_row``、詳細は ``build_detail`` の
出力構造に合わせている。すべて ``extra="allow"`` で前方互換性を確保。
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, model_serializer


class BacktestSummary(BaseModel):
    """``GET /api/results`` リストの 1 件。"""

    model_config = ConfigDict(extra="allow")

    run_id: str
    strategy_id: str | None = None
    symbol: str | None = None
    run_at: str | None = None
    sharpe_ratio: float | None = None
    total_return_pct: float | None = None
    max_drawdown_pct: float | None = None
    total_trades: int | None = None


class Period(BaseModel):
    """``BacktestDetail.period``: equity 期間の YYYY-MM 表記。"""

    model_config = ConfigDict(extra="allow")

    start: str = ""
    end: str = ""


class BacktestEquityCurve(BaseModel):
    """``BacktestDetail.equity``: dates / values の配列ペア。"""

    model_config = ConfigDict(extra="allow")

    dates: list[str] = []
    values: list[float] = []


class IsCutoff(BaseModel):
    """``BacktestDetail.is_cutoff``: IS / OOS の境界位置。"""

    model_config = ConfigDict(extra="allow")

    date: str | None = None
    index: int = -1


class RegimeSeries(BaseModel):
    """HMM レジームステート時系列。``services.shape_regime_series`` で正規化済み。

    すべてのフィールドは ``services`` 側で検証済み（dates と states の長さ一致、
    states は int リスト等）なので、Pydantic 側では shape のみを担保する。
    """

    model_config = ConfigDict(extra="allow")

    dates: list[str]
    states: list[int]
    n_states: int
    label_names: dict[str, str] | None = None


class Trade(BaseModel):
    """``BacktestDetail.trades`` の 1 件。

    ``exit_price`` / ``sl_price`` / ``tp_price`` は TradingView lightweight-charts
    の markers / priceLine 表示用に追加されたフィールド (#189)。
    alpha-forge 側が値を出力していない場合 ``None`` のままになる。
    """

    model_config = ConfigDict(extra="allow")

    id: int | str
    direction: str
    entry_date: str = ""
    exit_date: str = ""
    entry_price: float = 0.0
    exit_price: float | None = None
    sl_price: float | None = None
    tp_price: float | None = None
    return_pct: float = 0.0
    pnl: float = 0.0
    holding_days: int = 0
    mae_pct: float = 0.0
    mfe_pct: float = 0.0


class CarryAdjustedMetrics(BaseModel):
    """FX キャリー（金利差近似）込みの参考メトリクス（vis#308）。

    forge `backtest run --carry` の `_compute_equity_metrics` 出力に対応する。
    """

    model_config = ConfigDict(extra="allow")

    total_return_pct: float | None = None
    cagr_pct: float | None = None
    max_drawdown_pct: float | None = None
    sharpe_ratio: float | None = None
    volatility_pct: float | None = None


class CarryAdjusted(BaseModel):
    """--carry ランの carry_adjusted ブロック（vis#308）。"""

    model_config = ConfigDict(extra="allow")

    metrics: CarryAdjustedMetrics = CarryAdjustedMetrics()
    note: str | None = None


class BacktestDetail(BaseModel):
    """``GET /api/results/{run_id}`` 詳細レスポンス。

    フィールドは ``services.backtest.build_detail`` の出力構造に対応する。
    ``metrics`` / ``is_metrics`` / ``oos_metrics`` / ``monthly_returns``
    などの巨大ネストは ``Any`` で受け、``extra="allow"`` で将来追加にも追従。

    ``regime_series`` / ``regime_breakdown`` は条件付きで含まれるフィールド。
    services 層が結果 dict に含めなかった場合は ``None`` のままにし、
    ``_serialize_with_optional_regime`` で JSON レスポンスから完全に除外する
    （``"regime_*": null`` がレスポンスに混入することを防ぐ）。
    """

    model_config = ConfigDict(extra="allow")

    run_id: str
    strategy_id: str
    strategy_name: str
    symbol: str = ""
    timeframe: str = "1d"
    run_at: str = ""
    period: Period = Period()
    equity: BacktestEquityCurve = BacktestEquityCurve()
    drawdown: list[float] = []
    daily_returns: list[float] = []
    buy_hold_equity: list[float] = []
    is_cutoff: IsCutoff = IsCutoff()
    metrics: dict[str, Any] = {}
    is_metrics: dict[str, Any] | None = None
    oos_metrics: dict[str, Any] | None = None
    monthly_returns: dict[int, list[float | None]] = {}
    trades: list[Trade] = []
    benchmark_annual_returns: dict[int, float] = {}
    regime_series: RegimeSeries | None = None
    regime_breakdown: dict[str, Any] | None = None
    # 実行元 provenance（"strategy" / "strategy-file" / null=不明・vis#299）
    source: str | None = None
    # FX キャリー近似（vis#308）。None = キャリー計上なし → JSON からキーごと除外
    # （forge --json の「キー有無 = 計上有無」契約をレスポンスでも保つ）
    carry_adjusted: CarryAdjusted | None = None

    @model_serializer(mode="wrap")
    def _serialize_with_optional_regime(self, handler):  # type: ignore[no-untyped-def]
        """regime_series / regime_breakdown / carry_adjusted は None の場合 JSON から除外する。

        他のフィールド（is_metrics / oos_metrics 等）の None は既存挙動を保つため
        除外しない。``response_model_exclude_none=True`` を全体に適用すると
        is_metrics / oos_metrics の null キーも消えて API 互換性が壊れるので、
        フィールド単位の選択的除外を model_serializer で実現する。
        """
        result = handler(self)
        for key in ("regime_series", "regime_breakdown", "carry_adjusted"):
            if result.get(key) is None:
                result.pop(key, None)
        return result
