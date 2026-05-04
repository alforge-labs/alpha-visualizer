import { createContext, useContext, useState } from 'react'
import { RANGES, RANGE_N } from './dashboardConstants'
import type { SelectedRange } from './dashboardConstants'
export type { SelectedRange } from './dashboardConstants'
export { RANGES, RANGE_N }

interface DateRange { start: string; end: string }

interface DashboardContextValue {
  selectedRange: SelectedRange
  setSelectedRange: (r: SelectedRange) => void
  highlightedTradeId: string | null
  setHighlightedTradeId: (id: string | null) => void
  highlightedDateRange: DateRange | null
  setHighlightedDateRange: (r: DateRange | null) => void
}

export const DashboardContext = createContext<DashboardContextValue | null>(null)

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [selectedRange, setSelectedRange] = useState<SelectedRange>('ALL')
  const [highlightedTradeId, setHighlightedTradeId] = useState<string | null>(null)
  const [highlightedDateRange, setHighlightedDateRange] = useState<DateRange | null>(null)

  return (
    <DashboardContext.Provider value={{
      selectedRange, setSelectedRange,
      highlightedTradeId, setHighlightedTradeId,
      highlightedDateRange, setHighlightedDateRange,
    }}>
      {children}
    </DashboardContext.Provider>
  )
}

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext)
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider')
  return ctx
}
