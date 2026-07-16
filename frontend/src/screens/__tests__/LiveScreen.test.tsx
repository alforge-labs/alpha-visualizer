import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { LiveDetailResponse, LiveListItem } from '../../api/types'
import { LiveScreen } from '../LiveScreen'

vi.mock('../../api/client', () => ({
  api: {
    getLive: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number
    url: string
    constructor(message: string, status: number, url: string) {
      super(message)
      this.name = 'ApiError'
      this.status = status
      this.url = url
    }
  },
}))

import { api } from '../../api/client'

const ITEMS: LiveListItem[] = [
  { strategy_id: 'beat_qqq_hedged_v1', has_summary: true, has_trades: false, kind: 'position' },
  { strategy_id: 'strat_a', has_summary: true, has_trades: true, kind: 'strategy' },
]

const POSITION_DETAIL: LiveDetailResponse = {
  strategy_id: 'beat_qqq_hedged_v1',
  live: {
    summary: {
      strategy_id: 'beat_qqq_hedged_v1',
      portfolio_id: 'beat_qqq_hedged_v1',
      kind: 'position',
      metrics: { total_return_pct: 0, cagr_pct: 0, sharpe_ratio: 0, max_drawdown_pct: 0 },
      backtest_metrics: null,
      equity: [],
      receipts_count: 4,
      sub_strategies: ['gld_bh_v1'],
      updated_at: '2026-06-06T10:50:22+00:00',
    },
    trades: [],
    period: null,
  },
  backtest: null,
  diff: null,
  warnings: [],
}

function renderScreen(overrides: Partial<Parameters<typeof LiveScreen>[0]> = {}) {
  const onSelect = vi.fn()
  const props: Parameters<typeof LiveScreen>[0] = {
    items: ITEMS,
    loading: false,
    selectedId: 'beat_qqq_hedged_v1',
    onSelect,
    lang: 'ja',
    theme: 'dark',
    onSetLang: vi.fn(),
    onSetTheme: vi.fn(),
    ...overrides,
  }
  render(
    <MemoryRouter>
      <LiveScreen {...props} />
    </MemoryRouter>,
  )
  return { onSelect }
}

beforeEach(() => {
  vi.mocked(api.getLive).mockReset()
  vi.mocked(api.getLive).mockResolvedValue(POSITION_DETAIL)
})

describe('<LiveScreen />', () => {
  it('renders entry list with kind badge and selected detail', async () => {
    renderScreen()

    // 一覧: 両エントリが表示される
    expect(screen.getByRole('button', { name: /beat_qqq_hedged_v1/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /strat_a/ })).toBeInTheDocument()

    // 選択中エントリの詳細（LiveTab → LivePositionView）がレンダリングされる
    await waitFor(() => {
      expect(screen.getAllByTestId('live-position-card').length).toBeGreaterThan(0)
    })
    expect(api.getLive).toHaveBeenCalledWith('beat_qqq_hedged_v1', '')
  })

  it('calls onSelect when another entry is clicked', async () => {
    const { onSelect } = renderScreen()
    await userEvent.click(screen.getByRole('button', { name: /strat_a/ }))
    expect(onSelect).toHaveBeenCalledWith('strat_a')
  })

  it('shows empty state when there are no live entries', () => {
    renderScreen({ items: [], selectedId: null })
    expect(screen.getByText(/ライブ実績データがまだありません/)).toBeInTheDocument()
  })

  it('empty state explains the alpha-strike → alpha-forge import pipeline', () => {
    // Live 画面のデータ供給源は alpha-strike の JSONL イベントログ。
    // 空状態はエコシステムの取り込み手順（strike が記録 → forge が取込）を
    // 明示し、strike ユーザーの可視化導線・forge への送客を兼ねる。
    renderScreen({ items: [], selectedId: null })
    expect(screen.getByText(/alpha-strike/)).toBeInTheDocument()
    expect(screen.getByText(/live sync-events/)).toBeInTheDocument()
  })

  it('shows loading state and does not fetch detail while loading', () => {
    renderScreen({ items: [], selectedId: null, loading: true })
    expect(screen.getByText(/読み込み中/)).toBeInTheDocument()
    expect(screen.queryByText(/ライブ実績データがまだありません/)).toBeNull()
    expect(api.getLive).not.toHaveBeenCalled()
  })
})
