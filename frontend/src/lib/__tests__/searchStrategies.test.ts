import { describe, it, expect } from 'vitest'
import {
  buildInitialResults,
  searchStrategies,
} from '../searchStrategies'
import type { StrategyListItem } from '../../api/types'
import type { RecentEntry } from '../../hooks/useRecentStrategies'

const ITEMS: StrategyListItem[] = [
  { strategy_id: 'ema_cross', name: 'EMA クロス AAPL', symbol: 'AAPL', timeframe: '1d', tags: ['trend', 'ma'], target_symbols: ['AAPL', 'MSFT'] },
  { strategy_id: 'rsi_dip', name: 'RSI ディップ', symbol: 'TQQQ', timeframe: '1h', tags: ['mean_reversion', 'rsi'], target_symbols: ['TQQQ'] },
  { strategy_id: 'hmm_regime_v1', name: 'HMM レジーム V1', symbol: 'SPY', timeframe: '1d', tags: ['regime'], target_symbols: ['SPY'] },
  { strategy_id: 'sensor01_hmm_v1', name: 'Sensor01 HMM', symbol: 'SENSOR01', timeframe: '1h', tags: [], target_symbols: ['SENSOR01'] },
]

describe('searchStrategies', () => {
  it('returns no results for an empty query', () => {
    expect(searchStrategies(ITEMS, '')).toEqual([])
    expect(searchStrategies(ITEMS, '   ')).toEqual([])
  })

  it('matches by strategy name (case-insensitive, prefix scores higher)', () => {
    const results = searchStrategies(ITEMS, 'ema')
    expect(results).toHaveLength(1)
    expect(results[0]?.item.strategy_id).toBe('ema_cross')
    expect(results[0]?.reason).toBe('name')
  })

  it('matches by strategy_id', () => {
    const results = searchStrategies(ITEMS, 'sensor01')
    expect(results.map(r => r.item.strategy_id)).toContain('sensor01_hmm_v1')
  })

  it('matches by symbol and target_symbols', () => {
    const results = searchStrategies(ITEMS, 'aapl')
    expect(results.map(r => r.item.strategy_id)).toContain('ema_cross')
    const reasons = new Set(results.map(r => r.reason))
    expect(reasons.has('symbol') || reasons.has('name')).toBe(true)
  })

  it('matches by tag (e.g. "rsi" picks up the rsi_dip tag set)', () => {
    const results = searchStrategies(ITEMS, 'mean_reversion')
    expect(results.map(r => r.item.strategy_id)).toContain('rsi_dip')
    expect(results[0]?.reason).toBe('tag')
  })

  it('respects the result limit', () => {
    const big: StrategyListItem[] = Array.from({ length: 50 }, (_, i) => ({
      strategy_id: `s_${i}`,
      name: `Strategy ${i}`,
    }))
    expect(searchStrategies(big, 'strategy', 5)).toHaveLength(5)
  })
})

describe('buildInitialResults', () => {
  it('returns items unchanged when there is no recent history', () => {
    const results = buildInitialResults(ITEMS, [])
    expect(results).toHaveLength(ITEMS.length)
    expect(results.every(r => r.reason === 'name')).toBe(true)
  })

  it('places recent strategies first and avoids duplicates', () => {
    const recent: RecentEntry[] = [
      { strategy_id: 'rsi_dip', opened_at: 200 },
      { strategy_id: 'hmm_regime_v1', opened_at: 100 },
    ]
    const results = buildInitialResults(ITEMS, recent)
    expect(results[0]?.item.strategy_id).toBe('rsi_dip')
    expect(results[0]?.reason).toBe('recent')
    expect(results[1]?.item.strategy_id).toBe('hmm_regime_v1')
    expect(results[1]?.reason).toBe('recent')
    const ids = results.map(r => r.item.strategy_id)
    expect(new Set(ids).size).toBe(ids.length) // no duplicates
  })

  it('skips recent ids that no longer exist in items', () => {
    const recent: RecentEntry[] = [
      { strategy_id: 'deleted_strategy', opened_at: 200 },
      { strategy_id: 'ema_cross', opened_at: 100 },
    ]
    const results = buildInitialResults(ITEMS, recent)
    expect(results[0]?.item.strategy_id).toBe('ema_cross')
  })

  it('respects the limit parameter', () => {
    const results = buildInitialResults(ITEMS, [], 2)
    expect(results).toHaveLength(2)
  })
})
