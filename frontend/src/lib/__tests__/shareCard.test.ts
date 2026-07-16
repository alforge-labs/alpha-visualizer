import { describe, expect, it } from 'vitest'
import {
  SHARE_CARD_BRAND,
  buildShareCardData,
  normalizeEquity,
  shareCardFilename,
  truncateToWidth,
} from '../shareCard'

/**
 * 共有カード（C5 バイラルループ）: バックテスト結果を OGP サイズの PNG として
 * SNS にシェアできるようにし、カード自体を AlphaForge の認知経路にする。
 * ブランド行が欠けたカードは集客導線として機能しないため、必ず検証する。
 */

const INPUT = {
  strategy_id: 'sma_cross_v1',
  symbol: 'SPY',
  timeframe: '1d',
  period: { start: '2020-01-02', end: '2023-12-29' },
  metrics: {
    total_return_pct: 42.5,
    cagr_pct: 9.31,
    sharpe_ratio: 1.234,
    max_drawdown_pct: -12.7,
    win_rate_pct: 61.5,
  },
  equity: {
    dates: ['2020-01-02', '2020-01-03', '2020-01-06'],
    values: [10000, 10100, 10500],
  },
}

describe('buildShareCardData', () => {
  it('composes title / subtitle from strategy, symbol, timeframe and period', () => {
    const data = buildShareCardData(INPUT, 'ja')
    expect(data.title).toBe('sma_cross_v1')
    expect(data.subtitle).toBe('SPY · 1d · 2020-01-02 → 2023-12-29')
  })

  it('formats the five headline metrics with existing formatters', () => {
    const data = buildShareCardData(INPUT, 'ja')
    const byLabel = Object.fromEntries(data.metrics.map((m) => [m.label, m]))
    expect(data.metrics).toHaveLength(5)
    expect(byLabel['リターン']?.value).toBe('+42.50%')
    expect(byLabel['リターン']?.tone).toBe('success')
    expect(byLabel['CAGR']?.value).toBe('9.31%')
    expect(byLabel['シャープ']?.value).toBe('1.23')
    expect(byLabel['最大DD']?.value).toBe('-12.70%')
    expect(byLabel['勝率']?.value).toBe('61.5%')
  })

  it('uses english labels and negative tone for lang=en / losing strategy', () => {
    const losing = {
      ...INPUT,
      metrics: { ...INPUT.metrics, total_return_pct: -8.2 },
    }
    const data = buildShareCardData(losing, 'en')
    const ret = data.metrics.find((m) => m.label === 'Return')
    expect(ret?.value).toBe('-8.20%')
    expect(ret?.tone).toBe('danger')
  })

  it('always carries the AlphaForge brand line (funnel guarantee)', () => {
    const data = buildShareCardData(INPUT, 'ja')
    expect(data.brand).toBe(SHARE_CARD_BRAND)
    expect(SHARE_CARD_BRAND).toBe('Backtested with AlphaForge — alforgelabs.com')
  })
})

describe('normalizeEquity', () => {
  it('maps values into the given box, first/last preserved, min→bottom max→top', () => {
    const pts = normalizeEquity([100, 300, 200], 100, 50)
    expect(pts).toHaveLength(3)
    expect(pts[0]).toEqual({ x: 0, y: 50 })   // min → 下端
    expect(pts[1]).toEqual({ x: 50, y: 0 })   // max → 上端
    expect(pts[2]).toEqual({ x: 100, y: 25 }) // 中間値 → 中央
  })

  it('handles a flat series without division by zero (centered line)', () => {
    const pts = normalizeEquity([100, 100, 100], 100, 50)
    expect(pts.every((p) => p.y === 25)).toBe(true)
  })

  it('returns [] for fewer than 2 points (card renders without a chart)', () => {
    expect(normalizeEquity([], 100, 50)).toEqual([])
    expect(normalizeEquity([100], 100, 50)).toEqual([])
  })

  it('drops NaN/Infinity samples instead of poisoning the whole curve', () => {
    // Math.min/max は NaN が 1 点でも混ざると全体を NaN 化する。
    // 壊れたカード（曲線が空白のまま SNS に共有される）を防ぐため、
    // 非有限値は座標化から除外する。
    const pts = normalizeEquity([100, NaN, 300, Infinity, 200], 100, 50)
    expect(pts).toHaveLength(3)
    expect(pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true)
    expect(pts[0]).toEqual({ x: 0, y: 50 })    // min → 下端
    expect(pts[1]).toEqual({ x: 50, y: 0 })    // max → 上端
    expect(pts[2]).toEqual({ x: 100, y: 25 })  // 中間値 → 中央
  })

  it('returns [] when fewer than 2 finite values remain', () => {
    expect(normalizeEquity([NaN, 100, Infinity], 100, 50)).toEqual([])
    expect(normalizeEquity([NaN, NaN], 100, 50)).toEqual([])
  })

  it('downsamples long series to a bounded number of points', () => {
    const long = Array.from({ length: 5000 }, (_, i) => i)
    const pts = normalizeEquity(long, 1000, 300)
    expect(pts.length).toBeLessThanOrEqual(400)
    expect(pts[0]?.x).toBe(0)
    expect(pts.at(-1)?.x).toBe(1000)
  })
})

describe('truncateToWidth', () => {
  // 長い strategy_id がカード右端をはみ出すと SNS 上で破綻した画像が拡散する。
  // 1 文字 10px の擬似メジャーで切り詰め動作を検証する。
  const measure = (s: string): number => s.length * 10

  it('returns the text unchanged when it fits', () => {
    expect(truncateToWidth('abcdef', 100, measure)).toBe('abcdef')
  })

  it('truncates with an ellipsis when too wide', () => {
    expect(truncateToWidth('abcdefghij', 60, measure)).toBe('abcde…')
  })

  it('keeps the truncated result within maxWidth including the ellipsis', () => {
    const out = truncateToWidth('abcdefghij', 60, measure)
    expect(measure(out)).toBeLessThanOrEqual(60)
  })
})

describe('shareCardFilename', () => {
  it('builds a safe png filename from strategy and symbol', () => {
    expect(shareCardFilename('sma_cross_v1', 'SPY')).toBe(
      'alphaforge_sma_cross_v1_SPY.png',
    )
  })

  it('replaces path-hostile characters', () => {
    expect(shareCardFilename('a/b', 'US.AAPL')).toBe('alphaforge_a_b_US.AAPL.png')
  })
})
