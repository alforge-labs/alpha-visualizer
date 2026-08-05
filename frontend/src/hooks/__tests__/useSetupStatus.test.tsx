import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/client', () => ({
  api: {
    getSetupStatus: vi.fn(),
  },
}))

import { api } from '../../api/client'
import {
  publishSetupReady,
  resetSetupReadyForTest,
  useSetupReady,
} from '../useSetupStatus'

function Probe() {
  const ready = useSetupReady()
  return <span>{ready === null ? 'null' : String(ready)}</span>
}

const NOT_READY = {
  ready: false,
  cli: { status: 'attention' as const, version: null },
  eula: { status: 'unknown' as const },
  workspace: { status: 'unknown' as const, config_path: null },
  auth: { status: 'unknown' as const, logged_in: null, plan_type: null },
  data: { status: 'unknown' as const, count: null },
}

beforeEach(() => {
  resetSetupReadyForTest()
  vi.mocked(api.getSetupStatus).mockReset()
})

/**
 * issue #493: 未セットアップ検出時にナビの「はじめる」を強調するための
 * 共有ストア。RootLayout（ナビ）と StartPage が別インスタンスで参照しても
 * CLI 集約呼び出し（/api/setup/status）は 1 回に集約される。
 */
describe('useSetupReady (issue #493)', () => {
  it('マウント時に 1 回だけ取得し、ready を共有する', async () => {
    vi.mocked(api.getSetupStatus).mockResolvedValue(NOT_READY)
    render(
      <>
        <Probe />
        <Probe />
      </>,
    )
    await waitFor(() => expect(screen.getAllByText('false')).toHaveLength(2))
    expect(api.getSetupStatus).toHaveBeenCalledTimes(1)
  })

  it('publishSetupReady で最新状態が全購読者に反映される（StartPage の再取得と同期）', async () => {
    vi.mocked(api.getSetupStatus).mockResolvedValue(NOT_READY)
    render(<Probe />)
    await waitFor(() => expect(screen.getByText('false')).toBeInTheDocument())
    publishSetupReady(true)
    await waitFor(() => expect(screen.getByText('true')).toBeInTheDocument())
  })

  it('取得失敗時は null のまま（強調しない縮退）', async () => {
    vi.mocked(api.getSetupStatus).mockRejectedValue(new Error('boom'))
    render(<Probe />)
    await waitFor(() => expect(api.getSetupStatus).toHaveBeenCalled())
    expect(screen.getByText('null')).toBeInTheDocument()
  })
})
