import { act, renderHook, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import type { PropsWithChildren } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useStrategyList } from '../useStrategyList'
import type { StrategyListItem } from '../../api/types'

vi.mock('../../api/client', () => ({
  api: {
    listStrategies: vi.fn(),
  },
}))

import { api } from '../../api/client'

const SAMPLE: StrategyListItem[] = [
  { strategy_id: 'a', name: 'Alpha', symbol: 'BTC', timeframe: '1h', latest_sharpe: 2.0, latest_max_drawdown_pct: -10, tags: [], target_symbols: [] },
  { strategy_id: 'b', name: 'Bravo', symbol: 'ETH', timeframe: '4h', latest_sharpe: 1.2, latest_max_drawdown_pct: -20, tags: [], target_symbols: [] },
  { strategy_id: 'c', name: 'Charlie', symbol: 'BTC', timeframe: '1d', latest_sharpe: 0.5, latest_max_drawdown_pct: -30, tags: [], target_symbols: [] },
]

interface Harness {
  list: ReturnType<typeof useStrategyList>
  search: URLSearchParams
}

function useHarness(): Harness {
  const list = useStrategyList()
  const location = useLocation()
  return { list, search: new URLSearchParams(location.search) }
}

function renderWithUrl(initialUrl: string) {
  const wrapper = ({ children }: PropsWithChildren) => (
    <MemoryRouter initialEntries={[initialUrl]}>{children}</MemoryRouter>
  )
  return renderHook(useHarness, { wrapper })
}

beforeEach(() => {
  vi.mocked(api.listStrategies).mockResolvedValue(SAMPLE)
})

describe('useStrategyList — URL → state restoration', () => {
  it('uses defaults when URL has no params', async () => {
    const { result } = renderWithUrl('/browse')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    expect(result.current.list.sortKey).toBe('latest_sharpe')
    expect(result.current.list.sortDir).toBe('desc')
    expect(result.current.list.groupBy).toBe('none')
    expect(result.current.list.selectedId).toBeNull()
    expect(result.current.list.compareIds).toEqual([])
  })

  it('restores sort / dir / group from URL', async () => {
    const { result } = renderWithUrl('/browse?sort=name&dir=asc&group=symbol')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    expect(result.current.list.sortKey).toBe('name')
    expect(result.current.list.sortDir).toBe('asc')
    expect(result.current.list.groupBy).toBe('symbol')
  })

  it('falls back when sort / group values are invalid', async () => {
    const { result } = renderWithUrl('/browse?sort=bogus&dir=upwards&group=galaxy')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    expect(result.current.list.sortKey).toBe('latest_sharpe')
    expect(result.current.list.sortDir).toBe('desc')
    expect(result.current.list.groupBy).toBe('none')
  })

  it('restores selectedId from ?selected=', async () => {
    const { result } = renderWithUrl('/browse?selected=a')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    expect(result.current.list.selectedId).toBe('a')
  })

  it('restores compareIds from ?compare=', async () => {
    const { result } = renderWithUrl('/browse?compare=a,b,c')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    expect(result.current.list.compareIds).toEqual(['a', 'b', 'c'])
  })

  it('drops blank entries in compare and trims to max 6', async () => {
    const { result } = renderWithUrl('/browse?compare=a,,b,,c,d,e,f,g,h')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    expect(result.current.list.compareIds).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  it('round-trips a full filter combination URL', async () => {
    const url = '/browse?sort=latest_return_pct&dir=asc&group=tier&q=bravo&symbol=BTC,ETH&tf=1h&sharpe_min=1&dd_max=25&selected=b&compare=a,b'
    const { result } = renderWithUrl(url)
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    expect(result.current.list.sortKey).toBe('latest_return_pct')
    expect(result.current.list.sortDir).toBe('asc')
    expect(result.current.list.groupBy).toBe('tier')
    expect(result.current.list.selectedId).toBe('b')
    expect(result.current.list.compareIds).toEqual(['a', 'b'])
  })
})

describe('useStrategyList — state → URL updates', () => {
  it('toggles sort dir when clicking the same key', async () => {
    const { result } = renderWithUrl('/browse?sort=latest_sharpe&dir=desc')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    act(() => result.current.list.setSort('latest_sharpe'))
    expect(result.current.search.get('dir')).toBe('asc')

    act(() => result.current.list.setSort('latest_sharpe'))
    expect(result.current.search.get('dir')).toBe('desc')
  })

  it('resets to desc when switching to a different sort key', async () => {
    const { result } = renderWithUrl('/browse?sort=latest_sharpe&dir=asc')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    act(() => result.current.list.setSort('name'))
    expect(result.current.search.get('sort')).toBe('name')
    expect(result.current.search.get('dir')).toBe('desc')
  })

  it('removes group key when set to none', async () => {
    const { result } = renderWithUrl('/browse?group=symbol')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    act(() => result.current.list.setGroupBy('none'))
    expect(result.current.search.has('group')).toBe(false)
  })

  it('writes selected to URL and clears it on null', async () => {
    const { result } = renderWithUrl('/browse')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    act(() => result.current.list.setSelectedId('a'))
    expect(result.current.search.get('selected')).toBe('a')

    act(() => result.current.list.setSelectedId(null))
    expect(result.current.search.has('selected')).toBe(false)
  })

  it('toggleCompareId adds, removes, and removes the param when empty', async () => {
    const { result } = renderWithUrl('/browse')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    act(() => result.current.list.toggleCompareId('a'))
    expect(result.current.search.get('compare')).toBe('a')

    act(() => result.current.list.toggleCompareId('b'))
    expect(result.current.search.get('compare')).toBe('a,b')

    act(() => result.current.list.toggleCompareId('a'))
    expect(result.current.search.get('compare')).toBe('b')

    act(() => result.current.list.toggleCompareId('b'))
    expect(result.current.search.has('compare')).toBe(false)
  })

  it('toggleCompareId ignores additions beyond the 6-item limit', async () => {
    const { result } = renderWithUrl('/browse?compare=1,2,3,4,5,6')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    act(() => result.current.list.toggleCompareId('7'))
    expect(result.current.list.compareIds).toEqual(['1', '2', '3', '4', '5', '6'])
    expect(result.current.search.get('compare')).toBe('1,2,3,4,5,6')

    // Removing existing IDs still works at the limit.
    act(() => result.current.list.toggleCompareId('3'))
    expect(result.current.list.compareIds).toEqual(['1', '2', '4', '5', '6'])
  })

  it('removeCompareId removes a single id', async () => {
    const { result } = renderWithUrl('/browse?compare=a,b,c')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    act(() => result.current.list.removeCompareId('b'))
    expect(result.current.search.get('compare')).toBe('a,c')
  })

  it('clearCompareIds removes the compare param', async () => {
    const { result } = renderWithUrl('/browse?compare=a,b')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    act(() => result.current.list.clearCompareIds())
    expect(result.current.search.has('compare')).toBe(false)
  })
})

describe('useStrategyList — レシピ・ロールアップ', () => {
  // 同名 3 件（2 件実行済み・1 件未実行）＋ 全 variant 未実行のレシピ 1 件
  const ROLLUP: StrategyListItem[] = [
    { strategy_id: 'amd_v1', name: 'AMD EMA ST', symbol: 'AMD', timeframe: '1d', latest_sharpe: 0.5, last_run_at: '2026-01-01T00:00:00', tags: [], target_symbols: [] },
    { strategy_id: 'amd_v2', name: 'AMD EMA ST', symbol: 'AMD', timeframe: '1d', latest_sharpe: 0.9, last_run_at: '2026-01-02T00:00:00', tags: [], target_symbols: [] },
    { strategy_id: 'amd_v3', name: 'AMD EMA ST', symbol: null, timeframe: '1d', tags: [], target_symbols: ['AMD'] },
    { strategy_id: 'idle_v1', name: 'Idle Recipe', symbol: null, timeframe: '1d', tags: [], target_symbols: ['SPY'] },
  ]

  beforeEach(() => {
    vi.mocked(api.listStrategies).mockResolvedValue(ROLLUP)
  })

  it('未実行のみのレシピを既定で除外し、隠した件数を数える', async () => {
    const { result } = renderWithUrl('/browse')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    expect(result.current.list.recipes).toHaveLength(1)
    expect(result.current.list.recipes[0]?.name).toBe('AMD EMA ST')
    expect(result.current.list.recipes[0]?.variantCount).toBe(3)
    expect(result.current.list.recipes[0]?.runCount).toBe(2)
    expect(result.current.list.recipeTotal).toBe(2)
    expect(result.current.list.hiddenUnrunRecipeCount).toBe(1)
    expect(result.current.list.includeUnrun).toBe(false)
  })

  it('include_unrun=1 で未実行のみのレシピも出す', async () => {
    const { result } = renderWithUrl('/browse?include_unrun=1')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    expect(result.current.list.recipes).toHaveLength(2)
    expect(result.current.list.hiddenUnrunRecipeCount).toBe(0)
    expect(result.current.list.includeUnrun).toBe(true)
  })

  it('銘柄フィルタが定義のみで判明する銘柄にも効く', async () => {
    // idle_v1 は symbol=null / target_symbols=['SPY']。実効銘柄で絞り込まない
    // 実装だとチップには SPY が出るのに選ぶと 0 件になる。
    const { result } = renderWithUrl('/browse?symbol=SPY&include_unrun=1')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    expect(result.current.list.recipes).toHaveLength(1)
    expect(result.current.list.recipes[0]?.name).toBe('Idle Recipe')
  })

  it('allRecipes はフィルタに依らず全レシピを返す', async () => {
    // symbol=SPY で絞ると表に出るのは Idle Recipe の 1 件だけになるが、
    // カバレッジ表は「絞り込むためのナビゲーション」なので絞り込み結果に
    // 依存してはならない。依存すると絞り込みを解除する手がかりが消える。
    const { result } = renderWithUrl('/browse?symbol=SPY&include_unrun=1')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    expect(result.current.list.recipes).toHaveLength(1)
    expect(result.current.list.allRecipes).toHaveLength(2)
    expect([...result.current.list.allRecipes].map(r => r.name).sort()).toEqual([
      'AMD EMA ST',
      'Idle Recipe',
    ])
  })

  it('recipeTotal は allRecipes の件数と一致する', async () => {
    const { result } = renderWithUrl('/browse')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    expect(result.current.list.recipeTotal).toBe(result.current.list.allRecipes.length)
  })

  it('銘柄の選択肢を実効銘柄から作る', async () => {
    const { result } = renderWithUrl('/browse')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    // amd_v3 と idle_v1 は symbol=null。定義側を見ないと AMD だけになる
    expect(result.current.list.symbols).toEqual(['AMD', 'SPY'])
  })

  it('レシピを best の指標でソートする', async () => {
    vi.mocked(api.listStrategies).mockResolvedValue([
      { strategy_id: 'lo', name: 'Low', symbol: 'SPY', timeframe: '1d', latest_sharpe: 0.3, last_run_at: '2026-01-01T00:00:00', tags: [], target_symbols: [] },
      { strategy_id: 'hi', name: 'High', symbol: 'QQQ', timeframe: '1d', latest_sharpe: 1.8, last_run_at: '2026-01-01T00:00:00', tags: [], target_symbols: [] },
    ])
    const { result } = renderWithUrl('/browse?sort=latest_sharpe&dir=desc')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    expect(result.current.list.recipes.map(r => r.name)).toEqual(['High', 'Low'])
  })

  it('groups はレシピを束ねる', async () => {
    const { result } = renderWithUrl('/browse?group=symbol&include_unrun=1')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    const labels = result.current.list.groups.map(g => g.label).sort()
    expect(labels).toEqual(['AMD', 'SPY'])
    for (const g of result.current.list.groups) {
      expect(g.aggregate.count).toBe(g.items.length)
    }
  })

  it('隠した未実行レシピ数は絞り込み後の集合から数える', async () => {
    // ?symbol=AMD だと AMD レシピ（実行済み）だけが残り、未実行のみの
    // Idle Recipe は絞り込みで既に落ちている。これを「トグルで隠した 1 件」と
    // 報告してはならない。全体から数える実装だと 1 になって落ちる。
    const { result } = renderWithUrl('/browse?symbol=AMD')
    await waitFor(() => expect(result.current.list.loading).toBe(false))

    expect(result.current.list.recipes).toHaveLength(1)
    expect(result.current.list.hiddenUnrunRecipeCount).toBe(0)
  })
})
