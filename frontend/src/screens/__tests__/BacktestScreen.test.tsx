import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { MOCK_BACKTEST } from '../../mock/btData'
import { BacktestScreen } from '../BacktestScreen'

// lightweight-charts は jsdom で rAF 内の未処理例外を投げるため、
// visx レンダラを強制する（このテストの関心は source 注記バナーのみ）
vi.mock('../../constants/featureFlags', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../constants/featureFlags')>()
  return { ...actual, resolveLightweightChartsFlag: () => false }
})

// listLive のネットワークアクセスを避ける（バナーの検証に live 情報は不要）
vi.mock('../../hooks/useLiveAvailability', () => ({
  useLiveAvailability: () => ({ hasLive: false, error: null }),
}))

/**
 * vis#299: 表示中のランが定義ファイル直接実行（チューニング試行）の場合、
 * 保存済みの戦略定義と異なる可能性があることを注記する。
 */
describe('BacktestScreen source note (issue #299)', () => {
  it('shows the trial note for strategy-file runs', () => {
    render(
      <MemoryRouter>
        <BacktestScreen
          data={{ ...MOCK_BACKTEST, source: 'strategy-file' }}
          compact={false}
          lang="ja"
        />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('source-trial-note')).toBeInTheDocument()
  })

  it('shows no note for normal or unknown provenance', () => {
    render(
      <MemoryRouter>
        <BacktestScreen data={MOCK_BACKTEST} compact={false} lang="ja" />
      </MemoryRouter>,
    )
    expect(screen.queryByTestId('source-trial-note')).not.toBeInTheDocument()
  })
})
