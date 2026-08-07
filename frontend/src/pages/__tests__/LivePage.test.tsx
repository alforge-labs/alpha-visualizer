import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/client', () => ({
  api: {
    listLive: vi.fn(),
    getLive: vi.fn(),
    createLiveJob: vi.fn(),
    getJob: vi.fn(),
    cancelJob: vi.fn(),
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

// useLiveList をモックし、reload() が本来の loading トグル（useLiveList 内部の
// setLoading(true)→setLoading(false)）を発生させないようにする。実装では
// reload() 自体が LiveScreen の loading 分岐を介して LiveTab を毎回
// アンマウント/リマウントさせてしまうため、モックしないと detailReloadKey の
// インクリメント（onFinished 内のもう一方の呼び出し）が getLive 呼び出し回数に
// 与える効果と区別がつかない（reload() だけでも remount が起き偽陽性になる）。
vi.mock('../../hooks/useLiveList', () => ({
  useLiveList: vi.fn(),
}))

import { api } from '../../api/client'
import type { JobSummary, LiveDetailResponse, LiveListItem } from '../../api/types'
import { useLiveList } from '../../hooks/useLiveList'
import { LivePage } from '../LivePage'

/** SSE をテスト内で駆動するための EventSource スタブ（DataPage.test.tsx と同じ形）。 */
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

  emit(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) })
  }
}

function liveJobSummary(overrides: Partial<JobSummary> = {}): JobSummary {
  return {
    job_id: 'job-live-1',
    kind: 'live_refresh',
    strategy_id: '',
    symbol: '',
    status: 'queued',
    created_at: '2026-08-07T00:00:00Z',
    started_at: null,
    finished_at: null,
    error: null,
    ...overrides,
  }
}

const ITEMS: LiveListItem[] = [
  { strategy_id: 'strat_a', has_summary: true, has_trades: true, kind: 'strategy' },
]

const DETAIL: LiveDetailResponse = {
  strategy_id: 'strat_a',
  live: {
    summary: {
      strategy_id: 'strat_a',
      kind: 'strategy',
      total_trades: 3,
      win_rate_pct: 50,
      gross_pnl: 100,
      net_pnl: 90,
    },
    trades: [],
    period: null,
  },
  backtest: null,
  diff: null,
  warnings: [],
}

/** useLiveList のモック実装から返す reload スパイ（テストごとに再生成） */
let reloadSpy: ReturnType<typeof vi.fn<() => void>>

beforeEach(() => {
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
  vi.mocked(api.listLive).mockReset().mockResolvedValue(ITEMS)
  vi.mocked(api.getLive).mockReset().mockResolvedValue(DETAIL)
  vi.mocked(api.createLiveJob).mockReset()
  vi.mocked(api.getJob).mockReset()
  vi.mocked(api.cancelJob).mockReset()

  // loading は常に false 固定（useLiveList 本来の reload トグルによる LiveTab
  // remount を排除し、detailReloadKey 単体の効果だけを観測できるようにする）
  reloadSpy = vi.fn<() => void>()
  vi.mocked(useLiveList).mockReturnValue({
    items: ITEMS,
    loading: false,
    error: null,
    reload: reloadSpy,
  })
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/live']}>
      <LivePage />
    </MemoryRouter>,
  )
}

/**
 * Task 9: LivePage の中核配線（refresh 成功 → 一覧 reload + 詳細
 * remount）を検証する。LiveScreen.test.tsx は detailReloadKey を静的な
 * ダミー値として渡すだけなので、LivePage の onFinished コールバック内で
 * ``reload()`` と ``setDetailReloadKey`` の両方が実際に呼ばれる配線自体は
 * ここでしか検証できない。
 *
 * useLiveList はモックして loading を false 固定にしている。本物の
 * useLiveList を使うと reload() 自体が内部で loading を
 * true→false とトグルし、LiveScreen の loading 分岐を介して LiveTab が
 * 毎回アンマウント/リマウントされるため、setDetailReloadKey を呼ばなくても
 * getLive が 2 回呼ばれてしまい（reload() の副作用と detailReloadKey の効果が
 * 交絡し）判別できなかった。loading を固定することで、getLive の再呼び出しが
 * detailReloadKey の変化だけに起因することを保証する。
 */
describe('LivePage refresh 配線 (Task 9)', () => {
  it('更新ジョブが成功すると一覧 reload と詳細の両方を再取得する', async () => {
    vi.mocked(api.createLiveJob).mockResolvedValue(liveJobSummary())
    renderPage()
    await waitFor(() => expect(api.getLive).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'ライブデータを更新' }))
    await waitFor(() =>
      expect(api.createLiveJob).toHaveBeenCalledWith({ action: 'refresh' }),
    )
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1))

    const es = FakeEventSource.instances[0]!
    act(() => {
      es.emit({ type: 'status', status: 'succeeded', result: null, error: null })
    })

    // 一覧の再取得（useLiveList.reload の呼び出し）
    await waitFor(() => expect(reloadSpy).toHaveBeenCalledTimes(1))
    // detailReloadKey インクリメントによる LiveTab remount → 詳細の再取得
    await waitFor(() => expect(api.getLive).toHaveBeenCalledTimes(2))
  })

  it('更新ジョブが失敗した場合は一覧・詳細を再取得しない', async () => {
    vi.mocked(api.createLiveJob).mockResolvedValue(liveJobSummary())
    renderPage()
    await waitFor(() => expect(api.getLive).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'ライブデータを更新' }))
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1))

    const es = FakeEventSource.instances[0]!
    act(() => {
      es.emit({
        type: 'status',
        status: 'failed',
        result: null,
        error: 'ステップ sync_events が失敗しました',
      })
    })

    expect(await screen.findByText(/sync_events/)).toBeInTheDocument()
    // 失敗時は据え置く（DataPage と同方針）
    expect(reloadSpy).not.toHaveBeenCalled()
    expect(api.getLive).toHaveBeenCalledTimes(1)
  })
})
