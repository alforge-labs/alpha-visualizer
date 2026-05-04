import type {
  BacktestDetail,
  BacktestMetrics,
  StrategyComparison,
  Trade,
  WFOResult,
  WFOWindow,
} from '../api/types'

/* ── Deterministic PRNG (Mulberry32) ──────────────────────────────────────── */
function mb32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randn(rand: () => number): number {
  const u = Math.max(rand(), 1e-12)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
}

function genEquity(n: number, mu: number, sigma: number, seed: number): number[] {
  const rand = mb32(seed)
  const eq: number[] = [100]
  for (let i = 1; i < n; i++) {
    const prev = eq[i - 1] ?? 100
    eq.push(Math.max(prev * (1 + mu + sigma * randn(rand)), 0.1))
  }
  return eq
}

function genDates(start: string, n: number): string[] {
  const d = new Date(start)
  const out: string[] = []
  while (out.length < n) {
    const w = d.getDay()
    if (w !== 0 && w !== 6) out.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return out
}

export function computeDD(eq: number[]): number[] {
  let peak = eq[0] ?? 0
  return eq.map((v) => {
    if (v > peak) peak = v
    return peak === 0 ? 0 : ((v - peak) / peak) * 100
  })
}

/* ── Equity curves ────────────────────────────────────────────────────────── */
const N_IS = 504
const N_OOS = 252

function buildEquity() {
  const eqIS = genEquity(N_IS, 0.0005, 0.011, 42)
  const eqOOSRaw = genEquity(N_OOS + 1, 0.00028, 0.014, 99)
  const lastIS = eqIS[N_IS - 1] ?? 100
  const firstOOS = eqOOSRaw[0] ?? 1
  const scale = lastIS / firstOOS
  const eqOOS = eqOOSRaw.map((v) => v * scale)
  const eqAll = [...eqIS, ...eqOOS.slice(1)]
  const ddAll = computeDD(eqAll)
  const dates = genDates('2020-01-02', eqAll.length)
  const bmkRaw = genEquity(eqAll.length, 0.0004, 0.016, 13)
  const firstAll = eqAll[0] ?? 100
  const firstBmk = bmkRaw[0] ?? 1
  const bmkScale = firstAll / firstBmk
  const benchmark = bmkRaw.map((v) => v * bmkScale)
  return { eqAll, ddAll, dates, benchmark, isCutoffIdx: N_IS, isCutoffDate: dates[N_IS - 1] ?? '' }
}

const { eqAll, ddAll, dates, benchmark, isCutoffIdx, isCutoffDate } = buildEquity()

/* ── Metrics ──────────────────────────────────────────────────────────────── */
const totalRet = +(((eqAll.at(-1) ?? 100) / (eqAll[0] ?? 100) - 1) * 100).toFixed(1)

const METRICS: BacktestMetrics = {
  total_return_pct: totalRet,
  cagr_pct: 9.2,
  sharpe_ratio: 1.18,
  sortino_ratio: 1.67,
  calmar_ratio: 0.49,
  max_drawdown_pct: -21.4,
  win_rate_pct: 54.2,
  profit_factor: 1.67,
  total_trades: 183,
  avg_holding_days: 7.3,
  max_drawdown_duration_days: 142,
  recovery_days: 89,
  max_consecutive_wins: 9,
  max_consecutive_losses: 6,
  avg_win_pct: 3.21,
  avg_loss_pct: -1.87,
  tail_ratio: 1.23,
  var_95_pct: 1.84,
  exposure_pct: 67.3,
  positive_month_ratio: 61.7,
  omega_ratio: 1.48,
  cvar_95_pct: 2.41,
  deflated_sharpe: { probabilistic_sr: 0.923, deflated_sr: 0.871, n_trials: 12 },
  statistical_validity: { is_valid: true, signal_quality_score: 0.74, warning: null },
}

const IS_METRICS: BacktestMetrics = {
  total_return_pct: 43.8,
  cagr_pct: 12.7,
  sharpe_ratio: 1.41,
  sortino_ratio: 1.98,
  calmar_ratio: 0.89,
  max_drawdown_pct: -14.2,
  win_rate_pct: 57.1,
  profit_factor: 1.89,
  total_trades: 112,
}

const OOS_METRICS: BacktestMetrics = {
  total_return_pct: 18.3,
  cagr_pct: 5.4,
  sharpe_ratio: 0.97,
  sortino_ratio: 1.24,
  calmar_ratio: 0.27,
  max_drawdown_pct: -19.8,
  win_rate_pct: 50.1,
  profit_factor: 1.41,
  total_trades: 71,
}

const MONTHLY_RETURNS: Record<number, (number | null)[]> = {
  2020: [4.2, -3.1, -14.8, 14.3, 6.1, 2.4, 3.1, 5.6, -1.2, -4.3, 8.9, 3.2],
  2021: [1.4, 5.6, -2.3, 8.1, 2.4, -1.8, 4.6, -3.1, 2.4, 6.3, -4.2, 3.1],
  2022: [-5.4, -8.9, 2.1, -3.4, -12.1, 3.2, 4.6, -2.1, -3.4, 4.2, -1.2, 2.3],
  2023: [6.4, 2.1, 4.8, 1.2, 8.4, -2.1, 5.3, -1.4, -3.2, 2.1, 6.8, 4.2],
  2024: [3.2, -1.4, 6.8, 2.4, -3.1, 4.2, 1.8, 3.6, -2.3, 5.4, null, null],
}

/* ── WFO ──────────────────────────────────────────────────────────────────── */
const WFO_WINDOWS: WFOWindow[] = [
  { id: 1, label: 'W1', is_start: '2020-01', is_end: '2020-12', oos_start: '2021-01', oos_end: '2021-06', is_sharpe: 1.52, oos_sharpe: 1.18, is_return: 28.4, oos_return: 12.1, oos_is_ratio: 0.776, params: { ema_fast: 12, ema_slow: 26, rsi: 14 }, pass: true },
  { id: 2, label: 'W2', is_start: '2020-07', is_end: '2021-06', oos_start: '2021-07', oos_end: '2021-12', is_sharpe: 1.34, oos_sharpe: 0.89, is_return: 22.1, oos_return: 8.7, oos_is_ratio: 0.664, params: { ema_fast: 10, ema_slow: 30, rsi: 14 }, pass: true },
  { id: 3, label: 'W3', is_start: '2021-01', is_end: '2021-12', oos_start: '2022-01', oos_end: '2022-06', is_sharpe: 1.67, oos_sharpe: -0.21, is_return: 31.2, oos_return: -6.3, oos_is_ratio: -0.126, params: { ema_fast: 8, ema_slow: 21, rsi: 10 }, pass: false },
  { id: 4, label: 'W4', is_start: '2021-07', is_end: '2022-06', oos_start: '2022-07', oos_end: '2022-12', is_sharpe: 1.41, oos_sharpe: 1.04, is_return: 18.9, oos_return: 9.2, oos_is_ratio: 0.738, params: { ema_fast: 12, ema_slow: 26, rsi: 14 }, pass: true },
  { id: 5, label: 'W5', is_start: '2022-01', is_end: '2022-12', oos_start: '2023-01', oos_end: '2023-06', is_sharpe: 1.28, oos_sharpe: 1.41, is_return: 15.7, oos_return: 14.2, oos_is_ratio: 1.102, params: { ema_fast: 14, ema_slow: 28, rsi: 14 }, pass: true },
]

function genWFOComposite(): number[] {
  const rand = mb32(77)
  const eq: number[] = [100]
  for (let w = 0; w < 5; w++) {
    const mu = w === 2 ? -0.0006 : 0.00038
    for (let i = 0; i < 63; i++) {
      const prev = eq[eq.length - 1] ?? 100
      eq.push(Math.max(prev * (1 + mu + 0.013 * randn(rand)), 0.1))
    }
  }
  return eq
}

const wfoComposite = genWFOComposite()
const wfoDates = genDates('2021-01-04', wfoComposite.length)

/* ── Strategies (Compare) ─────────────────────────────────────────────────── */
const STRATEGIES: StrategyComparison[] = [
  { id: 'ema_cross', name: 'EMA Cross', symbol: 'AAPL', total_return_pct: totalRet, cagr_pct: 9.2, sharpe_ratio: 1.18, sortino_ratio: 1.67, max_drawdown_pct: -21.4, win_rate_pct: 54.2, profit_factor: 1.67, total_trades: 183, is_baseline: true },
  { id: 'rsi_rev', name: 'RSI Reversion', symbol: 'AAPL', total_return_pct: 31.2, cagr_pct: 6.1, sharpe_ratio: 0.89, sortino_ratio: 1.14, max_drawdown_pct: -28.1, win_rate_pct: 61.3, profit_factor: 1.45, total_trades: 247, is_baseline: false },
  { id: 'momentum', name: 'Momentum BKT', symbol: 'AAPL', total_return_pct: 82.1, cagr_pct: 15.3, sharpe_ratio: 1.52, sortino_ratio: 2.21, max_drawdown_pct: -32.7, win_rate_pct: 48.2, profit_factor: 1.92, total_trades: 89, is_baseline: false },
]

/* ── Trades ───────────────────────────────────────────────────────────────── */
function genTrades(n: number, seed: number): Trade[] {
  const rand = mb32(seed)
  const trades: Trade[] = []
  const d = new Date('2020-01-15')
  for (let i = 0; i < n; i++) {
    const win = rand() < 0.542
    const ret = win ? rand() * 4.8 + 0.5 : -(rand() * 2.8 + 0.4)
    const holding = Math.floor(rand() * 18 + 1)
    const entry = new Date(d)
    d.setDate(d.getDate() + Math.floor(rand() * 12 + 2))
    const exit = new Date(d)
    trades.push({
      id: i + 1,
      direction: rand() < 0.72 ? 'long' : 'short',
      entry_date: entry.toISOString().slice(0, 10),
      exit_date: exit.toISOString().slice(0, 10),
      entry_price: +(140 + rand() * 90).toFixed(2),
      return_pct: +ret.toFixed(3),
      pnl: +(ret * 8.5).toFixed(2),
      holding_days: holding,
      mae_pct: +(rand() * 3.2).toFixed(2),
      mfe_pct: +(rand() * 7.5 + (win ? 0.5 : 0)).toFixed(2),
    })
  }
  return trades
}

const TRADES = genTrades(183, 555)

/* ── Public mock objects ──────────────────────────────────────────────────── */
export const MOCK_BACKTEST: BacktestDetail = {
  run_id: 'mock-ema-cross-aapl',
  strategy_id: 'ema_cross_aapl_v1',
  strategy_name: 'EMA Cross w/ RSI Filter',
  symbol: 'AAPL',
  timeframe: '1d',
  run_at: '2024-09-30T00:00:00Z',
  period: { start: '2020-01', end: '2024-09' },
  equity: { dates, values: eqAll, benchmark },
  drawdown: ddAll,
  is_cutoff: { date: isCutoffDate, index: isCutoffIdx },
  metrics: METRICS,
  is_metrics: IS_METRICS,
  oos_metrics: OOS_METRICS,
  monthly_returns: MONTHLY_RETURNS,
  trades: TRADES,
  daily_returns: [],
  buy_hold_equity: [],
}

export const MOCK_WFO: WFOResult = {
  strategy_id: 'ema_cross_aapl_v1',
  strategy_name: 'EMA Cross w/ RSI Filter',
  symbol: 'AAPL',
  windows: WFO_WINDOWS,
  composite_equity: wfoComposite,
  composite_dates: wfoDates,
}

export const MOCK_STRATEGIES: StrategyComparison[] = STRATEGIES
