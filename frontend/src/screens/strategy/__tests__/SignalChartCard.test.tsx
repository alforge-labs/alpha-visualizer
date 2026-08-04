import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../hooks/useStrategyHistorical', () => ({
  useStrategyHistorical: vi.fn(),
}))
// lightweight-charts は jsdom で動かないため、チャート本体は describe 対象外
vi.mock('../../../charts/tv/StrategySignalChartTV', () => ({
  StrategySignalChartTV: () => <div data-testid="chart-stub" />,
}))

import { useStrategyHistorical } from '../../../hooks/useStrategyHistorical'
import { SignalChartCard } from '../SignalChartCard'

beforeEach(() => {
  vi.mocked(useStrategyHistorical).mockReset()
})

function renderCard(symbol: string | null = 'CL=F') {
  return render(
    <MemoryRouter>
      <SignalChartCard symbol={symbol} trades={[]} lang="ja" />
    </MemoryRouter>,
  )
}

/**
 * issue #486: 未取得銘柄は no_data 表示になるだけで、次に何をすべきか
 * 分からなかった。「データが無い」に行き当たった地点から 1 クリックで
 * 取得（/data のプリフィル付きフォーム）へ繋ぐ。
 */
describe('SignalChartCard (issue #486)', () => {
  it('no_data のときデータ画面へのプリフィル付き取得導線を出す', () => {
    vi.mocked(useStrategyHistorical).mockReturnValue({ status: 'no_data' })
    renderCard('CL=F')
    expect(screen.getByText(/OHLC データが見つかりません/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /データ画面で取得/ })
    expect(link.getAttribute('href')).toBe('/data?symbol=CL%3DF&interval=1d')
  })

  it('ready のときは取得導線を出さない', () => {
    vi.mocked(useStrategyHistorical).mockReturnValue({
      status: 'ready',
      data: { symbol: 'CL=F', interval: '1d', bars: [] } as never,
      isMock: false,
    })
    renderCard('CL=F')
    expect(screen.queryByRole('link', { name: /データ画面で取得/ })).toBeNull()
  })
})
