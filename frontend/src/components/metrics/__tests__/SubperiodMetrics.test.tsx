import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { SubperiodMetrics } from '../SubperiodMetrics'

/**
 * issue #377: 期間プリセット（1Y/3Y/5Y/YTD）を選ぶと、選択期間の
 * 日次リターン・equity から主要指標を再計算して表示する。
 */
const N = 800
const DATES = Array.from({ length: N }, (_, i) => {
  const d = new Date(2022, 0, 1)
  d.setDate(d.getDate() + i)
  return d.toISOString().slice(0, 10)
})
const EQUITY = Array.from({ length: N }, (_, i) => 100 * (1 + i * 0.001))
const RETURNS = Array.from({ length: N - 1 }, (_, i) => EQUITY[i + 1]! / EQUITY[i]! - 1)

describe('SubperiodMetrics (issue #377)', () => {
  it('既定（全期間）ではプリセット行のみで再計算値を出さない', () => {
    render(<SubperiodMetrics dates={DATES} equity={EQUITY} returns={RETURNS} lang="ja" />)
    expect(screen.getByRole('button', { name: '1Y' })).toBeInTheDocument()
    expect(screen.queryByTestId('subperiod-metrics')).not.toBeInTheDocument()
  })

  it('1Y を選ぶと選択期間の再計算指標と注記を表示する', () => {
    render(<SubperiodMetrics dates={DATES} equity={EQUITY} returns={RETURNS} lang="ja" />)
    fireEvent.click(screen.getByRole('button', { name: '1Y' }))
    const strip = screen.getByTestId('subperiod-metrics')
    expect(strip.textContent).toContain('リターン')
    expect(strip.textContent).toContain('Sharpe')
    expect(strip.textContent).toContain('最大DD')
    // 取引ベース指標は再計算対象外である旨の注記
    expect(screen.getByText(/日次リターンから再計算/)).toBeInTheDocument()
    // 全期間に戻すと消える
    fireEvent.click(screen.getByRole('button', { name: /全期間/ }))
    expect(screen.queryByTestId('subperiod-metrics')).not.toBeInTheDocument()
  })
})
