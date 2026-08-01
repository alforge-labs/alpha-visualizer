import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type { Trade } from '../../../api/types'
import { HoldingPeriodChart } from '../HoldingPeriodChart'

// jsdom では ParentSize の計測幅が 0 になるため固定幅を与える
vi.mock('@visx/responsive', () => ({
  ParentSize: ({
    children,
  }: {
    children: (size: { width: number; height: number }) => React.ReactNode
  }) => <>{children({ width: 600, height: 300 })}</>,
}))

/**
 * issue #372: 保有期間分布ヒストグラム（勝敗色分け）+ ビン別の
 * 勝率/平均リターン表。塩漬け・スタイル判定の基本チャート。
 */
const TRADES = [
  { id: 1, holding_days: 1, return_pct: 2 },
  { id: 2, holding_days: 2, return_pct: -1 },
  { id: 3, holding_days: 3, return_pct: 3 },
  { id: 4, holding_days: 10, return_pct: -2 },
] as unknown as Trade[]

describe('HoldingPeriodChart (issue #372)', () => {
  it('ヒストグラムとビン別データ表を描画する', () => {
    render(<HoldingPeriodChart trades={TRADES} lang="ja" compact={false} />)
    expect(screen.getByRole('figure')).toBeInTheDocument()
    // データ表（a11y 代替）にビンと勝率が出る
    expect(screen.getByText(/データ表を表示/)).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '2–3d' })).toBeInTheDocument()
  })

  it('取引が無い場合はデータなし表示', () => {
    render(<HoldingPeriodChart trades={[]} lang="ja" compact={false} />)
    expect(screen.getByText(/データなし/)).toBeInTheDocument()
  })
})
