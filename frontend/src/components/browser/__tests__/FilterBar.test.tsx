import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, it, expect } from 'vitest'
import { FilterBar } from '../FilterBar'

/**
 * issue #260: フィルタ入力が placeholder のみでアクセシブル名を欠き、
 * 銘柄チップトグルが aria-pressed を欠いていた。
 */
function renderBar(initialEntry = '/browse', symbols: string[] = ['SPY']) {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <FilterBar symbols={symbols} timeframes={['1D']} lang="ja" />
    </MemoryRouter>,
  )
}

describe('FilterBar (issue #260)', () => {
  it('gives the search input an accessible name', () => {
    renderBar()
    expect(screen.getByRole('textbox', { name: /検索/ })).toBeInTheDocument()
  })

  it('gives the Sharpe and DD number inputs accessible names', () => {
    renderBar()
    expect(screen.getByRole('spinbutton', { name: /Sharpe/ })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: /DD/ })).toBeInTheDocument()
  })

  it('exposes aria-pressed on symbol filter chips', async () => {
    renderBar()
    // 銘柄チップは既定で畳まれているため、展開してから確認する
    await userEvent.click(screen.getByRole('button', { name: /銘柄で絞る/ }))
    expect(screen.getByRole('button', { name: 'SPY' })).toHaveAttribute('aria-pressed', 'false')
  })
})

const SYMBOLS = ['AAPL', 'AMD', 'SPY', 'QQQ']

describe('<FilterBar /> 銘柄チップの折り畳み', () => {
  it('既定では銘柄チップを畳み、件数をラベルに出す', () => {
    // 実データでは 46 銘柄が 3 段に折り返して 130px を占めていた
    renderBar('/browse', SYMBOLS)
    expect(screen.queryByRole('button', { name: 'AAPL' })).toBeNull()
    expect(screen.getByRole('button', { name: /銘柄で絞る（4）/ })).toBeInTheDocument()
  })

  it('展開すると銘柄チップが出る', async () => {
    renderBar('/browse', SYMBOLS)
    await userEvent.click(screen.getByRole('button', { name: /銘柄で絞る（4）/ }))
    expect(screen.getByRole('button', { name: 'AAPL' })).toBeInTheDocument()
  })

  it('銘柄が選択済みなら最初から展開する', () => {
    // 選択が見えないまま絞られている状態を作らない
    renderBar('/browse?symbol=SPY', SYMBOLS)
    expect(screen.getByRole('button', { name: 'SPY' })).toBeInTheDocument()
  })
})

describe('<FilterBar /> 未実行トグル', () => {
  it('既定では未チェック', () => {
    renderBar('/browse', SYMBOLS)
    expect(screen.getByRole('checkbox', { name: /未実行を含める/ })).not.toBeChecked()
  })

  it('include_unrun=1 ならチェック済み', () => {
    renderBar('/browse?include_unrun=1', SYMBOLS)
    expect(screen.getByRole('checkbox', { name: /未実行を含める/ })).toBeChecked()
  })
})
