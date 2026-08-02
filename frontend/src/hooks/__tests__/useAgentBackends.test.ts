import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/client', () => ({
  api: { getAgentBackends: vi.fn() },
}))

import { api } from '../../api/client'
import type { AgentBackendsResponse } from '../../api/types'
import { useAgentBackends } from '../useAgentBackends'

beforeEach(() => {
  vi.mocked(api.getAgentBackends).mockReset()
})

/**
 * Task 9: AI 戦略開発バックエンド（claude / codex）の検出結果はマウント時に
 * 1 回だけ取得する。取得に失敗しても GUI 全体を巻き込まず、開発ビューだけを
 * 非表示にできるよう data=null, loading=false へ縮退させる。
 */
describe('useAgentBackends', () => {
  it('マウント時に 1 回だけ取得し data を返す', async () => {
    const response: AgentBackendsResponse = {
      enabled: true,
      backends: [{ id: 'claude', available: true, version: '1.0.0' }],
    }
    vi.mocked(api.getAgentBackends).mockResolvedValue(response)
    const { result } = renderHook(() => useAgentBackends())

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual(response)
    expect(api.getAgentBackends).toHaveBeenCalledTimes(1)
  })

  it('取得失敗時は data=null で loading が終わる', async () => {
    // WHY: backends API が落ちても GUI 全体は動き続け、開発ビューだけが
    // 非表示になるのが正しい縮退（画面全体をエラーにしない）
    vi.mocked(api.getAgentBackends).mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useAgentBackends())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toBeNull()
  })
})
