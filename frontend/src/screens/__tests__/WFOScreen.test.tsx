import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type { WFOResult } from '../../api/types'
import { WFOScreen } from '../WFOScreen'

// lightweight-charts は jsdom で rAF 内の未処理例外を投げるため、
// TV チャートをスタブする（このテストの関心はサブタイトルのみ）
vi.mock('../../charts/tv/WFOEquityTV', () => ({
  WFOEquityTV: () => <div data-testid="wfo-equity-tv" />,
}))

/**
 * issue #353: サブタイトル「5ウィンドウ · IS 12ヶ月 / OOS 6ヶ月 · ローリング」が
 * ハードコードで、8 ウィンドウで実行しても「5ウィンドウ」のままだった。
 * 実データ（windows.length・各ウィンドウの期間）から動的に生成し、
 * 取得できない項目（ローリング等の実行設定）は表示しない。
 */
function makeWindow(id: number, withDates: boolean) {
  return {
    id,
    label: `W${id}`,
    is_start: withDates ? '2020-01-01' : '',
    is_end: withDates ? '2020-12-31' : '',
    oos_start: withDates ? '2021-01-01' : '',
    oos_end: withDates ? '2021-06-30' : '',
    is_sharpe: 1.2,
    oos_sharpe: 0.9,
    oos_return: 4.2,
    oos_is_ratio: 0.75,
    pass: true,
  }
}

function makeData(count: number, withDates = true): WFOResult {
  return {
    strategy_id: 's1',
    metric_name: 'sharpe',
    windows: Array.from({ length: count }, (_, i) => makeWindow(i + 1, withDates)),
    composite_equity: [],
    composite_dates: [],
  } as unknown as WFOResult
}

describe('WFOScreen subtitle (issue #353)', () => {
  it('derives window count and IS/OOS spans from the actual data', () => {
    render(<WFOScreen data={makeData(8)} compact={false} lang="ja" />)
    expect(screen.getByText(/8ウィンドウ/)).toBeInTheDocument()
    expect(screen.getByText(/IS 12ヶ月 \/ OOS 6ヶ月/)).toBeInTheDocument()
    // ハードコードされていた誤情報を出さない
    expect(screen.queryByText(/5ウィンドウ/)).not.toBeInTheDocument()
    expect(screen.queryByText(/ローリング/)).not.toBeInTheDocument()
  })

  it('omits IS/OOS spans when window dates are unavailable', () => {
    render(<WFOScreen data={makeData(3, false)} compact={false} lang="ja" />)
    expect(screen.getByText(/3ウィンドウ/)).toBeInTheDocument()
    expect(screen.queryByText(/IS .*ヶ月/)).not.toBeInTheDocument()
  })
})

/**
 * issue #364-7: 「ウォークフォーワード」（長音）と「ウォークフォワード」の
 * 表記ゆれを後者に統一する。
 */
describe('WFOScreen terminology (issue #364)', () => {
  it('タイトルは「ウォークフォワード」表記に統一されている', () => {
    render(<WFOScreen data={makeData(3)} compact={false} lang="ja" />)
    expect(screen.getByText('ウォークフォワード検証')).toBeInTheDocument()
    expect(screen.queryByText(/ウォークフォーワード/)).not.toBeInTheDocument()
  })
})
