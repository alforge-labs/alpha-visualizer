import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IChartApi, Time } from 'lightweight-charts'
import type { ReactNode } from 'react'

import { DashboardProvider, useDashboard } from '../../contexts/DashboardContext'
import { ECHO_SUPPRESS_MS, USER_RANGE_DEBOUNCE_MS, useSyncedTimeRange } from '../useSyncedTimeRange'

/**
 * issue #318: これまで viewport は「プリセット range → チャート」の一方向適用だけで、
 * チャート上のパン/ズームは共有状態へ書き戻されなかった。
 * subscribeVisibleTimeRangeChange で双方向にし、自分の適用によるエコーで
 * 無限ループしないことを担保する。
 */

interface ChartStub {
  chart: IChartApi
  setVisibleRange: ReturnType<typeof vi.fn>
  /** ユーザー操作による可視範囲変更を模擬する */
  emit: (range: { from: Time; to: Time } | null) => void
  handlerCount: () => number
}

function makeChart(): ChartStub {
  const handlers = new Set<(r: { from: Time; to: Time } | null) => void>()
  const setVisibleRange = vi.fn()
  const chart = {
    timeScale: () => ({
      setVisibleRange,
      subscribeVisibleTimeRangeChange: (h: (r: { from: Time; to: Time } | null) => void) => {
        handlers.add(h)
      },
      unsubscribeVisibleTimeRangeChange: (h: (r: { from: Time; to: Time } | null) => void) => {
        handlers.delete(h)
      },
    }),
  } as unknown as IChartApi
  return {
    chart,
    setVisibleRange,
    emit: (range) => {
      for (const h of handlers) h(range)
    },
    handlerCount: () => handlers.size,
  }
}

const FULL = { from: '2024-01-01' as Time, to: '2024-12-31' as Time }
const USER = { from: '2024-06-01' as Time, to: '2024-06-30' as Time }

function wrapper({ children }: { children: ReactNode }) {
  return <DashboardProvider>{children}</DashboardProvider>
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useSyncedTimeRange', () => {
  it('共有範囲が無ければデータ全体の範囲を適用する', () => {
    const stub = makeChart()
    renderHook(() => useSyncedTimeRange({ chart: stub.chart, fullRange: FULL }), { wrapper })
    expect(stub.setVisibleRange).toHaveBeenCalledWith(FULL)
  })

  it('ユーザー操作の可視範囲を debounce して共有状態へ書き戻す', () => {
    const stub = makeChart()
    const { result } = renderHook(
      () => {
        const dash = useDashboard()
        useSyncedTimeRange({ chart: stub.chart, fullRange: FULL })
        return { dash }
      },
      { wrapper },
    )
    // 自分の初期適用によるエコーを消化させる
    act(() => {
      vi.advanceTimersByTime(ECHO_SUPPRESS_MS + 1)
    })

    act(() => {
      stub.emit(USER)
    })
    // debounce 中はまだ書き戻さない
    expect(result.current.dash.syncedTimeRange).toBeNull()

    act(() => {
      vi.advanceTimersByTime(USER_RANGE_DEBOUNCE_MS + 1)
    })
    expect(result.current.dash.syncedTimeRange).toEqual(USER)
  })

  it('連続したパン操作は最後の 1 回だけ書き戻す（debounce）', () => {
    const stub = makeChart()
    const { result } = renderHook(
      () => {
        const dash = useDashboard()
        useSyncedTimeRange({ chart: stub.chart, fullRange: FULL })
        return { dash }
      },
      { wrapper },
    )
    act(() => {
      vi.advanceTimersByTime(ECHO_SUPPRESS_MS + 1)
    })

    act(() => {
      stub.emit({ from: '2024-02-01' as Time, to: '2024-03-01' as Time })
      vi.advanceTimersByTime(USER_RANGE_DEBOUNCE_MS - 10)
      stub.emit(USER)
      vi.advanceTimersByTime(USER_RANGE_DEBOUNCE_MS + 1)
    })
    expect(result.current.dash.syncedTimeRange).toEqual(USER)
  })

  it('自分が適用した範囲のエコーは書き戻さない（無限ループ防止）', () => {
    const stub = makeChart()
    const { result } = renderHook(
      () => {
        const dash = useDashboard()
        useSyncedTimeRange({ chart: stub.chart, fullRange: FULL })
        return { dash }
      },
      { wrapper },
    )
    // 初期適用の直後にライブラリがエコーを返すケース
    act(() => {
      stub.emit(FULL)
      vi.advanceTimersByTime(USER_RANGE_DEBOUNCE_MS + 1)
    })
    expect(result.current.dash.syncedTimeRange).toBeNull()
  })

  it('null（範囲不定）のイベントは無視する', () => {
    const stub = makeChart()
    const { result } = renderHook(
      () => {
        const dash = useDashboard()
        useSyncedTimeRange({ chart: stub.chart, fullRange: FULL })
        return { dash }
      },
      { wrapper },
    )
    act(() => {
      vi.advanceTimersByTime(ECHO_SUPPRESS_MS + 1)
    })
    act(() => {
      stub.emit(null)
      vi.advanceTimersByTime(USER_RANGE_DEBOUNCE_MS + 1)
    })
    expect(result.current.dash.syncedTimeRange).toBeNull()
  })

  it('共有状態が外部から変わったらチャートへ適用する（他チャート/タブからの同期）', () => {
    const stub = makeChart()
    const { result } = renderHook(
      () => {
        const dash = useDashboard()
        useSyncedTimeRange({ chart: stub.chart, fullRange: FULL })
        return { dash }
      },
      { wrapper },
    )
    stub.setVisibleRange.mockClear()

    act(() => {
      result.current.dash.setSyncedTimeRange(USER)
    })
    expect(stub.setVisibleRange).toHaveBeenCalledWith(USER)
  })

  it('unmount で購読を解除する', () => {
    const stub = makeChart()
    const { unmount } = renderHook(
      () => useSyncedTimeRange({ chart: stub.chart, fullRange: FULL }),
      { wrapper },
    )
    expect(stub.handlerCount()).toBe(1)
    unmount()
    expect(stub.handlerCount()).toBe(0)
  })

  it('chart が未生成でも例外を投げない', () => {
    expect(() =>
      renderHook(() => useSyncedTimeRange({ chart: null, fullRange: FULL }), { wrapper }),
    ).not.toThrow()
  })

  it('DashboardProvider の外でも例外を投げず、全体範囲の適用だけ行う', () => {
    const stub = makeChart()
    expect(() =>
      renderHook(() => useSyncedTimeRange({ chart: stub.chart, fullRange: FULL })),
    ).not.toThrow()
    expect(stub.setVisibleRange).toHaveBeenCalledWith(FULL)
  })
})

/**
 * プリセット range を変えるとデータが切り出し直されるため、
 * それ以前の細かい可視範囲は意味を失う。持ち越すと表示が壊れる。
 */
describe('DashboardContext: プリセット変更で同期範囲を破棄する (issue #318)', () => {
  it('setSelectedRange は syncedTimeRange をクリアする', () => {
    const { result } = renderHook(() => useDashboard(), { wrapper })

    act(() => {
      result.current.setSyncedTimeRange(USER)
    })
    expect(result.current.syncedTimeRange).toEqual(USER)

    act(() => {
      result.current.setSelectedRange('1Y')
    })
    expect(result.current.syncedTimeRange).toBeNull()
  })
})
