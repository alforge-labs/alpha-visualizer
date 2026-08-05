import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { GuideSteps } from '../FirstStrategyGuide'
import { FirstStrategyGuide } from '../FirstStrategyGuide'

/**
 * issue #493: セットアップ完了後の「最初の成功体験」（初めての戦略で
 * バックテスト結果を見る → TradingView に出す）まで迷わず到達させる。
 */

const MID_PROGRESS: GuideSteps = {
  dataDone: true,
  strategyDone: true,
  backtestDone: false,
  firstStrategyId: 'sma_cross',
}

function renderGuide(steps: GuideSteps = MID_PROGRESS, dismissed = false) {
  const onDismiss = vi.fn()
  const onRestore = vi.fn()
  render(
    <MemoryRouter>
      <FirstStrategyGuide
        lang="ja"
        steps={steps}
        dismissed={dismissed}
        onDismiss={onDismiss}
        onRestore={onRestore}
      />
    </MemoryRouter>,
  )
  return { onDismiss, onRestore }
}

describe('FirstStrategyGuide (issue #493)', () => {
  it('5 ステップを順番に表示し、各ステップに導線を持つ', () => {
    renderGuide()
    expect(screen.getByText(/はじめての戦略作成/)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /データを取得する/ }).getAttribute('href'),
    ).toBe('/data')
    expect(
      screen.getByRole('link', { name: /戦略を作る/ }).getAttribute('href'),
    ).toBe('/develop')
    expect(
      screen.getByRole('link', { name: /バックテスト結果を見る/ }).getAttribute('href'),
    ).toBe('/detail/sma_cross')
    expect(
      screen.getByRole('link', { name: /最適化する/ }).getAttribute('href'),
    ).toBe('/detail/sma_cross?tab=optimize')
    expect(
      screen.getByRole('link', { name: /TradingView/ }).getAttribute('href'),
    ).toBe('/detail/sma_cross?tab=strategy')
  })

  it('実データに基づく完了判定を持つステップにだけ「完了」を出す', () => {
    renderGuide()
    // dataDone / strategyDone が true、backtestDone が false
    const done = screen.getAllByText('完了')
    expect(done).toHaveLength(2)
  })

  it('戦略が無いときは detail 系リンクを /browse にフォールバックする', () => {
    renderGuide({ dataDone: false, strategyDone: false, backtestDone: false, firstStrategyId: null })
    expect(
      screen.getByRole('link', { name: /バックテスト結果を見る/ }).getAttribute('href'),
    ).toBe('/browse')
    expect(
      screen.getByRole('link', { name: /最適化する/ }).getAttribute('href'),
    ).toBe('/browse')
  })

  it('判定不能（API 失敗）のステップは完了と主張しない', () => {
    renderGuide({ dataDone: null, strategyDone: null, backtestDone: null, firstStrategyId: null })
    expect(screen.queryByText('完了')).not.toBeInTheDocument()
  })

  it('「今後表示しない」で onDismiss を呼ぶ', () => {
    const { onDismiss } = renderGuide()
    fireEvent.click(screen.getByRole('button', { name: /今後表示しない/ }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('非表示中はステップを出さず、再表示ボタンだけを出す', () => {
    const { onRestore } = renderGuide(MID_PROGRESS, true)
    expect(screen.queryByRole('link', { name: /データを取得する/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /ガイドを再表示/ }))
    expect(onRestore).toHaveBeenCalledTimes(1)
  })
})
