import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router'
import { describe, it, expect } from 'vitest'
import type { StrategyListItem } from '../../../api/types'
import { CreateStrategyEntry } from '../CreateStrategyEntry'

/**
 * issue #365: 新規戦略作成ウィザード（複製ベース #301）が Detail の
 * 戦略構成タブ内にのみあり、Browse から発見できなかった。
 * Browse ヘッダーの「+ 新規戦略」→ 複製元選択 → 既存ウィザードへ接続する。
 */
const STRATS = [
  { strategy_id: 's1', name: 'SMA v1' },
  { strategy_id: 's2', name: 'RSI v1' },
] as unknown as StrategyListItem[]

function DetailProbe() {
  const { strategyId } = useParams()
  const location = useLocation()
  return <div data-testid="detail-probe">{`${strategyId}${location.search}`}</div>
}

function renderEntry() {
  return render(
    <MemoryRouter initialEntries={['/browse']}>
      <Routes>
        <Route path="/browse" element={<CreateStrategyEntry strategies={STRATS} lang="ja" />} />
        <Route path="/detail/:strategyId" element={<DetailProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('CreateStrategyEntry (issue #365)', () => {
  it('ボタン → 複製元選択 → 戦略構成タブ付きで遷移する', () => {
    renderEntry()
    fireEvent.click(screen.getByRole('button', { name: /新規戦略/ }))
    const select = screen.getByRole('combobox', { name: /複製元/ })
    fireEvent.change(select, { target: { value: 's2' } })
    fireEvent.click(screen.getByRole('button', { name: /作成へ進む/ }))
    expect(screen.getByTestId('detail-probe').textContent).toBe('s2?tab=strategy')
  })

  it('複製元未選択では進めない', () => {
    renderEntry()
    fireEvent.click(screen.getByRole('button', { name: /新規戦略/ }))
    const proceed = screen.getByRole('button', { name: /作成へ進む/ })
    expect(proceed).toBeDisabled()
  })
})
