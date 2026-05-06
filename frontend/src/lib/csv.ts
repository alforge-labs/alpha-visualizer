import type { Trade, StrategyComparison } from '../api/types'

type CsvCell = string | number | null | undefined

function escapeCell(v: CsvCell): string {
  if (v == null) return ''
  const s = String(v)
  return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadCsv(filename: string, rows: CsvCell[][]): void {
  const content = rows.map((r) => r.map(escapeCell).join(',')).join('\n')
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function buildTradesCsv(trades: Trade[]): CsvCell[][] {
  return [
    ['#', 'Direction', 'Entry Date', 'Exit Date', 'Holding Days', 'Return %', 'P&L', 'MAE %', 'MFE %'],
    ...trades.map((t) => [
      t.id,
      t.direction,
      t.entry_date,
      t.exit_date,
      t.holding_days,
      t.return_pct,
      t.pnl,
      t.mae_pct,
      t.mfe_pct,
    ]),
  ]
}

export function buildEquityCsv(
  equity: { dates: string[]; values: number[] },
  drawdown: number[],
  daily_returns: number[],
): CsvCell[][] {
  return [
    ['Date', 'Equity', 'Drawdown', 'Daily Return'],
    ...equity.dates.map((d, i) => [d, equity.values[i], drawdown[i] ?? '', daily_returns[i] ?? '']),
  ]
}

export function buildCompareCsv(strategies: StrategyComparison[]): CsvCell[][] {
  return [
    ['ID', 'Name', 'Symbol', 'Total Return %', 'CAGR %', 'Sharpe', 'Sortino', 'Max DD %', 'Win Rate %', 'Profit Factor', 'Trades'],
    ...strategies.map((s) => [
      s.id,
      s.name,
      s.symbol,
      s.total_return_pct,
      s.cagr_pct,
      s.sharpe_ratio,
      s.sortino_ratio,
      s.max_drawdown_pct,
      s.win_rate_pct,
      s.profit_factor,
      s.total_trades,
    ]),
  ]
}
