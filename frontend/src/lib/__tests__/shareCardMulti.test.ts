import { describe, expect, it } from 'vitest'
import {
  SHARE_CARD_BRAND,
  buildCompareShareCardData,
  buildLiveShareCardData,
  normalizeMultiSeries,
  rebaseToPct,
} from '../shareCard'

/**
 * シェアカードの Compare / Live 展開（Wave 4）。
 * 比較カードは複数戦略を共通スケールで1枚に、ライブカードはペーパー
 * トレード実績を1枚にまとめ、どちらもブランド行で AlphaForge の
 * 認知経路になる。
 */

describe('rebaseToPct', () => {
  it('rebases values to percent change from the first finite non-zero value', () => {
    const out = rebaseToPct([100, 110, 90])
    expect(out).toHaveLength(3)
    expect(out[0]).toBeCloseTo(0)
    expect(out[1]).toBeCloseTo(10)
    expect(out[2]).toBeCloseTo(-10)
  })

  it('returns [] when no finite non-zero base exists', () => {
    expect(rebaseToPct([])).toEqual([])
    expect(rebaseToPct([0, 0])).toEqual([])
    expect(rebaseToPct([NaN, Infinity])).toEqual([])
  })

  it('keeps non-finite entries as NaN for the normalizer to drop', () => {
    const out = rebaseToPct([100, NaN, 120])
    expect(out[0]).toBe(0)
    expect(Number.isNaN(out[1])).toBe(true)
    expect(out[2]).toBeCloseTo(20)
  })
})

describe('normalizeMultiSeries', () => {
  const D = ['2020-01-01', '2020-01-02', '2020-01-03']

  it('maps all series onto a COMMON y-scale (global min/max)', () => {
    // 系列A: 0..10, 系列B: 0..20 → グローバル min=0, max=20。
    // 別々の min/max で正規化すると比較カードの傾きが嘘になるため、
    // 共通スケールであることが本質。
    const [a, b] = normalizeMultiSeries(
      [
        { dates: [D[0]!, D[1]!], values: [0, 10] },
        { dates: [D[0]!, D[1]!], values: [0, 20] },
      ],
      100,
      100,
    )
    expect(a).toEqual([{ x: 0, y: 100 }, { x: 100, y: 50 }])
    expect(b).toEqual([{ x: 0, y: 100 }, { x: 100, y: 0 }])
  })

  it('maps X onto a COMMON date domain (short backtests do not stretch)', () => {
    // 3日分と31日分の比較: 日付を無視して各系列を横幅いっぱいに
    // 引き伸ばすと期間の違いが嘘になる。X も共通ドメインが本質。
    const short = { dates: ['2020-01-01', '2020-01-04'], values: [0, 5] }
    const long = { dates: ['2020-01-01', '2020-01-31'], values: [0, 10] }
    const [s, l] = normalizeMultiSeries([short, long], 300, 100)
    expect(l?.[1]?.x).toBe(300)
    expect(s?.[1]?.x).toBeCloseTo(30) // 3日 / 30日 = 1/10 の位置
  })

  it('drops non-finite values / unparsable dates and series with <2 valid points', () => {
    const [a, b, c] = normalizeMultiSeries(
      [
        { dates: D, values: [0, NaN, 10] },
        { dates: ['2020-01-01', '2020-01-02'], values: [NaN, 5] },
        { dates: ['not-a-date', '2020-01-02', '2020-01-03'], values: [1, 2, 3] },
      ],
      100,
      100,
    )
    expect(a).toHaveLength(2)
    expect(a?.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true)
    expect(b).toEqual([])
    expect(c).toHaveLength(2)
  })

  it('renders flat global span as centered lines', () => {
    const [a] = normalizeMultiSeries([{ dates: D, values: [5, 5, 5] }], 100, 60)
    expect(a?.every((p) => p.y === 30)).toBe(true)
  })
})

describe('buildCompareShareCardData', () => {
  const STRATS = [
    { name: 'sma_v1', total_return_pct: 12.3 },
    { name: 'rsi_v1', total_return_pct: -4.2 },
    { name: 'macd_v1', total_return_pct: 8.0 },
  ]

  it('builds title/subtitle and one metric tile per strategy', () => {
    const data = buildCompareShareCardData(STRATS, 'SPY', 'ja')
    expect(data.title).toBe('戦略比較')
    expect(data.subtitle).toBe('SPY · 3 戦略')
    expect(data.metrics).toHaveLength(3)
    expect(data.metrics[0]).toEqual({ label: 'sma_v1', value: '+12.30%', tone: 'success' })
    expect(data.metrics[1]).toEqual({ label: 'rsi_v1', value: '-4.20%', tone: 'danger' })
    expect(data.brand).toBe(SHARE_CARD_BRAND)
  })

  it('caps tiles at 5 strategies and uses english title for lang=en', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({
      name: `s${i}`,
      total_return_pct: i,
    }))
    const data = buildCompareShareCardData(many, 'QQQ', 'en')
    expect(data.title).toBe('Strategy Comparison')
    expect(data.subtitle).toBe('QQQ · 7 strategies')
    expect(data.metrics).toHaveLength(5)
  })
})

describe('buildLiveShareCardData', () => {
  it('builds a paper-trading card with the four live metrics', () => {
    const data = buildLiveShareCardData(
      {
        strategy_id: 'beat_qqq_hedged_v1',
        updated_at: '2026-06-06T10:50:22+00:00',
        metrics: {
          total_return_pct: 5.4,
          cagr_pct: 11.2,
          sharpe_ratio: 1.31,
          // LivePositionMetrics の max_drawdown_pct は正値規約
          // （trade 単位の負値規約とは異なる。api/types.ts 参照）
          max_drawdown_pct: 6.5,
        },
      },
      'ja',
    )
    expect(data.title).toBe('beat_qqq_hedged_v1')
    expect(data.subtitle).toBe('ペーパートレード実績（ライブ） · 2026-06-06')
    expect(data.metrics.map((m) => m.value)).toEqual(['+5.40%', '11.20%', '1.31', '6.50%'])
    expect(data.metrics[0]?.tone).toBe('success')
    expect(data.brand).toBe(SHARE_CARD_BRAND)
  })

  it('omits the date when updated_at is missing and tolerates null metrics', () => {
    const data = buildLiveShareCardData(
      { strategy_id: 's1', updated_at: null, metrics: {} },
      'en',
    )
    expect(data.subtitle).toBe('Paper trading live record')
    expect(data.metrics.map((m) => m.value)).toEqual(['—', '—', '—', '—'])
  })
})
