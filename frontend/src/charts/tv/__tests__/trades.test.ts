import { describe, expect, it } from 'vitest'
import type { RegimeSeries, Trade } from '../../../api/types'
import {
  pickFocusTrade,
  regimeChangeMarkers,
  tradesToMarkers,
  tradeToPriceLines,
  type TradeMarkerColors,
} from '../trades'

const colors: TradeMarkerColors = {
  longWin: '#0a0',
  longLoss: '#a00',
  shortWin: '#08c',
  shortLoss: '#c80',
  neutral: '#888',
}

function trade(overrides: Partial<Trade>): Trade {
  return {
    id: 0,
    direction: 'long',
    entry_date: '2025-01-02',
    exit_date: '2025-01-10',
    entry_price: 100,
    exit_price: 110,
    sl_price: 98,
    tp_price: 115,
    return_pct: 10,
    pnl: 1000,
    holding_days: 8,
    mae_pct: -1.0,
    mfe_pct: 12.0,
    ...overrides,
  }
}

describe('tradesToMarkers', () => {
  it('closed long trade produces entry (belowBar arrowUp) + exit (aboveBar arrowDown)', () => {
    const out = tradesToMarkers([trade({})], colors)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ position: 'belowBar', shape: 'arrowUp', color: colors.longWin })
    expect(out[1]).toMatchObject({ position: 'aboveBar', shape: 'arrowDown', color: colors.longWin })
  })

  it('closed short losing trade uses shortLoss color', () => {
    const out = tradesToMarkers(
      [trade({ direction: 'short', pnl: -500, return_pct: -5 })],
      colors,
    )
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ position: 'aboveBar', shape: 'arrowDown', color: colors.shortLoss })
    expect(out[1]).toMatchObject({ position: 'belowBar', shape: 'arrowUp', color: colors.shortLoss })
  })

  it('open trade (exit_price == null) produces only entry marker with neutral color', () => {
    const out = tradesToMarkers(
      [trade({ exit_price: null, exit_date: '', pnl: 0, return_pct: 0 })],
      colors,
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ position: 'belowBar', shape: 'arrowUp', color: colors.neutral })
  })

  it('output is sorted by time ascending even when input is unsorted', () => {
    const out = tradesToMarkers(
      [
        trade({ id: 1, entry_date: '2025-03-01', exit_date: '2025-03-05' }),
        trade({ id: 2, entry_date: '2025-01-10', exit_date: '2025-01-15' }),
      ],
      colors,
    )
    // 期待: 2025-01-10 entry, 2025-01-15 exit, 2025-03-01 entry, 2025-03-05 exit
    const times = out.map((m) => m.time)
    expect(times).toEqual(['2025-01-10', '2025-01-15', '2025-03-01', '2025-03-05'])
  })

  it('invalid entry_date is skipped', () => {
    const out = tradesToMarkers(
      [trade({ entry_date: 'not-a-date', exit_date: 'not-a-date', exit_price: null })],
      colors,
    )
    expect(out).toHaveLength(0)
  })

  it('exit_date が空文字でも closed trade なら exit marker を出さない', () => {
    const out = tradesToMarkers([trade({ exit_date: '', exit_price: 110 })], colors)
    expect(out).toHaveLength(1)
    expect(out[0]?.position).toBe('belowBar') // entry only
  })
})

describe('pickFocusTrade', () => {
  it('returns null for empty array', () => {
    expect(pickFocusTrade([])).toBeNull()
  })

  it('prefers first open trade', () => {
    const trades = [
      trade({ id: 1, entry_date: '2025-01-01' }),
      trade({ id: 2, entry_date: '2025-02-01', exit_price: null, exit_date: '' }),
      trade({ id: 3, entry_date: '2025-03-01', exit_price: null, exit_date: '' }),
    ]
    expect(pickFocusTrade(trades)?.id).toBe(2)
  })

  it('falls back to latest closed trade by entry_date when no open trade', () => {
    const trades = [
      trade({ id: 1, entry_date: '2025-01-01' }),
      trade({ id: 2, entry_date: '2025-03-01' }),
      trade({ id: 3, entry_date: '2025-02-01' }),
    ]
    expect(pickFocusTrade(trades)?.id).toBe(2)
  })
})

describe('tradeToPriceLines', () => {
  it('returns empty array for null trade', () => {
    expect(tradeToPriceLines(null, colors)).toEqual([])
  })

  it('returns 3 lines (entry/sl/tp) when all prices present', () => {
    const lines = tradeToPriceLines(trade({}), colors)
    expect(lines).toHaveLength(3)
    expect(lines.map((l) => l.kind).sort()).toEqual(['entry', 'sl', 'tp'])
  })

  it('skips sl_price / tp_price when null', () => {
    const lines = tradeToPriceLines(trade({ sl_price: null, tp_price: null }), colors)
    expect(lines).toHaveLength(1)
    expect(lines[0]?.kind).toBe('entry')
  })

  it('sl color uses long-loss for long, short-loss for short', () => {
    const long = tradeToPriceLines(trade({ direction: 'long' }), colors)
    const short = tradeToPriceLines(trade({ direction: 'short' }), colors)
    expect(long.find((l) => l.kind === 'sl')?.color).toBe(colors.longLoss)
    expect(short.find((l) => l.kind === 'sl')?.color).toBe(colors.shortLoss)
  })

  it('tp color uses long-win for long, short-win for short', () => {
    const long = tradeToPriceLines(trade({ direction: 'long' }), colors)
    const short = tradeToPriceLines(trade({ direction: 'short' }), colors)
    expect(long.find((l) => l.kind === 'tp')?.color).toBe(colors.longWin)
    expect(short.find((l) => l.kind === 'tp')?.color).toBe(colors.shortWin)
  })

  it('skips non-finite prices', () => {
    const lines = tradeToPriceLines(
      trade({ entry_price: NaN, sl_price: 98, tp_price: NaN }),
      colors,
    )
    expect(lines).toHaveLength(1)
    expect(lines[0]?.kind).toBe('sl')
  })
})

describe('regimeChangeMarkers', () => {
  it('null / undefined / 配列なし → 空配列', () => {
    expect(regimeChangeMarkers(null, '#888')).toEqual([])
    expect(regimeChangeMarkers(undefined, '#888')).toEqual([])
  })

  it('長さ 0 / 1 → 空配列（遷移点がない）', () => {
    const r0: RegimeSeries = { dates: [], states: [], n_states: 2 }
    const r1: RegimeSeries = { dates: ['2025-01-02'], states: [0], n_states: 2 }
    expect(regimeChangeMarkers(r0, '#888')).toEqual([])
    expect(regimeChangeMarkers(r1, '#888')).toEqual([])
  })

  it('state が変わったバーだけ marker を返す', () => {
    const r: RegimeSeries = {
      dates: ['2025-01-02', '2025-01-03', '2025-01-04', '2025-01-05', '2025-01-06'],
      states: [0, 0, 1, 1, 0],
      n_states: 2,
    }
    const out = regimeChangeMarkers(r, '#888')
    expect(out).toHaveLength(2)
    expect(out[0]?.time).toBe('2025-01-04')
    expect(out[1]?.time).toBe('2025-01-06')
  })

  it('label_names があれば marker text に short label を入れる', () => {
    const r: RegimeSeries = {
      dates: ['2025-01-02', '2025-01-03', '2025-01-04'],
      states: [0, 1, 0],
      n_states: 2,
      label_names: { '0': 'low_vol', '1': 'high_vol' },
    }
    const out = regimeChangeMarkers(r, '#888')
    expect(out).toHaveLength(2)
    expect(out[0]?.text).toBe('high_vol')
    expect(out[1]?.text).toBe('low_vol')
  })

  it('label_names が無ければ rN フォールバック', () => {
    const r: RegimeSeries = {
      dates: ['2025-01-02', '2025-01-03'],
      states: [0, 2],
      n_states: 3,
    }
    const out = regimeChangeMarkers(r, '#888')
    expect(out[0]?.text).toBe('r2')
  })

  it('marker は aboveBar circle で指定色', () => {
    const r: RegimeSeries = {
      dates: ['2025-01-02', '2025-01-03'],
      states: [0, 1],
      n_states: 2,
    }
    const out = regimeChangeMarkers(r, '#abcdef')
    expect(out[0]).toMatchObject({
      position: 'aboveBar',
      shape: 'circle',
      color: '#abcdef',
    })
  })
})
