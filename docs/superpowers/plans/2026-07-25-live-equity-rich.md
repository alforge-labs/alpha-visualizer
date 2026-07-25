# Live ページ Equity リッチ化 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Live ページの Equity 表示に、ベンチマーク比較・ドローダウン・KPI・建玉内訳を加え、combine portfolio の運用状況を投資家目線で判断できる画面にする。

**Architecture:** `alpha-forge live replay` が benchmark_equity / backtest_equity / positions を算出して `live_position_summaries` の新規 3 列に保存し、alpha-visualizer は SQLite を読むだけ（alpha-forge 非依存を維持）。チャートは既存の `EquityDrawdownPaneTV` に `overlays` prop を足して多系列対応にする。

**Tech Stack:** Python 3.12 / pandas / SQLAlchemy / Click / pytest（alpha-forge・alpha-visualizer backend）、React 19 / TypeScript / lightweight-charts / vitest（alpha-visualizer frontend）

## Global Constraints

- 設計の SSoT は `docs/superpowers/specs/2026-07-25-live-equity-rich-design.md`。KPI 各値の定義式はそこに固定してある
- 3 系列（Live / 指数 B&H / BT combine）はすべて **live 開始時点 = `initial_capital`** に正規化する
- `backtest_equity` は再計算しない。`CombinedStrategyBacktestEngine.run()` の戻り値 `["combined"]["value"]`（pd.Series）を切り出す
- ベンチマークの価格データが無い場合は警告してベンチマークだけ落とし、**replay 自体は成功させる**
- 建玉は**イベントからの再構築値**。ブローカーの実口座値とは別物であることを UI に明示する
- 旧 DB（新列なし）でも 500 にせず「ベンチマークなし」として描画する
- alpha-forge は PR に CI が走らない。マージ前にローカルで `pytest` / `ruff` / `mypy` / `generate_codemap.py --check` を実行する
- コミットメッセージは Conventional Commits + 日本語。main への直接コミット禁止（ワークツリー + PR）
- PR は **alpha-forge → alpha-visualizer の順**にマージする（visualizer が読む列を先に作る）

## File Structure

### alpha-forge（PR 1・ブランチ `feat/live-benchmark-positions`）

| ファイル | 責務 |
|---|---|
| `src/alpha_forge/pinescript/portfolio_alert_replay.py` | 移動平均原価法・建玉スナップショット・ベンチマーク/BT equity の純粋関数（既存の receipts 処理の隣） |
| `src/alpha_forge/live/replay.py` | `build_combine_live_summary` から上記を配線 |
| `src/alpha_forge/live/models.py` | `PositionLiveSummary` に 3 フィールド追加 |
| `src/alpha_forge/live/db_repository.py` | スキーマ 3 列 + `ALTER TABLE` マイグレーション + save/load |
| `src/alpha_forge/config.py` | `LiveConfig` 追加 |
| `src/alpha_forge/commands/live.py` | `--benchmark` オプション + 配線 |
| `tests/test_pinescript/test_portfolio_alert_replay.py` | 純粋関数のテスト |
| `tests/test_live/test_replay_combine.py` | 配線後の統合テスト |
| `tests/test_live/test_position_summary_migration.py` | **新規**: 旧スキーマ DB への列追加マイグレーション |
| `tests/test_cli_live_benchmark.py` | **新規**: `--benchmark` の CLI テスト |

### alpha-visualizer（PR 2・ブランチ `feat/live-equity-rich`）

| ファイル | 責務 |
|---|---|
| `src/alpha_visualizer/db.py` | 3 列追加 |
| `src/alpha_visualizer/repositories/live.py` | 新列のパース |
| `src/alpha_visualizer/schemas/live.py` | 新フィールドの型 |
| `frontend/src/api/types.ts` | `LiveSummary` 拡張（**手書き。`pnpm run gen` では生成されない**） |
| `frontend/src/lib/liveEquity.ts` | **新規**: ドローダウン・KPI・超過リターン・構成比の純粋関数 |
| `frontend/src/hooks/useEquityViewport.ts` | `overlays` を同一インデックスでスライス |
| `frontend/src/charts/tv/EquityDrawdownPaneTV.tsx` | `overlays` prop |
| `frontend/src/components/live/LiveKpiRow.tsx` | **新規**: KPI 行 + 超過リターン |
| `frontend/src/components/live/LivePositionsTable.tsx` | **新規**: 建玉テーブル |
| `frontend/src/components/live/LivePositionView.tsx` | 組み立て（既存を刷新） |

---

## Task 1: 移動平均原価法

**Files:**
- Modify: `src/alpha_forge/pinescript/portfolio_alert_replay.py`
- Test: `tests/test_pinescript/test_portfolio_alert_replay.py`

**Interfaces:**
- Consumes: 既存の `AlertReceipt` / `authoritative_receipts()` / `_fill_price(receipt, price_data_map)`
- Produces: `average_cost_basis(receipts, *, price_data_map=None) -> dict[str, tuple[float, float]]`（ticker → `(qty, avg_cost)`）

- [ ] **Step 1: 失敗するテストを書く**

`tests/test_pinescript/test_portfolio_alert_replay.py` の末尾に追記。冒頭の import に `average_cost_basis` を足す。

```python
def _reconciled(order_id: str, at: str, action: str, qty: float, price: float) -> dict:
    """FILLED_ALL の order_reconciled を 1 件組み立てる。"""
    return {
        "event_type": "order_reconciled", "event_id": f"e_{order_id}", "order_id": order_id,
        "occurred_at": at, "broker": "moomoo", "asset_class": "US",
        "action": action, "ticker": "US.GLD", "quantity": qty,
        "order_status": "FILLED_ALL", "dealt_qty": qty, "dealt_avg_price": price,
        "is_filled": True, "portfolio_id": "cb_v1", "sub_strategy_id": "gld_v1",
        "run_mode": "paper",
    }


def test_average_cost_basis_weights_buys(tmp_path: Path) -> None:
    """買い増しは加重平均、売却は数量のみ減り単価は据え置き。

    WHY: 含み損益は (現在値 - 平均取得単価) × 数量 で出す。売却で単価が
    動くと、残っている建玉の損益が実態とずれる。
    """
    fp = tmp_path / "2026-01-05.moomoo.jsonl"
    _write_jsonl(fp, [
        _reconciled("o1", "2026-01-05T14:00:00+00:00", "buy", 100, 100.0),
        _reconciled("o2", "2026-01-06T14:00:00+00:00", "buy", 100, 120.0),
        _reconciled("o3", "2026-01-07T14:00:00+00:00", "sell", 50, 130.0),
    ])
    receipts = load_receipts_from_jsonl(fp, portfolio_id="cb_v1")
    basis = average_cost_basis(receipts)
    qty, avg = basis["US.GLD"]
    assert qty == pytest.approx(150.0)
    assert avg == pytest.approx(110.0)  # (100×100 + 100×120) / 200、売却では不変


def test_average_cost_basis_ignores_unfilled(tmp_path: Path) -> None:
    """dealt_qty=0 の receipt は原価に影響しない。"""
    fp = tmp_path / "2026-01-05.moomoo.jsonl"
    _write_jsonl(fp, [
        _reconciled("o1", "2026-01-05T14:00:00+00:00", "buy", 100, 100.0),
        {
            "event_type": "order_reconciled", "event_id": "e2", "order_id": "o2",
            "occurred_at": "2026-01-06T14:00:00+00:00", "broker": "moomoo",
            "asset_class": "US", "action": "buy", "ticker": "US.GLD",
            "quantity": 999, "order_status": "SUBMITTED", "dealt_qty": 0.0,
            "dealt_avg_price": 0.0, "is_filled": False, "portfolio_id": "cb_v1",
            "sub_strategy_id": "gld_v1", "run_mode": "paper",
        },
    ])
    receipts = load_receipts_from_jsonl(fp, portfolio_id="cb_v1")
    qty, avg = average_cost_basis(receipts)["US.GLD"]
    assert qty == pytest.approx(100.0)
    assert avg == pytest.approx(100.0)
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd alpha-forge && uv run pytest tests/test_pinescript/test_portfolio_alert_replay.py -k average_cost -v`
Expected: FAIL — `ImportError: cannot import name 'average_cost_basis'`

- [ ] **Step 3: 実装する**

`portfolio_alert_replay.py` の `compute_cash_series` の直後に追加。

```python
def average_cost_basis(
    receipts: list[AlertReceipt],
    *,
    price_data_map: dict[str, pd.DataFrame] | None = None,
) -> dict[str, tuple[float, float]]:
    """ticker ごとの ``(数量, 平均取得単価)`` を移動平均原価法で算出する。

    買い: ``(cost × qty + price × q) / (qty + q)`` で加重平均を更新。
    売り: 数量のみ減らし単価は据え置き（実現損益は別途 trade 側で扱う）。

    ``compute_cash_series`` と同じ receipt 集合・同じ約定単価解決を使う。
    ずれると建玉評価額と cash が整合しなくなる。
    """
    state: dict[str, list[float]] = {}
    for r in authoritative_receipts(receipts):
        qty = r.filled_qty if r.filled_qty is not None else r.quantity
        if not qty:
            continue
        price = _fill_price(r, price_data_map)
        if price is None:
            continue
        cur = state.setdefault(r.ticker, [0.0, 0.0])
        if r.action == "buy":
            total = cur[0] + qty
            cur[1] = ((cur[1] * cur[0]) + (price * qty)) / total if total else 0.0
            cur[0] = total
        else:
            cur[0] = max(cur[0] - qty, 0.0)
    return {ticker: (v[0], v[1]) for ticker, v in state.items()}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `uv run pytest tests/test_pinescript/test_portfolio_alert_replay.py -k average_cost -v`
Expected: PASS（2 件）

- [ ] **Step 5: コミット**

```bash
git add src/alpha_forge/pinescript/portfolio_alert_replay.py tests/test_pinescript/test_portfolio_alert_replay.py
git commit -m "feat(live): 建玉の平均取得単価を移動平均原価法で算出する関数を追加"
```

---

## Task 2: 建玉スナップショット

**Files:**
- Modify: `src/alpha_forge/pinescript/portfolio_alert_replay.py`
- Test: `tests/test_pinescript/test_portfolio_alert_replay.py`

**Interfaces:**
- Consumes: `average_cost_basis()`（Task 1）、既存の `reconstruct_position_series()` / `_resolve_close_series()`
- Produces: `build_position_snapshot(*, receipts, positions, price_data_map, sub_strategy_to_ticker, cash_balance) -> dict[str, Any]`
  - 戻り値: `{"positions": list[dict], "cash": float, "total_value": float}`
  - `positions` の各要素: `{"ticker": str, "sub_strategy_id": str, "qty": float, "avg_cost": float, "last_price": float, "market_value": float, "weight_pct": float, "unrealized_pnl": float, "unrealized_pnl_pct": float}`

- [ ] **Step 1: 失敗するテストを書く**

```python
def test_build_position_snapshot_computes_weights_and_pnl(
    tmp_path: Path, sample_price_data: dict[str, pd.DataFrame]
) -> None:
    """建玉の評価額・構成比・含み損益を算出し、現金と合わせて 100% になる。

    WHY: 構成比の分母に現金を含めないと、現金比率が高い口座で
    「フルインベストしている」ように誤読される。
    """
    fp = tmp_path / "2026-01-05.moomoo.jsonl"
    _write_jsonl(fp, [
        {
            "event_type": "order_reconciled", "event_id": "e1", "order_id": "o1",
            "occurred_at": "2026-01-05T14:00:00+00:00", "broker": "moomoo",
            "asset_class": "US", "action": "buy", "ticker": "US.TQQQ",
            "quantity": 100, "order_status": "FILLED_ALL", "dealt_qty": 100.0,
            "dealt_avg_price": 100.0, "is_filled": True, "portfolio_id": "cb_v1",
            "sub_strategy_id": "tqqq_v1", "run_mode": "paper",
        },
    ])
    receipts = load_receipts_from_jsonl(fp, portfolio_id="cb_v1")
    idx = sample_price_data["US.TQQQ"].index
    positions = reconstruct_position_series(receipts, price_index=idx)
    snap = build_position_snapshot(
        receipts=receipts,
        positions=positions,
        price_data_map=sample_price_data,
        sub_strategy_to_ticker={"tqqq_v1": "US.TQQQ"},
        cash_balance=90_000.0,
    )

    assert len(snap["positions"]) == 1
    p = snap["positions"][0]
    last = float(sample_price_data["US.TQQQ"]["Close"].iloc[-1])
    assert p["ticker"] == "US.TQQQ"
    assert p["qty"] == pytest.approx(100.0)
    assert p["avg_cost"] == pytest.approx(100.0)
    assert p["market_value"] == pytest.approx(100 * last)
    assert p["unrealized_pnl"] == pytest.approx((last - 100.0) * 100)
    # 構成比の分母は建玉評価額 + 現金
    assert snap["total_value"] == pytest.approx(100 * last + 90_000.0)
    assert p["weight_pct"] == pytest.approx(100 * last / snap["total_value"] * 100)


def test_build_position_snapshot_skips_zero_qty(
    tmp_path: Path, sample_price_data: dict[str, pd.DataFrame]
) -> None:
    """全部売却して数量 0 になった銘柄は建玉一覧に出さない。"""
    fp = tmp_path / "2026-01-05.moomoo.jsonl"
    _write_jsonl(fp, [
        {
            "event_type": "order_reconciled", "event_id": "e1", "order_id": "o1",
            "occurred_at": "2026-01-05T14:00:00+00:00", "broker": "moomoo",
            "asset_class": "US", "action": "buy", "ticker": "US.TQQQ",
            "quantity": 100, "order_status": "FILLED_ALL", "dealt_qty": 100.0,
            "dealt_avg_price": 100.0, "is_filled": True, "portfolio_id": "cb_v1",
            "sub_strategy_id": "tqqq_v1", "run_mode": "paper",
        },
        {
            "event_type": "order_reconciled", "event_id": "e2", "order_id": "o2",
            "occurred_at": "2026-01-06T14:00:00+00:00", "broker": "moomoo",
            "asset_class": "US", "action": "sell", "ticker": "US.TQQQ",
            "quantity": 100, "order_status": "FILLED_ALL", "dealt_qty": 100.0,
            "dealt_avg_price": 110.0, "is_filled": True, "portfolio_id": "cb_v1",
            "sub_strategy_id": "tqqq_v1", "run_mode": "paper",
        },
    ])
    receipts = load_receipts_from_jsonl(fp, portfolio_id="cb_v1")
    idx = sample_price_data["US.TQQQ"].index
    positions = reconstruct_position_series(receipts, price_index=idx)
    snap = build_position_snapshot(
        receipts=receipts, positions=positions,
        price_data_map=sample_price_data,
        sub_strategy_to_ticker={"tqqq_v1": "US.TQQQ"},
        cash_balance=100_000.0,
    )
    assert snap["positions"] == []
    assert snap["total_value"] == pytest.approx(100_000.0)
```

import に `build_position_snapshot` を追加する。

- [ ] **Step 2: テストが失敗することを確認**

Run: `uv run pytest tests/test_pinescript/test_portfolio_alert_replay.py -k position_snapshot -v`
Expected: FAIL — `ImportError: cannot import name 'build_position_snapshot'`

- [ ] **Step 3: 実装する**

```python
def build_position_snapshot(
    *,
    receipts: list[AlertReceipt],
    positions: dict[str, pd.Series],
    price_data_map: dict[str, pd.DataFrame],
    sub_strategy_to_ticker: dict[str, str],
    cash_balance: float,
) -> dict[str, Any]:
    """最終時点の建玉スナップショットを組み立てる。

    ``weight_pct`` の分母は「建玉評価額合計 + 現金」。現金を分母から
    外すと、現金比率が高い口座でフルインベストしているように誤読される。
    """
    basis = average_cost_basis(receipts, price_data_map=price_data_map)
    rows: list[dict[str, Any]] = []
    for sid, series in positions.items():
        ticker = sub_strategy_to_ticker.get(sid)
        if ticker is None or len(series) == 0:
            continue
        qty = float(series.iloc[-1])
        if qty <= 0:
            continue
        price_df = price_data_map.get(ticker)
        if price_df is None or price_df.empty:
            continue
        last_price = float(_resolve_close_series(price_df).ffill().iloc[-1])
        avg_cost = basis.get(ticker, (0.0, 0.0))[1]
        market_value = qty * last_price
        pnl = (last_price - avg_cost) * qty
        rows.append(
            {
                "ticker": ticker,
                "sub_strategy_id": sid,
                "qty": qty,
                "avg_cost": avg_cost,
                "last_price": last_price,
                "market_value": market_value,
                "weight_pct": 0.0,  # total_value 確定後に埋める
                "unrealized_pnl": pnl,
                "unrealized_pnl_pct": (pnl / (avg_cost * qty) * 100.0) if avg_cost and qty else 0.0,
            }
        )

    total_value = sum(r["market_value"] for r in rows) + cash_balance
    if total_value:
        for r in rows:
            r["weight_pct"] = r["market_value"] / total_value * 100.0
    rows.sort(key=lambda r: r["market_value"], reverse=True)
    return {"positions": rows, "cash": cash_balance, "total_value": total_value}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `uv run pytest tests/test_pinescript/test_portfolio_alert_replay.py -k position_snapshot -v`
Expected: PASS（2 件）

- [ ] **Step 5: コミット**

```bash
git add src/alpha_forge/pinescript/portfolio_alert_replay.py tests/test_pinescript/test_portfolio_alert_replay.py
git commit -m "feat(live): 建玉スナップショット（評価額・構成比・含み損益）を追加"
```

---

## Task 3: ベンチマーク equity の構築

**Files:**
- Modify: `src/alpha_forge/pinescript/portfolio_alert_replay.py`
- Test: `tests/test_pinescript/test_portfolio_alert_replay.py`

**Interfaces:**
- Consumes: 既存の `_resolve_close_series()` / `_utc_index()`
- Produces: `normalize_to_initial(series, index, initial_capital) -> list[tuple[str, float]]`

`benchmark_equity` と `backtest_equity` は「別系列を live のインデックスに合わせて initial_capital 基準へ正規化する」という同一処理なので、関数を 1 本にまとめる。

- [ ] **Step 1: 失敗するテストを書く**

```python
def test_normalize_to_initial_rebases_series() -> None:
    """別系列を live インデックスに合わせ、先頭 = initial_capital に正規化する。

    WHY: Live / 指数 / BT を同一軸に乗せないと、乖離を超過リターンとして
    読めない。
    """
    idx = pd.date_range("2026-01-05", periods=4, freq="D", tz="UTC")
    src = pd.Series([200.0, 210.0, 190.0, 220.0], index=idx)
    out = normalize_to_initial(src, idx, 100_000.0)

    assert len(out) == 4
    assert out[0][1] == pytest.approx(100_000.0)
    assert out[1][1] == pytest.approx(105_000.0)  # 210/200
    assert out[3][1] == pytest.approx(110_000.0)  # 220/200
    assert out[0][0].startswith("2026-01-05")


def test_normalize_to_initial_forward_fills_missing_dates() -> None:
    """live インデックスに無い日は直前値で埋める（休場日の欠損対策）。"""
    src_idx = pd.DatetimeIndex(["2026-01-05", "2026-01-07"], tz="UTC")
    src = pd.Series([200.0, 220.0], index=src_idx)
    live_idx = pd.date_range("2026-01-05", periods=3, freq="D", tz="UTC")
    out = normalize_to_initial(src, live_idx, 100_000.0)

    assert [round(v, 2) for _, v in out] == [100_000.0, 100_000.0, 110_000.0]


def test_normalize_to_initial_returns_empty_when_base_is_zero() -> None:
    """基準値が 0 なら正規化不能。例外にせず空を返す。"""
    idx = pd.date_range("2026-01-05", periods=2, freq="D", tz="UTC")
    out = normalize_to_initial(pd.Series([0.0, 1.0], index=idx), idx, 100_000.0)
    assert out == []
```

import に `normalize_to_initial` を追加する。

- [ ] **Step 2: テストが失敗することを確認**

Run: `uv run pytest tests/test_pinescript/test_portfolio_alert_replay.py -k normalize_to_initial -v`
Expected: FAIL — `ImportError: cannot import name 'normalize_to_initial'`

- [ ] **Step 3: 実装する**

```python
def normalize_to_initial(
    series: pd.Series,
    index: pd.DatetimeIndex,
    initial_capital: float,
) -> list[tuple[str, float]]:
    """``series`` を ``index`` に揃え、先頭を ``initial_capital`` に正規化する。

    Live / 指数 B&H / backtest combine を同一軸に乗せるための共通処理。
    ``index`` に無い日は直前値で前方補完する（休場日対策）。
    基準値が 0 / NaN で正規化できない場合は空リストを返す。
    """
    if series is None or len(series) == 0 or len(index) == 0:
        return []
    src = series.copy()
    src.index = _utc_index(pd.DatetimeIndex(src.index))
    idx_utc = _utc_index(index)
    aligned = src.reindex(idx_utc.union(src.index)).ffill().reindex(idx_utc).ffill()
    aligned = aligned.dropna()
    if aligned.empty:
        return []
    base = float(aligned.iloc[0])
    if not base:
        return []
    out: list[tuple[str, float]] = []
    for ts, value in aligned.items():
        if pd.isna(value):
            continue
        out.append((pd.Timestamp(ts).isoformat(), initial_capital * float(value) / base))
    return out
```

- [ ] **Step 4: テストが通ることを確認**

Run: `uv run pytest tests/test_pinescript/test_portfolio_alert_replay.py -k normalize_to_initial -v`
Expected: PASS（3 件）

- [ ] **Step 5: コミット**

```bash
git add src/alpha_forge/pinescript/portfolio_alert_replay.py tests/test_pinescript/test_portfolio_alert_replay.py
git commit -m "feat(live): 系列を initial_capital 基準へ正規化する共通関数を追加"
```

---

## Task 4: `build_combine_live_summary` への配線

**Files:**
- Modify: `src/alpha_forge/live/replay.py`
- Test: `tests/test_live/test_replay_combine.py`

**Interfaces:**
- Consumes: `build_position_snapshot()`（Task 2）、`normalize_to_initial()`（Task 3）、既存の `compute_cash_series()` / `reconstruct_position_series()`
- Produces: `build_combine_live_summary(..., benchmark_symbol: str | None = None)` の戻り値に `benchmark_equity` / `backtest_equity` / `positions` / `cash` / `total_value` を追加

- [ ] **Step 1: 失敗するテストを書く**

`tests/test_live/test_replay_combine.py` に追記。`_write_events` の fixture は既に `dealt_avg_price` を持つ前提（PR #1333 で追加済み）。

```python
def test_build_live_summary_includes_positions(tmp_path: Path) -> None:
    """建玉スナップショットが戻り値に含まれる。"""
    ev = tmp_path / "events"
    ev.mkdir()
    _write_events(ev)
    store = _FakeStore({"TQQQ": _price_df(), "GLD": _price_df()})
    strategies = [_scaffold("TQQQ", "tqqq_v1"), _scaffold("GLD", "gld_v1")]

    out = build_combine_live_summary(
        strategies=strategies, data_store=store, events_path=ev,
        portfolio_id="cb_live", initial_capital=100_000.0,
    )
    tickers = {p["ticker"] for p in out["positions"]}
    assert tickers == {"US.TQQQ", "US.GLD"}
    # 建玉評価額 + 現金 = total_value
    assert out["total_value"] == pytest.approx(
        sum(p["market_value"] for p in out["positions"]) + out["cash"]
    )


def test_build_live_summary_benchmark_equity(tmp_path: Path) -> None:
    """benchmark_symbol 指定時、指数 B&H が initial_capital 基準で入る。"""
    ev = tmp_path / "events"
    ev.mkdir()
    _write_events(ev)
    store = _FakeStore({"TQQQ": _price_df(), "GLD": _price_df(), "QQQ": _price_df()})
    strategies = [_scaffold("TQQQ", "tqqq_v1"), _scaffold("GLD", "gld_v1")]

    out = build_combine_live_summary(
        strategies=strategies, data_store=store, events_path=ev,
        portfolio_id="cb_live", initial_capital=100_000.0,
        benchmark_symbol="QQQ",
    )
    bench = out["benchmark_equity"]
    assert bench, "benchmark_equity が空"
    assert bench[0][1] == pytest.approx(100_000.0)
    # live equity と同じ日付範囲に揃う
    assert bench[0][0] == out["equity"][0][0]
    assert bench[-1][0] == out["equity"][-1][0]


def test_build_live_summary_missing_benchmark_does_not_fail(tmp_path: Path) -> None:
    """指数の価格データが無くても replay 全体は成功する（ベンチマークのみ空）。

    WHY: ベンチマークは付加情報。これで運用実績の再構築ごと失敗させない。
    """
    ev = tmp_path / "events"
    ev.mkdir()
    _write_events(ev)
    store = _FakeStore({"TQQQ": _price_df(), "GLD": _price_df()})  # QQQ 無し
    strategies = [_scaffold("TQQQ", "tqqq_v1"), _scaffold("GLD", "gld_v1")]

    out = build_combine_live_summary(
        strategies=strategies, data_store=store, events_path=ev,
        portfolio_id="cb_live", initial_capital=100_000.0,
        benchmark_symbol="QQQ",
    )
    assert out["benchmark_equity"] == []
    assert out["equity"], "live equity は通常どおり構築される"


def test_build_live_summary_backtest_equity_with_compare(tmp_path: Path) -> None:
    """--compare 相当（combined_engine 指定）時に backtest_equity が入る。"""
    ev = tmp_path / "events"
    ev.mkdir()
    _write_events(ev)
    store = _FakeStore({"TQQQ": _price_df(), "GLD": _price_df()})
    strategies = [_scaffold("TQQQ", "tqqq_v1"), _scaffold("GLD", "gld_v1")]

    idx = _price_df().index

    class _FakeEngine:
        def run(self, strategies, data_map, *, allocation="equal", weights=None):
            return {
                "combined": {
                    "metrics": {"sharpe_ratio": 1.5},
                    "value": pd.Series(range(200, 200 + len(idx)), index=idx, dtype=float),
                }
            }

    out = build_combine_live_summary(
        strategies=strategies, data_store=store, events_path=ev,
        portfolio_id="cb_live", initial_capital=100_000.0,
        combined_engine=_FakeEngine(),
    )
    assert out["backtest_equity"], "backtest_equity が空"
    assert out["backtest_equity"][0][1] == pytest.approx(100_000.0)


def test_build_live_summary_backtest_equity_empty_without_compare(tmp_path: Path) -> None:
    """combined_engine 未指定なら backtest_equity は空。"""
    ev = tmp_path / "events"
    ev.mkdir()
    _write_events(ev)
    store = _FakeStore({"TQQQ": _price_df(), "GLD": _price_df()})
    strategies = [_scaffold("TQQQ", "tqqq_v1"), _scaffold("GLD", "gld_v1")]

    out = build_combine_live_summary(
        strategies=strategies, data_store=store, events_path=ev,
        portfolio_id="cb_live", initial_capital=100_000.0,
    )
    assert out["backtest_equity"] == []
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `uv run pytest tests/test_live/test_replay_combine.py -v`
Expected: FAIL — `KeyError: 'positions'` 等

- [ ] **Step 3: 実装する**

`src/alpha_forge/live/replay.py` を書き換える。`replay_alert_log_metrics` は equity しか返さないため、ここでは receipts / positions / cash を自前で組み立てる形に変える。

```python
"""（既存 docstring は維持）"""
from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd

from alpha_forge.pinescript.portfolio_alert_replay import (
    build_position_snapshot,
    compute_cash_series,
    compute_equity_curve,
    compute_metrics,
    load_receipts_from_jsonl,
    normalize_to_initial,
    reconstruct_position_series,
    _resolve_close_series,
    _slice_live_period,
)

logger = logging.getLogger(__name__)
```

`build_combine_live_summary` の本体を次に置き換える（`_resolve_inputs` は既存のまま）。

```python
def build_combine_live_summary(
    *,
    strategies: list[Any],
    data_store: Any,
    events_path: Path | str,
    portfolio_id: str,
    initial_capital: float = 100_000.0,
    since: datetime | None = None,
    combined_engine: Any | None = None,
    allocation: str = "equal",
    weights: dict[str, float] | None = None,
    benchmark_symbol: str | None = None,
) -> dict[str, Any]:
    """同期イベントから position ベース live metrics を算出する。

    ``benchmark_symbol`` を渡すと指数 buy&hold を、``combined_engine`` を
    渡すと backtest combine を、それぞれ live 期間・``initial_capital``
    基準に正規化した比較系列として返す。
    """
    sub_map, price_map, data_map = _resolve_inputs(strategies, data_store)
    if not price_map:
        raise ValueError(
            "position 再構築のため少なくとも 1 銘柄の価格データが必要です"
            "（alpha-forge data fetch で取得してください）"
        )

    receipts = load_receipts_from_jsonl(
        events_path, portfolio_id=portfolio_id, since=since
    )
    idx = next(iter(price_map.values())).index
    positions = reconstruct_position_series(receipts, price_index=idx)
    cash_series = compute_cash_series(
        receipts, price_index=idx, price_data_map=price_map
    )
    equity_series = _slice_live_period(
        compute_equity_curve(
            positions,
            price_map,
            initial_capital=initial_capital,
            sub_strategy_to_ticker=sub_map,
            cash_series=cash_series,
        ),
        receipts,
    )

    equity: list[tuple[str, float]] = [
        (pd.Timestamp(ts).isoformat(), float(v))
        for ts, v in equity_series.items()
        if pd.notna(v)
    ]
    live_index = pd.DatetimeIndex([ts for ts, _ in equity_series.items()])

    snapshot = build_position_snapshot(
        receipts=receipts,
        positions=positions,
        price_data_map=price_map,
        sub_strategy_to_ticker=sub_map,
        cash_balance=initial_capital + (float(cash_series.iloc[-1]) if len(cash_series) else 0.0),
    )

    out: dict[str, Any] = {
        "live_metrics": compute_metrics(equity_series),
        "receipts_count": len(receipts),
        "equity": equity,
        "sub_strategies": sorted(sub_map.keys()),
        "backtest_metrics": None,
        "benchmark_equity": _benchmark_equity(
            data_store, benchmark_symbol, strategies, live_index, initial_capital
        ),
        "backtest_equity": [],
        "positions": snapshot["positions"],
        "cash": snapshot["cash"],
        "total_value": snapshot["total_value"],
    }

    if combined_engine is not None and len(data_map) >= 2:
        res = combined_engine.run(
            strategies, data_map, allocation=allocation, weights=weights
        )
        combined = res["combined"]
        out["backtest_metrics"] = combined["metrics"]
        bt_value = combined.get("value")
        if bt_value is not None and len(live_index):
            out["backtest_equity"] = normalize_to_initial(
                bt_value, live_index, initial_capital
            )
    return out


def _benchmark_equity(
    data_store: Any,
    symbol: str | None,
    strategies: list[Any],
    live_index: pd.DatetimeIndex,
    initial_capital: float,
) -> list[tuple[str, float]]:
    """指数 buy&hold を live 期間・initial_capital 基準へ正規化する。

    価格データが無い場合は警告して空を返す。ベンチマークは付加情報であり、
    これで replay 全体を失敗させない。
    """
    if not symbol or len(live_index) == 0:
        return []
    interval = (strategies[0].timeframe if strategies else None) or "1d"
    try:
        df = data_store.load(symbol, interval)
    except FileNotFoundError:
        logger.warning(
            "ベンチマーク %s (%s) の価格データが見つかりません。"
            "ベンチマーク比較を省略します（alpha-forge data fetch %s で取得できます）",
            symbol, interval, symbol,
        )
        return []
    try:
        close = _resolve_close_series(df)
    except KeyError:
        logger.warning("ベンチマーク %s に Close 列がありません。省略します", symbol)
        return []
    return normalize_to_initial(close, live_index, initial_capital)
```

- [ ] **Step 4: テストが通ることを確認**

Run: `uv run pytest tests/test_live/ tests/test_pinescript/test_portfolio_alert_replay.py -v`
Expected: PASS（既存テストを含め全件）

- [ ] **Step 5: コミット**

```bash
git add src/alpha_forge/live/replay.py tests/test_live/test_replay_combine.py
git commit -m "feat(live): ベンチマーク・BT 比較系列と建玉スナップショットを replay に配線"
```

---

## Task 5: 永続化（モデル・スキーマ・マイグレーション）

**Files:**
- Modify: `src/alpha_forge/live/models.py`
- Modify: `src/alpha_forge/live/db_repository.py`
- Modify: `src/alpha_forge/commands/live.py`（`save_position_summary` に渡す値）
- Test: `tests/test_live/test_position_summary_migration.py`（新規）

**Interfaces:**
- Consumes: Task 4 の戻り値キー（`benchmark_equity` / `backtest_equity` / `positions`）
- Produces: `PositionLiveSummary(benchmark_equity=..., backtest_equity=..., positions=...)` と、`live_position_summaries` の 3 列

- [ ] **Step 1: 失敗するテストを書く**

`tests/test_live/test_position_summary_migration.py` を新規作成。

```python
"""live_position_summaries への列追加マイグレーションのテスト。

metadata.create_all() は既存テーブルに列を追加しない。旧スキーマの DB を
開いたときに ALTER TABLE で列が足されることを保証する。これが無いと
既存ユーザーの backtest_results.db で INSERT が
"table has no column named benchmark_equity_json" で落ちる。
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

from alpha_forge.live.db_repository import SQLiteLiveRepository
from alpha_forge.live.models import PositionLiveSummary

_OLD_SCHEMA = """
CREATE TABLE live_position_summaries (
    portfolio_id TEXT NOT NULL PRIMARY KEY,
    metrics_json TEXT NOT NULL,
    backtest_metrics_json TEXT,
    equity_json TEXT NOT NULL,
    receipts_count INTEGER NOT NULL,
    sub_strategies_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
)
"""


def test_migrates_old_schema_and_saves(tmp_path: Path) -> None:
    db = tmp_path / "backtest_results.db"
    conn = sqlite3.connect(db)
    conn.execute(_OLD_SCHEMA)
    conn.commit()
    conn.close()

    repo = SQLiteLiveRepository(db)
    repo.save_position_summary(
        PositionLiveSummary(
            portfolio_id="cb_v1",
            metrics={"sharpe_ratio": 1.0},
            equity=[("2026-01-05T00:00:00", 100_000.0)],
            benchmark_equity=[("2026-01-05T00:00:00", 100_000.0)],
            backtest_equity=[("2026-01-05T00:00:00", 100_000.0)],
            positions=[{"ticker": "US.TQQQ", "qty": 10.0}],
            receipts_count=1,
            sub_strategies=["tqqq_v1"],
        )
    )

    loaded = repo.load_position_summary("cb_v1")
    assert loaded is not None
    assert loaded.benchmark_equity == [("2026-01-05T00:00:00", 100_000.0)]
    assert loaded.positions == [{"ticker": "US.TQQQ", "qty": 10.0}]


def test_migration_is_idempotent(tmp_path: Path) -> None:
    """2 回開いても duplicate column で落ちない。"""
    db = tmp_path / "backtest_results.db"
    SQLiteLiveRepository(db)
    SQLiteLiveRepository(db)  # 例外が出ないこと
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `uv run pytest tests/test_live/test_position_summary_migration.py -v`
Expected: FAIL — `TypeError: unexpected keyword argument 'benchmark_equity'`

- [ ] **Step 3: 実装する**

`models.py` の `PositionLiveSummary` に追加:

```python
    benchmark_equity: list[tuple[str, float]] = Field(default_factory=list)
    backtest_equity: list[tuple[str, float]] = Field(default_factory=list)
    positions: list[dict[str, Any]] = Field(default_factory=list)
```

`models.py` の import に `from typing import Any` が無ければ追加する。

`db_repository.py` のテーブル定義に 3 列追加:

```python
    Column("benchmark_equity_json", Text),   # 指数 B&H（nullable。未指定時は NULL）
    Column("backtest_equity_json", Text),    # BT combine（--compare 時のみ）
    Column("positions_json", Text),          # 建玉スナップショット
```

`SQLiteLiveRepository.__init__` の `metadata.create_all(self._engine)` 直後に追加（`backtest/db_repository.py` と同じ流儀）:

```python
        for alter_sql in (
            "ALTER TABLE live_position_summaries ADD COLUMN benchmark_equity_json TEXT",
            "ALTER TABLE live_position_summaries ADD COLUMN backtest_equity_json TEXT",
            "ALTER TABLE live_position_summaries ADD COLUMN positions_json TEXT",
        ):
            try:
                with self._engine.begin() as conn:
                    conn.execute(text(alter_sql))
            except OperationalError as e:
                if "duplicate column name" not in str(e).lower():
                    raise
```

`text` / `OperationalError` の import が無ければ追加する（`from sqlalchemy import text` / `from sqlalchemy.exc import OperationalError`）。

`save_position_summary` の `values` に追加:

```python
            benchmark_equity_json=json.dumps(summary.benchmark_equity, ensure_ascii=False),
            backtest_equity_json=json.dumps(summary.backtest_equity, ensure_ascii=False),
            positions_json=json.dumps(summary.positions, ensure_ascii=False),
```

`load_position_summary` の戻り値に追加（`getattr` で旧行にも耐える）:

```python
            benchmark_equity=[
                tuple(x) for x in json.loads(getattr(row, "benchmark_equity_json", None) or "[]")
            ],
            backtest_equity=[
                tuple(x) for x in json.loads(getattr(row, "backtest_equity_json", None) or "[]")
            ],
            positions=json.loads(getattr(row, "positions_json", None) or "[]"),
```

`commands/live.py` の `store.save_position_summary(...)` に 3 フィールドを渡す:

```python
            benchmark_equity=result["benchmark_equity"],
            backtest_equity=result["backtest_equity"],
            positions=result["positions"],
```

- [ ] **Step 4: テストが通ることを確認**

Run: `uv run pytest tests/test_live/ -v`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/alpha_forge/live/ src/alpha_forge/commands/live.py tests/test_live/test_position_summary_migration.py
git commit -m "feat(live): 比較系列と建玉を live_position_summaries に永続化（既存 DB は ALTER TABLE で移行）"
```

---

## Task 6: `LiveConfig` と `--benchmark` CLI

**Files:**
- Modify: `src/alpha_forge/config.py`
- Modify: `src/alpha_forge/commands/live.py`
- Test: `tests/test_cli_live_benchmark.py`（新規）

**Interfaces:**
- Consumes: Task 4 の `benchmark_symbol` 引数
- Produces: `AppConfig.live: LiveConfig`（`benchmark: str | None`）、`live replay --benchmark SYMBOL`

- [ ] **Step 1: 失敗するテストを書く**

`tests/test_cli_live_benchmark.py` を新規作成。`tests/test_cli_live_replay_1332.py` の fixture 構成を踏襲する。

```python
"""live replay --benchmark の回帰テスト。

ベンチマーク銘柄は CLI で都度指定でき、未指定なら forge.yaml の
live.benchmark にフォールバックする。どちらも未指定ならベンチマーク線は
出さない（後方互換）。
"""
from __future__ import annotations

from pathlib import Path
from typing import Any
from unittest.mock import MagicMock

import pytest
from click.testing import CliRunner

from alpha_forge.cli import cli

_FAKE_RESULT = {
    "live_metrics": {"sharpe_ratio": 0.4, "cagr_pct": 1.0,
                     "max_drawdown_pct": 0.5, "total_return_pct": -0.5},
    "backtest_metrics": None,
    "equity": [],
    "receipts_count": 5,
    "sub_strategies": ["a_v1", "b_v1"],
    "benchmark_equity": [],
    "backtest_equity": [],
    "positions": [],
    "cash": 0.0,
    "total_value": 0.0,
}


@pytest.fixture
def captured(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    import alpha_forge.commands._helpers as helpers
    import alpha_forge.commands.live as live_cmd
    from alpha_forge.config import AppConfig, JournalConfig, LiveConfig
    from alpha_forge.live.store import LiveStore

    app_config = AppConfig(
        journal=JournalConfig(journal_path=tmp_path / "journal", auto_record=True),
        live=LiveConfig(benchmark="QQQ"),
    )
    monkeypatch.setattr(helpers, "get_config", lambda: app_config)
    monkeypatch.setattr(
        live_cmd, "_get_store",
        lambda: LiveStore(tmp_path / "live", db_path=tmp_path / "backtest_results.db"),
    )
    monkeypatch.setattr(helpers, "load_strategy", lambda sid: MagicMock(strategy_id=sid))
    monkeypatch.setattr("alpha_forge.data.store.DataStore", lambda *a, **k: MagicMock())

    seen: dict[str, Any] = {}

    def _fake(**kwargs: Any) -> dict[str, Any]:
        seen.update(kwargs)
        return _FAKE_RESULT

    monkeypatch.setattr("alpha_forge.live.replay.build_combine_live_summary", _fake)
    return seen


def _invoke(*extra: str) -> Any:
    return CliRunner().invoke(
        cli,
        ["live", "replay", "pf_1", "--combine-strategies", "a_v1,b_v1", "--json", *extra],
    )


def test_benchmark_flag_overrides_config(captured: dict[str, Any]) -> None:
    result = _invoke("--benchmark", "SPY")
    assert result.exit_code == 0, result.output
    assert captured["benchmark_symbol"] == "SPY"


def test_benchmark_falls_back_to_config(captured: dict[str, Any]) -> None:
    result = _invoke()
    assert result.exit_code == 0, result.output
    assert captured["benchmark_symbol"] == "QQQ"


def test_benchmark_appears_in_help() -> None:
    result = CliRunner().invoke(cli, ["live", "replay", "--help"])
    assert result.exit_code == 0, result.output
    assert "--benchmark" in result.output
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `uv run pytest tests/test_cli_live_benchmark.py -v`
Expected: FAIL — `ImportError: cannot import name 'LiveConfig'`

- [ ] **Step 3: 実装する**

`config.py` に `RemoteConfig` の近くへ追加:

```python
class LiveConfig(BaseModel):
    """ライブ実績（live replay）の既定設定。"""

    benchmark: str | None = Field(
        default=None,
        description="live replay の既定ベンチマーク銘柄（例: QQQ）。--benchmark で上書き可",
    )
```

`AppConfig` にフィールド追加:

```python
    live: LiveConfig = Field(default_factory=LiveConfig)
```

`commands/live.py` の `live_replay` にオプション追加（`--initial-capital` の隣）:

```python
@click.option(
    "--benchmark",
    "benchmark",
    default=None,
    help=L(
        ja="比較する指数銘柄 (既定: forge.yaml の live.benchmark)",
        en="Index symbol to compare against (default: live.benchmark in forge.yaml)",
    ),
)
```

シグネチャに `benchmark: str | None,` を追加し、`build_combine_live_summary` 呼び出しに渡す:

```python
        benchmark_symbol=benchmark or config.live.benchmark,
```

- [ ] **Step 4: テストが通ることを確認**

Run: `uv run pytest tests/test_cli_live_benchmark.py -v`
Expected: PASS（3 件）

- [ ] **Step 5: コミット**

```bash
git add src/alpha_forge/config.py src/alpha_forge/commands/live.py tests/test_cli_live_benchmark.py
git commit -m "feat(live): live replay --benchmark と forge.yaml の live.benchmark を追加"
```

---

## Task 7: alpha-forge のゲート・ドキュメント・PR

**Files:**
- Modify: `docs/CODEMAPS/CODEBASE_UML.md`（自動生成）
- Modify: `config/default.yaml` と `src/alpha_forge/resources/config/default.yaml`（`live.benchmark` のコメント追記）

- [ ] **Step 1: config テンプレートに live セクションを追記**

`config/default.yaml` の末尾に追加:

```yaml
# ライブ実績（live replay）の既定設定
live:
  # live replay の既定ベンチマーク銘柄。--benchmark で都度上書きできる。
  # 未設定ならベンチマーク比較線は表示しない。
  benchmark: ""
```

- [ ] **Step 2: resources を同期する**

Run: `uv run python scripts/sanitize_resources.py`
Expected: `resources/config/default.yaml` が更新される

- [ ] **Step 3: codemap を再生成する**

Run: `uv run python scripts/generate_codemap.py`
Expected: `wrote .../CODEBASE_UML.md`

- [ ] **Step 4: ローカルフルゲートを実行する**

パイプを使わず 1 行ずつ実行し、終了コードを確認する（パイプすると exit code が化ける）。

```bash
uv run pytest tests/ -q
uv run ruff check src/ tests/
uv run mypy
uv run python scripts/generate_codemap.py --check > /dev/null 2>&1; echo "codemap=$?"
uv run python scripts/sanitize_resources.py --check > /dev/null 2>&1; echo "resources=$?"
```

Expected: pytest 全 PASS / ruff `All checks passed!` / mypy `Success` / codemap=0 / resources=0

- [ ] **Step 5: コミットして PR を作成する**

```bash
git add -A
git commit -m "chore: live.benchmark 設定を config テンプレートへ追記し codemap を再生成"
git push -u origin feat/live-benchmark-positions
gh pr create --repo ysakae/alpha-forge --base main \
  --title "feat(live): live replay にベンチマーク比較と建玉スナップショットを追加" \
  --body-file <(printf '%s\n' "設計: alpha-visualizer/docs/superpowers/specs/2026-07-25-live-equity-rich-design.md")
```

> PR 本文はインラインの `--body` ではなく必ず `--body-file` を使う（バッククォートが壊れるため）。実際には本文をファイルに書き起こしてから渡すこと。

---

## Task 8: visualizer のデータ契約（DB・repository・schema・TS 型）

**Files:**
- Modify: `src/alpha_visualizer/db.py`
- Modify: `src/alpha_visualizer/repositories/live.py`
- Modify: `src/alpha_visualizer/schemas/live.py`
- Modify: `frontend/src/api/types.ts`
- Test: `tests/test_repositories_live.py`（既存があれば追記、無ければ新規）

**Interfaces:**
- Consumes: Task 5 が書き込む 3 列
- Produces: `LiveSummary.benchmark_equity?: [string, number][]` / `backtest_equity?: [string, number][]` / `positions?: LivePosition[]` / `cash?: number` / `total_value?: number`

- [ ] **Step 1: 失敗するテストを書く**

```python
def test_load_position_summary_parses_new_columns(tmp_path: Path) -> None:
    """新列（ベンチマーク・BT・建玉）がパースされる。"""
    # 既存テストの DB 構築ヘルパーに倣って live_position_summaries に 1 行入れる
    ...
    out = repo.load_position_summary("cb_v1")
    assert out["benchmark_equity"] == [["2026-01-05T00:00:00", 100000.0]]
    assert out["positions"][0]["ticker"] == "US.TQQQ"


def test_load_position_summary_tolerates_old_schema(tmp_path: Path) -> None:
    """新列を持たない旧 DB でも例外にせず空として返す。

    WHY: 列を追加した以上、既存 DB を読む経路が必ず存在する。ここで
    落ちると Live ページ全体が 500 になる。
    """
    ...
    out = repo.load_position_summary("cb_v1")
    assert out["benchmark_equity"] == []
    assert out["positions"] == []
```

> 実装者へ: 既存の `tests/` に `live_position_summaries` へ行を入れているテストがある。そのセットアップをコピーし、旧スキーマ版は `CREATE TABLE` を 7 列で書いて再現すること。

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd alpha-visualizer && uv run pytest tests/ -k position_summary -v`
Expected: FAIL — `KeyError: 'benchmark_equity'`

- [ ] **Step 3: 実装する**

`db.py` の `live_position_summaries` に追加:

```python
    Column("benchmark_equity_json", Text),
    Column("backtest_equity_json", Text),
    Column("positions_json", Text),
```

`repositories/live.py` の `load_position_summary` の戻り dict に追加。旧 DB では列自体が無いため `_mapping` に存在しない。`m.get(...)` ではなく `dict(m)` にしてから取得する。

```python
        m = dict(rows[0]._mapping)
        return {
            "portfolio_id": m["portfolio_id"],
            "metrics": _parse_json(m["metrics_json"], {}),
            "backtest_metrics": _parse_json(m["backtest_metrics_json"], None),
            "equity": _parse_json(m["equity_json"], []),
            "receipts_count": m["receipts_count"],
            "sub_strategies": _parse_json(m["sub_strategies_json"], []),
            "updated_at": m["updated_at"],
            "benchmark_equity": _parse_json(m.get("benchmark_equity_json"), []),
            "backtest_equity": _parse_json(m.get("backtest_equity_json"), []),
            "positions": _parse_json(m.get("positions_json"), []),
        }
```

> 旧 DB では `SELECT live_position_summaries` が新列を含む SQL を投げて `no such column` になる。`_fetch_all` は `no such table` のみ空扱いにしているため、`no such column` も同様に扱うよう条件を広げる:
> ```python
>             msg = str(exc).lower()
>             if "no such table" in msg or "no such column" in msg:
> ```
> ただしこの場合サマリ全体が空になり Live ページが「無し」表示になる。**より良いのは列を明示 SELECT せず `SELECT *` 相当にすること**だが、SQLAlchemy Core では Table 定義に依存する。旧 DB 救済を優先し、`no such column` を検知したら 7 列のみを選ぶフォールバッククエリを発行する実装とする。

`schemas/live.py` に型を追加:

```python
class LivePosition(BaseModel):
    """建玉スナップショットの 1 銘柄。"""

    model_config = ConfigDict(extra="allow")

    ticker: str
    sub_strategy_id: str | None = None
    qty: float = 0.0
    avg_cost: float = 0.0
    last_price: float = 0.0
    market_value: float = 0.0
    weight_pct: float = 0.0
    unrealized_pnl: float = 0.0
    unrealized_pnl_pct: float = 0.0
```

`frontend/src/api/types.ts` の `LiveSummary` に追加（**手書き。`pnpm run gen` の対象外**）:

```ts
  /** 指数 buy&hold を initial_capital 基準に正規化した系列 */
  benchmark_equity?: [string, number][]
  /** backtest combine を initial_capital 基準に正規化した系列 */
  backtest_equity?: [string, number][]
  positions?: LivePosition[]
  cash?: number
  total_value?: number
```

同ファイルに:

```ts
export interface LivePosition {
  ticker: string
  sub_strategy_id?: string | null
  qty: number
  avg_cost: number
  last_price: number
  market_value: number
  weight_pct: number
  unrealized_pnl: number
  unrealized_pnl_pct: number
}
```

- [ ] **Step 4: テストとフィクスチャ再生成**

```bash
uv run pytest tests/ -q
uv run ruff check src/ tests/
uv run python tests/fixtures/build_e2e_fixture.py
uv run python samples/build_samples.py
```

Expected: pytest 全 PASS / ruff clean / フィクスチャと samples が更新される（`db.py` のスキーマ変更で drift チェックが落ちるため必須）

- [ ] **Step 5: コミット**

```bash
git add src/alpha_visualizer/ frontend/src/api/types.ts tests/ samples/
git commit -m "feat(live): ベンチマーク・建玉の新列を読み取れるようにする"
```

---

## Task 9: `lib/liveEquity.ts` 純粋関数

**Files:**
- Create: `frontend/src/lib/liveEquity.ts`
- Test: `frontend/src/lib/__tests__/liveEquity.test.ts`

**Interfaces:**
- Produces:
  - `toDrawdown(values: number[]): number[]`（decimal・負値）
  - `currentDrawdown(values: number[]): number`
  - `peakIndex(values: number[]): number`
  - `dayChangePct(values: number[]): number | null`
  - `totalReturnPct(values: number[]): number`
  - `excessReturnPt(live: number[], bench: number[]): number | null`
  - `daysBetween(a: string, b: string): number`

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, it, expect } from 'vitest'
import {
  toDrawdown, currentDrawdown, peakIndex, dayChangePct,
  totalReturnPct, excessReturnPt, daysBetween,
} from '../liveEquity'

describe('toDrawdown', () => {
  it('ピークからの下方乖離を負値で返す', () => {
    expect(toDrawdown([100, 120, 90, 120])).toEqual([0, 0, -0.25, 0])
  })
  it('空配列は空配列', () => {
    expect(toDrawdown([])).toEqual([])
  })
  it('全同値なら全て 0（ゼロ除算しない）', () => {
    expect(toDrawdown([100, 100, 100])).toEqual([0, 0, 0])
  })
})

describe('currentDrawdown', () => {
  it('末尾時点のドローダウンを返す', () => {
    expect(currentDrawdown([100, 120, 90])).toBeCloseTo(-0.25)
  })
  it('1 点なら 0', () => {
    expect(currentDrawdown([100])).toBe(0)
  })
})

describe('peakIndex', () => {
  it('最大値のインデックスを返す（同値なら最初）', () => {
    expect(peakIndex([100, 120, 120, 90])).toBe(1)
  })
})

describe('dayChangePct', () => {
  it('直近 2 点の変化率', () => {
    expect(dayChangePct([100, 110])).toBeCloseTo(0.1)
  })
  it('2 点未満は null', () => {
    expect(dayChangePct([100])).toBeNull()
  })
})

describe('totalReturnPct', () => {
  it('先頭から末尾までの変化率', () => {
    expect(totalReturnPct([100, 110])).toBeCloseTo(0.1)
  })
  it('先頭が 0 なら 0（ゼロ除算しない）', () => {
    expect(totalReturnPct([0, 110])).toBe(0)
  })
})

describe('excessReturnPt', () => {
  it('Live が上回れば正のパーセントポイント', () => {
    // Live +10%, Bench +4% → +6pt
    expect(excessReturnPt([100, 110], [100, 104])).toBeCloseTo(6)
  })
  it('ベンチマークが空なら null', () => {
    expect(excessReturnPt([100, 110], [])).toBeNull()
  })
})

describe('daysBetween', () => {
  it('暦日数を返す', () => {
    expect(daysBetween('2026-06-04T00:00:00', '2026-07-25T00:00:00')).toBe(51)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd alpha-visualizer/frontend && pnpm vitest run src/lib/__tests__/liveEquity.test.ts`
Expected: FAIL — `Failed to resolve import "../liveEquity"`

- [ ] **Step 3: 実装する**

```ts
/**
 * Live equity 系列から KPI を導く純粋関数群（issue: Live リッチ化）。
 *
 * 副作用なし。入力配列を mutate しない。定義は
 * docs/superpowers/specs/2026-07-25-live-equity-rich-design.md に固定。
 */

/** ピークからの下方乖離（decimal・負値）を各時点で返す。 */
export function toDrawdown(values: readonly number[]): number[] {
  let peak = -Infinity
  return values.map((v) => {
    if (v > peak) peak = v
    return peak > 0 ? v / peak - 1 : 0
  })
}

/** 末尾時点のドローダウン（decimal・負値）。 */
export function currentDrawdown(values: readonly number[]): number {
  const dd = toDrawdown(values)
  return dd.length > 0 ? (dd[dd.length - 1] ?? 0) : 0
}

/** 最大値のインデックス。同値なら最初のものを返す。 */
export function peakIndex(values: readonly number[]): number {
  let best = 0
  for (let i = 1; i < values.length; i += 1) {
    if ((values[i] ?? -Infinity) > (values[best] ?? -Infinity)) best = i
  }
  return best
}

/** 直近 2 点の変化率（decimal）。2 点未満は null。 */
export function dayChangePct(values: readonly number[]): number | null {
  if (values.length < 2) return null
  const prev = values[values.length - 2]
  const last = values[values.length - 1]
  if (prev == null || last == null || prev === 0) return null
  return last / prev - 1
}

/** 先頭から末尾までの変化率（decimal）。先頭が 0 なら 0。 */
export function totalReturnPct(values: readonly number[]): number {
  if (values.length < 2) return 0
  const first = values[0]
  const last = values[values.length - 1]
  if (first == null || last == null || first === 0) return 0
  return last / first - 1
}

/** 累計リターンの差をパーセントポイントで返す。比較不能なら null。 */
export function excessReturnPt(
  live: readonly number[],
  bench: readonly number[],
): number | null {
  if (live.length < 2 || bench.length < 2) return null
  return (totalReturnPct(live) - totalReturnPct(bench)) * 100
}

/** ISO 日時 2 つの暦日数差。 */
export function daysBetween(from: string, to: string): number {
  const a = new Date(from).getTime()
  const b = new Date(to).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86_400_000)
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm vitest run src/lib/__tests__/liveEquity.test.ts`
Expected: PASS（全 12 件）

- [ ] **Step 5: コミット**

```bash
git add frontend/src/lib/liveEquity.ts frontend/src/lib/__tests__/liveEquity.test.ts
git commit -m "feat(live): Live equity の KPI 算出を純粋関数として追加"
```

---

## Task 10: `EquityDrawdownPaneTV` の多系列対応

**Files:**
- Modify: `frontend/src/hooks/useEquityViewport.ts`
- Modify: `frontend/src/charts/tv/data.ts`（`sliceByRange`）
- Modify: `frontend/src/charts/tv/EquityDrawdownPaneTV.tsx`
- Test: `frontend/src/charts/tv/__tests__/EquityDrawdownPaneTV.test.tsx`

**Interfaces:**
- Produces: `EquityOverlay { label: string; values: number[]; color?: string; dashed?: boolean }`、`EquityDrawdownPaneTVProps.overlays?: EquityOverlay[]`

- [ ] **Step 1: 失敗するテストを書く**

既存テストファイルに追記する。

```tsx
it('overlays を渡すと系列が追加される（既存 benchmark とは独立）', () => {
  const dates = ['2026-01-05', '2026-01-06', '2026-01-07']
  const { container } = render(
    <EquityDrawdownPaneTV
      equity={[100, 110, 105]}
      dates={dates}
      drawdown={[0, 0, -0.045]}
      isCutoffIdx={0}
      overlays={[
        { label: 'QQQ', values: [100, 104, 108] },
        { label: 'BT', values: [100, 108, 106] },
      ]}
      lang="ja"
    />,
  )
  // a11y データ表に overlay の列見出しが出る
  expect(container.textContent).toContain('QQQ')
  expect(container.textContent).toContain('BT')
})

it('overlays 未指定なら従来どおり描画される（後方互換）', () => {
  const { container } = render(
    <EquityDrawdownPaneTV
      equity={[100, 110]}
      dates={['2026-01-05', '2026-01-06']}
      drawdown={[0, 0]}
      isCutoffIdx={0}
      lang="ja"
    />,
  )
  expect(container).toBeTruthy()
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm vitest run src/charts/tv/__tests__/EquityDrawdownPaneTV.test.tsx`
Expected: FAIL — overlay ラベルが見つからない

- [ ] **Step 3: 実装する**

`data.ts` の `sliceByRange` の入力に `overlays` を足し、`points` に各 overlay の値を同一インデックスで載せる。`useEquityViewport.ts` の `EquityViewportInput` と `useMemo` 依存配列に `overlays` を追加する。

`EquityDrawdownPaneTV.tsx`:

```ts
export interface EquityOverlay {
  label: string
  values: number[]
  color?: string
  /** 破線で描くか（既定 false） */
  dashed?: boolean
}
```

`EquityDrawdownPaneTVProps` に `overlays?: EquityOverlay[]` を追加。既存の `benchmark` / `showBenchmark` は変更しない。

series 生成部で、`overlays` の各要素に `chart.addSeries(LineSeries, {...})` を作り、`points` から対応する値をセットする。系列参照は `useRef<Map<string, ISeriesApi<'Line'>>>` で保持し、overlays が変わったら差分更新する。a11y の `ChartDataTable` に overlay 列を追加する。

> 実装者へ: 既存の `benchmarkSeriesRef` の生成・更新・破棄の流れをそのままコピーして複数化するのが安全。lightweight-charts は série を `chart.removeSeries()` で明示破棄しないとリークする。

- [ ] **Step 4: テストが通ることを確認**

```bash
pnpm vitest run src/charts/tv/
pnpm vitest run   # 既存の BacktestScreen / ISOOSScreen が無改修で通ること
```

Expected: 全 PASS（既存呼び出し側が壊れていないことが後方互換の回帰の番人）

- [ ] **Step 5: コミット**

```bash
git add frontend/src/hooks/useEquityViewport.ts frontend/src/charts/tv/
git commit -m "feat(charts): EquityDrawdownPaneTV に overlays を追加し多系列比較に対応"
```

---

## Task 11: `LiveKpiRow`

**Files:**
- Create: `frontend/src/components/live/LiveKpiRow.tsx`
- Test: `frontend/src/components/live/__tests__/LiveKpiRow.test.tsx`

**Interfaces:**
- Consumes: `lib/liveEquity.ts`（Task 9）、既存の `SummaryCard` / `fmtNumber` / `fmtDiff`
- Produces: `<LiveKpiRow equity={[string, number][]} benchmarkEquity={...} backtestEquity={...} lang={Lang} />`

- [ ] **Step 1: 失敗するテストを書く**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LiveKpiRow } from '../LiveKpiRow'

const EQUITY: [string, number][] = [
  ['2026-06-04T00:00:00', 1_000_000],
  ['2026-06-05T00:00:00', 1_010_000],
  ['2026-06-06T00:00:00', 994_000],
]

describe('LiveKpiRow', () => {
  it('現在評価額・累計損益・現在DD を表示する', () => {
    render(<LiveKpiRow equity={EQUITY} lang="ja" />)
    expect(screen.getByTestId('kpi-current-value').textContent).toContain('994,000')
    // 累計損益 = 994,000 - 1,000,000
    expect(screen.getByTestId('kpi-total-pnl').textContent).toContain('-6,000')
    // 現在DD = 994,000 / 1,010,000 - 1 = -1.58%
    expect(screen.getByTestId('kpi-current-dd').textContent).toContain('-1.58')
  })

  it('ベンチマークがあれば超過リターンを表示する', () => {
    render(
      <LiveKpiRow
        equity={EQUITY}
        benchmarkEquity={[
          ['2026-06-04T00:00:00', 1_000_000],
          ['2026-06-06T00:00:00', 1_020_000],
        ]}
        lang="ja"
      />,
    )
    // Live -0.6% vs Bench +2.0% → -2.6pt
    expect(screen.getByTestId('kpi-excess-index').textContent).toContain('-2.6')
  })

  it('ベンチマークが無ければ超過リターンを出さない（旧 DB 互換）', () => {
    render(<LiveKpiRow equity={EQUITY} lang="ja" />)
    expect(screen.queryByTestId('kpi-excess-index')).not.toBeInTheDocument()
  })

  it('equity が空でもクラッシュしない', () => {
    render(<LiveKpiRow equity={[]} lang="ja" />)
    expect(screen.queryByTestId('kpi-current-value')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm vitest run src/components/live/__tests__/LiveKpiRow.test.tsx`
Expected: FAIL — `Failed to resolve import "../LiveKpiRow"`

- [ ] **Step 3: 実装する**

`data-testid` は `kpi-current-value` / `kpi-total-pnl` / `kpi-current-dd` / `kpi-period` / `kpi-excess-index` / `kpi-excess-backtest` を使う。値の定義は spec の表に従う。`equity.length === 0` のときは `null` を返す。

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm vitest run src/components/live/__tests__/LiveKpiRow.test.tsx`
Expected: PASS（4 件）

- [ ] **Step 5: コミット**

```bash
git add frontend/src/components/live/LiveKpiRow.tsx frontend/src/components/live/__tests__/LiveKpiRow.test.tsx
git commit -m "feat(live): KPI 行（評価額・損益・現在DD・超過リターン）を追加"
```

---

## Task 12: `LivePositionsTable`

**Files:**
- Create: `frontend/src/components/live/LivePositionsTable.tsx`
- Test: `frontend/src/components/live/__tests__/LivePositionsTable.test.tsx`

**Interfaces:**
- Consumes: `LivePosition`（Task 8 の型）
- Produces: `<LivePositionsTable positions={LivePosition[]} cash={number} totalValue={number} lang={Lang} />`

- [ ] **Step 1: 失敗するテストを書く**

```tsx
import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LivePositionsTable } from '../LivePositionsTable'
import type { LivePosition } from '../../../api/types'

const POSITIONS: LivePosition[] = [
  {
    ticker: 'US.GLD', qty: 90, avg_cost: 396.64, last_price: 371.9,
    market_value: 33471, weight_pct: 3.4, unrealized_pnl: -2227, unrealized_pnl_pct: -6.2,
  },
]

describe('LivePositionsTable', () => {
  it('建玉と現金の行を表示する', () => {
    render(
      <LivePositionsTable positions={POSITIONS} cash={898032} totalValue={994492} lang="ja" />,
    )
    const table = screen.getByRole('table')
    expect(within(table).getByText('US.GLD')).toBeInTheDocument()
    expect(table.textContent).toContain('898,032')  // 現金
  })

  it('再構築値である旨の注記を出す', () => {
    render(
      <LivePositionsTable positions={POSITIONS} cash={0} totalValue={33471} lang="ja" />,
    )
    expect(screen.getByTestId('positions-caveat').textContent).toContain('再構築')
  })

  it('建玉が空でも現金行は出す', () => {
    render(<LivePositionsTable positions={[]} cash={1_000_000} totalValue={1_000_000} lang="ja" />)
    expect(screen.getByRole('table').textContent).toContain('1,000,000')
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm vitest run src/components/live/__tests__/LivePositionsTable.test.tsx`
Expected: FAIL — import 解決不能

- [ ] **Step 3: 実装する**

列は 銘柄 / 数量 / 平均取得 / 現在値 / 評価額 / 構成比 / 含み損益（額・%）。合計行に建玉合計と現金を出す。注記は `data-testid="positions-caveat"` で「イベントからの再構築値です。ブローカーの実口座残高とは差異が生じることがあります。」（英語: "Reconstructed from event logs; may differ from the broker account."）。

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm vitest run src/components/live/__tests__/LivePositionsTable.test.tsx`
Expected: PASS（3 件）

- [ ] **Step 5: コミット**

```bash
git add frontend/src/components/live/LivePositionsTable.tsx frontend/src/components/live/__tests__/LivePositionsTable.test.tsx
git commit -m "feat(live): 建玉テーブル（構成比・含み損益・現金）を追加"
```

---

## Task 13: `LivePositionView` の組み立てと後方互換

**Files:**
- Modify: `frontend/src/components/live/LivePositionView.tsx`
- Test: `frontend/src/components/live/__tests__/LivePositionView.test.tsx`

**Interfaces:**
- Consumes: Task 9〜12 の全成果物

- [ ] **Step 1: 失敗するテストを書く**

既存テストファイルに追記する。

```tsx
it('ベンチマーク・建玉が無い旧 DB 応答でもクラッシュせず描画する', () => {
  const summary = {
    strategy_id: 'pf_1', kind: 'position' as const,
    metrics: { total_return_pct: -0.5, cagr_pct: -3, sharpe_ratio: -2,
               max_drawdown_pct: 0.7, volatility_pct: 1.3 },
    equity: [
      ['2026-06-04T00:00:00', 1_000_000],
      ['2026-06-05T00:00:00', 995_000],
    ] as [string, number][],
    receipts_count: 78,
    // benchmark_equity / backtest_equity / positions は未定義（旧 DB）
  }
  render(<LivePositionView summary={summary} warnings={[]} lang="ja" />)
  expect(screen.getByTestId('kpi-current-value')).toBeInTheDocument()
  expect(screen.queryByTestId('kpi-excess-index')).not.toBeInTheDocument()
})

it('ベンチマークがあれば overlays 付きでチャートを描画する', () => {
  const summary = {
    strategy_id: 'pf_1', kind: 'position' as const,
    metrics: { total_return_pct: -0.5 },
    equity: [['2026-06-04T00:00:00', 1_000_000], ['2026-06-05T00:00:00', 995_000]] as [string, number][],
    benchmark_equity: [['2026-06-04T00:00:00', 1_000_000], ['2026-06-05T00:00:00', 1_020_000]] as [string, number][],
    positions: [{ ticker: 'US.GLD', qty: 90, avg_cost: 396.64, last_price: 371.9,
                  market_value: 33471, weight_pct: 3.4, unrealized_pnl: -2227,
                  unrealized_pnl_pct: -6.2 }],
    cash: 961_021,
    total_value: 994_492,
    receipts_count: 78,
  }
  render(<LivePositionView summary={summary} warnings={[]} lang="ja" />)
  expect(screen.getByTestId('kpi-excess-index')).toBeInTheDocument()
  expect(screen.getByRole('table')).toBeInTheDocument()
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm vitest run src/components/live/__tests__/LivePositionView.test.tsx`
Expected: FAIL — `kpi-current-value` が見つからない

- [ ] **Step 3: 実装する**

`Sparkline` を撤去し、spec の画面構成順に組む。

1. `MetaLine`（既存）
2. `<LiveKpiRow ... />`
3. `<EquityDrawdownPaneTV equity={...} dates={...} drawdown={toDrawdown(values)} isCutoffIdx={0} overlays={[...]} lang={lang} />`
   - overlays は `benchmark_equity` / `backtest_equity` が空でない場合のみ積む
4. 既存の指標カード群（`METRICS` の map）
5. `<LivePositionsTable ... />`（`positions` があるときのみ）

- [ ] **Step 4: テストが通ることを確認**

```bash
pnpm vitest run
pnpm run lint
npx tsc --noEmit
```

Expected: 全 PASS / lint clean / 型エラーなし

- [ ] **Step 5: コミット**

```bash
git add frontend/src/components/live/
git commit -m "feat(live): Live ページの Equity 表示を KPI・比較チャート・建玉テーブルで刷新"
```

---

## Task 14: 実機確認・スクリーンショット・ドキュメント・PR

**Files:**
- Modify: `docs/screenshots/{ja,en}/`（再撮影）
- Modify: `alforge-labs/mkdocs_src/{ja,en}/cli-reference/live.md`（`--benchmark`）
- Modify: `alforge-labs/mkdocs_src/{ja,en}/alpha-visualizer/features.md`（Live ページ）

- [ ] **Step 1: 実データで end-to-end 確認する**

alpha-forge 側（PR 1 マージ済みの main）で replay を実行し、visualizer で描画を確認する。

```bash
cd alpha-forge
FORGE_CONFIG=../alpha-strategies/forge.yaml uv run alpha-forge live replay beat_qqq_hedged_v1 \
  --combine-strategies tqqq_sma200_atr_bho_phase2_v1_optimized,gld_bh_v1,tlt_bh_v1 \
  --initial-capital 1000000 --benchmark QQQ --compare

cd ../alpha-visualizer/frontend && pnpm run build
cd .. && uv run alpha-vis serve --forge-dir ../alpha-strategies --port 8011 --no-open
```

Expected: `/live` に KPI 行・3 系列チャート・ドローダウンペイン・建玉テーブルが表示される。建玉合計と現金の合計が KPI の現在評価額と一致すること。

- [ ] **Step 2: スクリーンショットを再撮影する**

```bash
cd frontend
pnpm run e2e:install   # 初回のみ
pnpm run screenshots
```

Expected: `docs/screenshots/{ja,en}/` が更新される（`visual-regression` ジョブ対策として必須）

- [ ] **Step 3: ドキュメントを更新してビルドする**

`cli-reference/live.md` の `live replay` の引数表に `--benchmark` を追加し、`forge.yaml` の `live.benchmark` を記載する（日英）。`alpha-visualizer/features.md` の Live ページ節に KPI・ベンチマーク比較・建玉テーブルを追記する（日英）。

```bash
cd ../alforge-labs
uv run mkdocs build -f mkdocs.ja.yml
uv run mkdocs build -f mkdocs.en.yml
```

- [ ] **Step 4: 最終ゲート**

```bash
cd ../alpha-visualizer
uv run pytest tests/ -q
uv run ruff check src/ tests/
cd frontend && pnpm vitest run && pnpm run lint && npx tsc --noEmit
```

Expected: 全 PASS

- [ ] **Step 5: コミットして PR を作成する**

```bash
git add -A
git commit -m "docs: Live ページのスクリーンショットを再撮影"
git push -u origin feat/live-equity-rich
gh pr create --repo alforge-labs/alpha-visualizer --base main \
  --title "feat(live): Live ページの Equity 表示をリッチ化" --body-file /path/to/body.md
```

alforge-labs 側も別ブランチで PR を作成する。

---

## Self-Review

**1. Spec coverage**

| spec の要求 | 対応タスク |
|---|---|
| 現在評価額・累計損益・現在 DD | Task 9（算出）・Task 11（表示） |
| 市場指数／BT との優劣 | Task 3・4（系列）・Task 11（超過リターン）・Task 10・13（チャート） |
| 軸・グリッド・ツールチップ付きエクイティ | Task 10・13（`EquityDrawdownPaneTV` 流用で標準装備） |
| 現在の建玉構成 | Task 1・2（算出）・Task 12（表示） |
| 旧 DB でクラッシュしない | Task 8（repository フォールバック）・Task 11・13（後方互換テスト） |
| 3 系列を initial_capital 基準に正規化 | Task 3（`normalize_to_initial`） |
| backtest_equity は再計算しない | Task 4（`combined["value"]` を流用） |
| ベンチマーク欠損で replay を落とさない | Task 4（`_benchmark_equity` の警告＋空返し） |
| 建玉は再構築値と明示 | Task 12（`positions-caveat`） |
| ALTER TABLE マイグレーション | Task 5 |
| fixture / samples 再生成 | Task 8 Step 4 |
| スクリーンショット再撮影 | Task 14 Step 2 |
| forge → visualizer の順 | Task 7（PR 1）→ Task 8 以降（PR 2） |

漏れなし。

**2. Placeholder scan**

Task 8 Step 1 のテストに `...` を残している。これは既存テストの DB 構築ヘルパーを流用させる意図的な指示で、直後に「実装者へ」の注記で流用元を示している。他に TBD / TODO なし。

**3. Type consistency**

- `average_cost_basis` → `dict[str, tuple[float, float]]`（Task 1）を Task 2 が `basis.get(ticker, (0.0, 0.0))[1]` で使用 — 一致
- `build_position_snapshot` → `{"positions", "cash", "total_value"}`（Task 2）を Task 4 が同キーで展開 — 一致
- `normalize_to_initial(series, index, initial_capital)`（Task 3）を Task 4 が位置引数で呼び出し — 一致
- `LivePosition` のフィールド名（Task 8）と Task 2 が生成する dict のキー — `ticker` / `sub_strategy_id` / `qty` / `avg_cost` / `last_price` / `market_value` / `weight_pct` / `unrealized_pnl` / `unrealized_pnl_pct` で一致
- `data-testid` は Task 11（`kpi-*`）と Task 13 のテストで一致、Task 12（`positions-caveat`）も一致
