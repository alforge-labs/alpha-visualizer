"""教科書的な 8 戦略の JSON 定義（手書き複製）。

alpha-forge のテンプレートをコードから import せず、教科書的な構成を
こちらで独立に書き起こしている。alpha-visualizer の strategies ルーターが
期待するスキーマに合わせて、フロントの戦略カード／詳細画面で問題なく
表示できる粒度のメタ情報・指標構成・エントリ／エグジット条件を含む。

含まれる戦略:
    1. sma_crossover_v1   — SMA 短期/長期クロス
    2. rsi_reversion_v1   — RSI 30/70 逆張り
    3. macd_crossover_v1  — MACD シグナル交差
    4. bbands_breakout_v1 — Bollinger Bands ブレイクアウト
    5. range_reversion_v1 — BBands 下限逆張り + ADX レンジ判定
    6. supertrend_adx_v1  — Supertrend + ADX フィルタ
    7. ema_adx_macd_v1    — EMA + ADX + MACD 複合
    8. donchian_turtle_v1 — Donchian ブレイクアウト（タートル風）

すべて公知のテクニカル指標の組み合わせのみで構成し、HMM / MTF / 最適化済み
パラメータといった商用差別化要素は含まない。
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any

# 各戦略は「教科書的な向き」がある銘柄を 2〜3 個アドバイス的に列挙する。
# 実際のサンプル DB ではこれとは独立に全戦略 × 全銘柄でバックテストを生成する。
ALL_SYNTH_SYMBOLS: tuple[str, ...] = (
    "EQUITY_SYNTH",
    "INDEX_SYNTH",
    "COMMODITY_SYNTH",
    "FX_SYNTH",
    "CRYPTO_SYNTH",
)


_STRATEGIES: dict[str, dict[str, Any]] = {
    "sma_crossover_v1": {
        "strategy_id": "sma_crossover_v1",
        "name": "SMA Crossover",
        "version": "1.0.0",
        "asset_type": "equity",
        "timeframe": "1d",
        "tags": ["trend", "crossover", "textbook"],
        "target_symbols": ["EQUITY_SYNTH", "INDEX_SYNTH", "CRYPTO_SYNTH"],
        "description": (
            "短期 SMA が長期 SMA を上抜けたら買い、下抜けたら手仕舞いするオーソドックスな"
            "トレンドフォロー戦略。トレンドの強い銘柄で効果を発揮しやすい。"
        ),
        "parameters": {"fast_period": 20, "slow_period": 60},
        "indicators": [
            {"name": "sma_fast", "type": "SMA", "params": {"period": 20}},
            {"name": "sma_slow", "type": "SMA", "params": {"period": 60}},
        ],
        "variables": [],
        "entry_conditions": {"long": "sma_fast > sma_slow"},
        "exit_conditions": {"long": "sma_fast < sma_slow"},
        "risk_management": {"stop_loss_pct": 6.0, "take_profit_pct": 18.0},
    },
    "rsi_reversion_v1": {
        "strategy_id": "rsi_reversion_v1",
        "name": "RSI Mean Reversion",
        "version": "1.0.0",
        "asset_type": "equity",
        "timeframe": "1d",
        "tags": ["mean-reversion", "oscillator", "textbook"],
        "target_symbols": ["INDEX_SYNTH", "FX_SYNTH"],
        "description": (
            "RSI が下方しきい値を下回ったら買い、上方しきい値を超えたら手仕舞い。"
            "レンジ・低ボラ環境で効果が出やすい逆張り戦略。"
        ),
        "parameters": {"rsi_length": 14, "oversold": 30, "overbought": 70},
        "indicators": [
            {"name": "rsi", "type": "RSI", "params": {"period": 14}},
        ],
        "variables": [],
        "entry_conditions": {"long": "rsi < oversold"},
        "exit_conditions": {"long": "rsi > overbought"},
        "risk_management": {"stop_loss_pct": 4.0, "take_profit_pct": 8.0},
    },
    "macd_crossover_v1": {
        "strategy_id": "macd_crossover_v1",
        "name": "MACD Signal Cross",
        "version": "1.0.0",
        "asset_type": "equity",
        "timeframe": "1d",
        "tags": ["trend", "momentum", "textbook"],
        "target_symbols": ["EQUITY_SYNTH", "INDEX_SYNTH", "CRYPTO_SYNTH"],
        "description": (
            "MACD ライン (EMA12 - EMA26) がシグナル (EMA9) を上抜けたら買い、"
            "下抜けたら手仕舞い。中期トレンドの転換点を捉える定番戦略。"
        ),
        "parameters": {"fast": 12, "slow": 26, "signal": 9},
        "indicators": [
            {
                "name": "macd",
                "type": "MACD",
                "params": {"fast": 12, "slow": 26, "signal": 9},
            },
        ],
        "variables": [],
        "entry_conditions": {"long": "macd.line > macd.signal"},
        "exit_conditions": {"long": "macd.line < macd.signal"},
        "risk_management": {"stop_loss_pct": 5.0, "take_profit_pct": 15.0},
    },
    "bbands_breakout_v1": {
        "strategy_id": "bbands_breakout_v1",
        "name": "Bollinger Bands Breakout",
        "version": "1.0.0",
        "asset_type": "commodity",
        "timeframe": "1d",
        "tags": ["breakout", "volatility", "textbook"],
        "target_symbols": ["COMMODITY_SYNTH", "CRYPTO_SYNTH"],
        "description": (
            "終値がボリンジャー上バンドを上抜けたら買い、ミッドバンドを割ったら手仕舞い。"
            "ボラティリティ拡張局面でのトレンドフォロー版。"
        ),
        "parameters": {"bb_length": 20, "bb_std": 2.0},
        "indicators": [
            {
                "name": "bbands",
                "type": "BBANDS",
                "params": {"length": 20, "std": 2.0},
            },
        ],
        "variables": [],
        "entry_conditions": {"long": "close > bbands.upper"},
        "exit_conditions": {"long": "close < bbands.middle"},
        "risk_management": {"stop_loss_pct": 7.0, "take_profit_pct": 20.0},
    },
    "range_reversion_v1": {
        "strategy_id": "range_reversion_v1",
        "name": "Range Reversion (BB Lower + ADX)",
        "version": "1.0.0",
        "asset_type": "fx",
        "timeframe": "1d",
        "tags": ["mean-reversion", "range", "filter", "textbook"],
        "target_symbols": ["FX_SYNTH", "INDEX_SYNTH"],
        "description": (
            "ADX がレンジ判定の閾値以下のとき、終値が下バンドを割ったら買い、"
            "ミッドバンドへ戻ったら手仕舞い。レンジ相場専用の逆張り。"
        ),
        "parameters": {
            "bb_length": 20,
            "bb_std": 2.0,
            "adx_length": 14,
            "adx_threshold": 22.0,
        },
        "indicators": [
            {
                "name": "bbands",
                "type": "BBANDS",
                "params": {"length": 20, "std": 2.0},
            },
            {"name": "adx", "type": "ADX", "params": {"period": 14}},
        ],
        "variables": [],
        "entry_conditions": {
            "long": "adx < adx_threshold and close < bbands.lower",
        },
        "exit_conditions": {"long": "close > bbands.middle"},
        "risk_management": {"stop_loss_pct": 3.0, "take_profit_pct": 6.0},
    },
    "supertrend_adx_v1": {
        "strategy_id": "supertrend_adx_v1",
        "name": "Supertrend with ADX Filter",
        "version": "1.0.0",
        "asset_type": "equity",
        "timeframe": "1d",
        "tags": ["trend", "filter", "textbook"],
        "target_symbols": ["EQUITY_SYNTH", "CRYPTO_SYNTH"],
        "description": (
            "Supertrend が上昇方向に転換し、かつ ADX がトレンド閾値を超えているときに買い、"
            "Supertrend が下落方向に転換したら手仕舞い。トレンドフォローを ADX で強化。"
        ),
        "parameters": {
            "st_length": 10,
            "st_multiplier": 3.0,
            "adx_length": 14,
            "adx_threshold": 20.0,
        },
        "indicators": [
            {
                "name": "supertrend",
                "type": "SUPERTREND",
                "params": {"length": 10, "multiplier": 3.0},
            },
            {"name": "adx", "type": "ADX", "params": {"period": 14}},
        ],
        "variables": [],
        "entry_conditions": {
            "long": "supertrend.direction == 1 and adx > adx_threshold",
        },
        "exit_conditions": {"long": "supertrend.direction == -1"},
        "risk_management": {"stop_loss_pct": 6.0, "take_profit_pct": 20.0},
    },
    "ema_adx_macd_v1": {
        "strategy_id": "ema_adx_macd_v1",
        "name": "EMA + ADX + MACD Composite",
        "version": "1.0.0",
        "asset_type": "equity",
        "timeframe": "1d",
        "tags": ["trend", "composite", "filter", "textbook"],
        "target_symbols": ["EQUITY_SYNTH", "INDEX_SYNTH"],
        "description": (
            "EMA で長期トレンド方向を、ADX でトレンド強度を、MACD でモメンタムを確認した"
            "上でロングを取る複合シグナル。フォルスシグナルを減らすことを狙う構成。"
        ),
        "parameters": {
            "ema_period": 50,
            "adx_length": 14,
            "adx_threshold": 20.0,
            "macd_fast": 12,
            "macd_slow": 26,
            "macd_signal": 9,
        },
        "indicators": [
            {"name": "ema", "type": "EMA", "params": {"period": 50}},
            {"name": "adx", "type": "ADX", "params": {"period": 14}},
            {
                "name": "macd",
                "type": "MACD",
                "params": {"fast": 12, "slow": 26, "signal": 9},
            },
        ],
        "variables": [],
        "entry_conditions": {
            "long": (
                "close > ema and adx > adx_threshold and macd.line > macd.signal"
            ),
        },
        "exit_conditions": {
            "long": "close < ema or macd.line < macd.signal",
        },
        "risk_management": {"stop_loss_pct": 5.0, "take_profit_pct": 15.0},
    },
    "donchian_turtle_v1": {
        "strategy_id": "donchian_turtle_v1",
        "name": "Donchian Channel Turtle",
        "version": "1.0.0",
        "asset_type": "commodity",
        "timeframe": "1d",
        "tags": ["breakout", "trend", "textbook"],
        "target_symbols": ["COMMODITY_SYNTH", "CRYPTO_SYNTH"],
        "description": (
            "20 日 Donchian 上限を上抜けたら買い、10 日 Donchian 下限を割ったら手仕舞い。"
            "古典的なタートルズ流のブレイクアウト戦略。"
        ),
        "parameters": {"entry_length": 20, "exit_length": 10},
        "indicators": [
            {
                "name": "donchian_entry",
                "type": "DONCHIAN",
                "params": {"length": 20},
            },
            {
                "name": "donchian_exit",
                "type": "DONCHIAN",
                "params": {"length": 10},
            },
        ],
        "variables": [],
        "entry_conditions": {"long": "close > donchian_entry.upper"},
        "exit_conditions": {"long": "close < donchian_exit.lower"},
        "risk_management": {"stop_loss_pct": 8.0, "take_profit_pct": 25.0},
    },
}


def get(strategy_id: str) -> dict[str, Any]:
    """戦略 ID に対応する戦略 dict のディープコピーを返す。

    Args:
        strategy_id: ``_STRATEGIES`` のキー。

    Returns:
        呼び出し側で安全に書き換えできるよう完全に独立した dict。

    Raises:
        KeyError: 未定義の戦略 ID が渡された場合。
    """
    if strategy_id not in _STRATEGIES:
        raise KeyError(f"unknown strategy_id: {strategy_id!r}")
    return deepcopy(_STRATEGIES[strategy_id])


def build_all() -> dict[str, dict[str, Any]]:
    """全 8 戦略 dict を辞書で返す（呼び出しごとに独立した deep copy）。

    Returns:
        ``{strategy_id: strategy_dict}`` の辞書。
    """
    return {sid: deepcopy(payload) for sid, payload in _STRATEGIES.items()}


def list_ids() -> list[str]:
    """戦略 ID のリストを定義順で返す。"""
    return list(_STRATEGIES.keys())
