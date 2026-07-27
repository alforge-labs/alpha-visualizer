import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { StrategyListItem } from '../../../api/types'
import { buildRecipes } from '../../../lib/recipes'
import { SymbolCoverageTable } from '../SymbolCoverageTable'

function mkItem(
  overrides: Partial<StrategyListItem> & { strategy_id: string; name: string },
): StrategyListItem {
  return {
    symbol: null,
    timeframe: '1d',
    tags: [],
    target_symbols: [],
    latest_sharpe: null,
    latest_return_pct: null,
    latest_max_drawdown_pct: null,
    latest_profit_factor: null,
    latest_win_rate_pct: null,
    latest_total_trades: null,
    last_run_at: null,
    latest_source: null,
    ...overrides,
  }
}

/**
 * SPY: 3 レシピ（実行済 1 / 未実行 2）
 * QQQ: 2 レシピ（実行済 2 / 未実行 0）
 * MSFT: 1 レシピ（未実行のみ）
 * 未割当: 1 レシピ
 */
const ITEMS: StrategyListItem[] = [
  mkItem({ strategy_id: 'spy1', name: 'SPY Trend', symbol: 'SPY', latest_sharpe: 1.4, latest_return_pct: 12, last_run_at: '2026-03-01T00:00:00' }),
  mkItem({ strategy_id: 'spy2', name: 'SPY Idle A', symbol: 'SPY' }),
  mkItem({ strategy_id: 'spy3', name: 'SPY Idle B', symbol: 'SPY' }),
  mkItem({ strategy_id: 'qqq1', name: 'QQQ A', symbol: 'QQQ', latest_sharpe: 0.8, latest_return_pct: 4, last_run_at: '2026-02-01T00:00:00' }),
  mkItem({ strategy_id: 'qqq2', name: 'QQQ B', symbol: 'QQQ', latest_sharpe: 0.5, latest_return_pct: 2, last_run_at: '2026-01-01T00:00:00' }),
  mkItem({ strategy_id: 'msft1', name: 'MSFT Idle', symbol: 'MSFT' }),
  mkItem({ strategy_id: 'none1', name: 'No Symbol' }),
]

/** URL の変化を assert するための覗き窓。 */
function LocationProbe() {
  const location = useLocation()
  return <div data-testid="search">{location.search}</div>
}

function renderTable(items: StrategyListItem[] = ITEMS, initialUrl = '/browse') {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <SymbolCoverageTable recipes={buildRecipes(items)} lang="ja" />
      <LocationProbe />
    </MemoryRouter>,
  )
}

/** tbody の各行の銘柄セルの表示文字列。ヘッダ行は除く。 */
function rowSymbols(): string[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map(row => within(row).getAllByRole('cell')[0]?.textContent?.trim() ?? '')
}

/** 指定した銘柄の行のセル文字列一覧。 */
function cellsOf(symbol: string): string[] {
  const row = screen.getByRole('button', { name: symbol }).closest('tr')
  if (!row) throw new Error(`${symbol} の行が見つからない`)
  return within(row).getAllByRole('cell').map(c => c.textContent?.trim() ?? '')
}

describe('<SymbolCoverageTable />', () => {
  it('既定では未実行の多い銘柄が先頭に出て、未割当は末尾に来る', () => {
    renderTable()
    // SPY(未実行2) → MSFT(1) → QQQ(0)、未割当は未実行1でも末尾固定
    expect(rowSymbols()).toEqual(['SPY', 'MSFT', 'QQQ', '未割当'])
  })

  it('一度も実行していない銘柄は実行済 0・未実行がレシピ数と等しい', () => {
    renderTable()
    // 列: 銘柄 / 区分 / レシピ / 実行済 / 未実行 / 最高Sharpe / 平均Return / 最終実行
    const cells = cellsOf('MSFT')
    expect(cells[2]).toBe('1')   // レシピ
    expect(cells[3]).toBe('0')   // 実行済
    expect(cells[4]).toBe('1')   // 未実行
    expect(cells[5]).toBe('—')   // 最高 Sharpe
  })

  it('実行済と未実行が混在する銘柄の内訳を出す', () => {
    renderTable()
    const cells = cellsOf('SPY')
    expect(cells[2]).toBe('3')
    expect(cells[3]).toBe('1')
    expect(cells[4]).toBe('2')
  })

  it('列ヘッダのクリックでソート軸が変わり、再クリックで方向が反転する', async () => {
    renderTable()
    const recipeHeader = screen.getByRole('button', { name: /^レシピ/ })

    await userEvent.click(recipeHeader)
    expect(rowSymbols()).toEqual(['SPY', 'QQQ', 'MSFT', '未割当'])

    await userEvent.click(recipeHeader)
    expect(rowSymbols()).toEqual(['MSFT', 'QQQ', 'SPY', '未割当'])
  })

  it('銘柄ボタンのクリックで絞り込みが付き、もう一度で外れる', async () => {
    renderTable()
    const spy = screen.getByRole('button', { name: 'SPY' })

    await userEvent.click(spy)
    expect(screen.getByTestId('search').textContent).toBe('?symbol=SPY')

    await userEvent.click(spy)
    expect(screen.getByTestId('search').textContent).toBe('')
  })

  it('行のクリックでも 1 回だけトグルする（ボタンと二重発火しない）', async () => {
    renderTable()
    const row = screen.getByRole('button', { name: 'SPY' }).closest('tr')
    if (!row) throw new Error('SPY の行が見つからない')

    await userEvent.click(row)
    expect(screen.getByTestId('search').textContent).toBe('?symbol=SPY')
  })

  it('銘柄ボタンの click イベントは行への伝播を止める', () => {
    // react-router の setSearchParams は同一 tick 内の複数呼び出しもすべて
    // 同じ searchParams スナップショットから計算し直す（呼び出しごとに
    // 前回呼び出し結果を積み増さない）ため、ボタン→行の二重発火が起きても
    // 両者は同じ遷移先を計算してしまい、最終 URL だけでは stopPropagation の
    // 有無を判別できない。そのため click イベント自体を直接検証する。
    renderTable()
    const button = screen.getByRole('button', { name: 'SPY' })
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    const stopPropagationSpy = vi.spyOn(event, 'stopPropagation')
    fireEvent(button, event)
    expect(stopPropagationSpy).toHaveBeenCalled()
  })

  it('既に絞り込まれている銘柄の行は aria-pressed が true になる', () => {
    renderTable(ITEMS, '/browse?symbol=QQQ')
    expect(screen.getByRole('button', { name: 'QQQ' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'SPY' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('未割当の行は絞り込めない', () => {
    renderTable()
    expect(screen.getByRole('button', { name: '未割当' })).toBeDisabled()
  })

  it('行にマウスを乗せると背景が変わり、離すと戻る', () => {
    // StrategyRow / RecipeRow と同じ hover フィードバック。onMouseEnter を
    // 消すと isHovered が常に false のままになり、この assert が落ちる。
    renderTable()
    const row = screen.getByRole('button', { name: 'SPY' }).closest('tr')
    if (!row) throw new Error('SPY の行が見つからない')

    expect(row).toHaveStyle({ background: 'transparent' })
    fireEvent.mouseEnter(row)
    expect(row).toHaveStyle({ background: 'var(--surface-2)' })
    fireEvent.mouseLeave(row)
    expect(row).toHaveStyle({ background: 'transparent' })
  })

  it('選択中の行は hover してもハイライト背景のまま', () => {
    renderTable(ITEMS, '/browse?symbol=QQQ')
    const row = screen.getByRole('button', { name: 'QQQ' }).closest('tr')
    if (!row) throw new Error('QQQ の行が見つからない')

    expect(row).toHaveStyle({ background: 'var(--accent-bg)' })
    fireEvent.mouseEnter(row)
    expect(row).toHaveStyle({ background: 'var(--accent-bg)' })
  })

  it('未割当の行は hover しても背景が変わらない（押せないため）', () => {
    renderTable()
    const row = screen.getByRole('button', { name: '未割当' }).closest('tr')
    if (!row) throw new Error('未割当の行が見つからない')

    fireEvent.mouseEnter(row)
    expect(row).toHaveStyle({ background: 'transparent' })
  })

  it('768px 以下で落とす列にだけ u-col-hide-md-down が付く', () => {
    renderTable()
    const headers = screen.getAllByRole('columnheader')
    const classOf = (re: RegExp): string =>
      headers.find(h => re.test(h.textContent ?? ''))?.className ?? '__not_found__'

    expect(classOf(/区分/)).toContain('u-col-hide-md-down')
    expect(classOf(/平均 Return/)).toContain('u-col-hide-md-down')
    expect(classOf(/最終実行/)).toContain('u-col-hide-md-down')
    // 未実行は本 SP2 の主目的なのでどの幅でも落とさない
    expect(classOf(/未実行/)).not.toContain('u-col-hide-md-down')
    expect(classOf(/^銘柄/)).not.toContain('u-col-hide-md-down')
  })

  it('レシピが無いときは何も描かない', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/browse']}>
        <SymbolCoverageTable recipes={[]} lang="ja" />
      </MemoryRouter>,
    )
    expect(container.querySelector('table')).toBeNull()
  })
})
