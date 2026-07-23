import { createContext, useCallback, useContext, useState } from 'react'
import type { Time } from 'lightweight-charts'
import { RANGES, RANGE_N } from './dashboardConstants'
import type { SelectedRange } from './dashboardConstants'
export type { SelectedRange } from './dashboardConstants'
export { RANGES, RANGE_N }

interface DateRange { start: string; end: string }

/** チャートの可視範囲（issue #318）。プリセットより細かい、パン/ズーム後の窓。 */
export interface SyncedTimeRange { from: Time; to: Time }

interface DashboardContextValue {
  selectedRange: SelectedRange
  setSelectedRange: (r: SelectedRange) => void
  /**
   * チャート間で共有する可視範囲（issue #318）。
   * null のときは各チャートがデータ全体を表示する。
   */
  syncedTimeRange: SyncedTimeRange | null
  setSyncedTimeRange: (r: SyncedTimeRange | null) => void
  highlightedTradeId: string | null
  setHighlightedTradeId: (id: string | null) => void
  highlightedDateRange: DateRange | null
  setHighlightedDateRange: (r: DateRange | null) => void
}

// eslint-disable-next-line react-refresh/only-export-components
export const DashboardContext = createContext<DashboardContextValue | null>(null)

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [selectedRange, setSelectedRangeState] = useState<SelectedRange>('ALL')
  const [syncedTimeRange, setSyncedTimeRange] = useState<SyncedTimeRange | null>(null)
  const [highlightedTradeId, setHighlightedTradeId] = useState<string | null>(null)
  const [highlightedDateRange, setHighlightedDateRange] = useState<DateRange | null>(null)

  // issue #318: プリセットを変えるとデータが切り出し直されるので、
  // それ以前のパン/ズーム範囲は意味を失う。持ち越すと表示が壊れるため破棄する。
  const setSelectedRange = useCallback((r: SelectedRange) => {
    setSelectedRangeState(r)
    setSyncedTimeRange(null)
  }, [])

  return (
    <DashboardContext.Provider value={{
      selectedRange, setSelectedRange,
      syncedTimeRange, setSyncedTimeRange,
      highlightedTradeId, setHighlightedTradeId,
      highlightedDateRange, setHighlightedDateRange,
    }}>
      {children}
    </DashboardContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext)
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider')
  return ctx
}
