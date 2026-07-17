import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../api/client', () => ({
  api: {
    createJob: vi.fn(),
    cancelJob: vi.fn(),
    getJob: vi.fn(),
    saveStrategyParameters: vi.fn(),
  },
}))

import { api } from '../../../api/client'
import type { JobSummary } from '../../../api/types'
import { TuningPanel } from '../TuningPanel'

class FakeEventSource {
  static instances: FakeEventSource[] = []
  url: string
  onmessage: ((ev: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  closed = false

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }

  close(): void {
    this.closed = true
  }
}

const jobSummary: JobSummary = {
  job_id: 'job-1',
  kind: 'backtest',
  strategy_id: 'strat_a',
  symbol: 'AAPL',
  status: 'queued',
  created_at: '2026-07-17T00:00:00Z',
  started_at: null,
  finished_at: null,
  error: null,
}

beforeEach(() => {
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
  vi.mocked(api.createJob).mockReset()
  vi.mocked(api.saveStrategyParameters).mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const PARAMS = { period: 20, use_filter: true }

function renderPanel(onSaved?: () => void) {
  return render(
    <TuningPanel
      strategyId="strat_a"
      symbol="AAPL"
      parameters={PARAMS}
      baseline={{ sharpe: 1.2, returnPct: 30, maxDrawdownPct: 12 }}
      lang="ja"
      onSaved={onSaved}
    />,
  )
}

/**
 * issue #293 (GUI化 Wave C): 編集 → 一時実行 → 明示保存のループ。
 * 変更したキーだけを API へ送る（未変更キーの送信は上書き事故のもと）。
 */
describe('TuningPanel (issue #293)', () => {
  it('disables run/save until a parameter is actually changed', () => {
    renderPanel()
    expect(
      screen.getByRole('button', { name: '編集値でバックテスト実行' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'この内容で戦略を保存' }),
    ).toBeDisabled()
  })

  it('runs a tuning job with only the changed parameters', async () => {
    vi.mocked(api.createJob).mockResolvedValue(jobSummary)
    const user = userEvent.setup()
    renderPanel()

    const periodInput = screen.getByRole('spinbutton', { name: 'period' })
    await user.clear(periodInput)
    await user.type(periodInput, '30')
    await user.click(
      screen.getByRole('button', { name: '編集値でバックテスト実行' }),
    )

    await waitFor(() => {
      expect(api.createJob).toHaveBeenCalledWith({
        kind: 'backtest',
        strategy_id: 'strat_a',
        symbol: 'AAPL',
        parameters: { period: 30 },
      })
    })
  })

  it('saves via confirm dialog showing the diff, then calls onSaved', async () => {
    vi.mocked(api.saveStrategyParameters).mockResolvedValue({
      status: 'ok',
      parameters: { period: 30, use_filter: true },
      log_tail: null,
    })
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderPanel(onSaved)

    const periodInput = screen.getByRole('spinbutton', { name: 'period' })
    await user.clear(periodInput)
    await user.type(periodInput, '30')
    await user.click(screen.getByRole('button', { name: 'この内容で戦略を保存' }))

    // 確認ダイアログに変更差分が表示される
    expect(screen.getByText('period: 20 → 30')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '保存する' }))
    await waitFor(() => {
      expect(api.saveStrategyParameters).toHaveBeenCalledWith('strat_a', {
        period: 30,
      })
    })
    expect(onSaved).toHaveBeenCalled()
    expect(screen.getByText('保存しました')).toBeInTheDocument()
  })

  it('surfaces save failure without calling onSaved', async () => {
    vi.mocked(api.saveStrategyParameters).mockRejectedValue(
      new Error('validation failed'),
    )
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderPanel(onSaved)

    const periodInput = screen.getByRole('spinbutton', { name: 'period' })
    await user.clear(periodInput)
    await user.type(periodInput, '30')
    await user.click(screen.getByRole('button', { name: 'この内容で戦略を保存' }))
    await user.click(screen.getByRole('button', { name: '保存する' }))

    await waitFor(() => {
      expect(screen.getByText('validation failed')).toBeInTheDocument()
    })
    expect(onSaved).not.toHaveBeenCalled()
  })
})
