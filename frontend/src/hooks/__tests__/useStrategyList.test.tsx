import { act, renderHook, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
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
  { strategy_id: 'a', name: 'Alpha', symbol: 'BTC', timeframe: '1h', latest_sharpe: 2.0, latest_max_drawdown_pct: -10 },
  { strategy_id: 'b', name: 'Bravo', symbol: 'ETH', timeframe: '4h', latest_sharpe: 1.2, latest_max_drawdown_pct: -20 },
  { strategy_id: 'c', name: 'Charlie', symbol: 'BTC', timeframe: '1d', latest_sharpe: 0.5, latest_max_drawdown_pct: -30 },
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
