import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/client', () => ({
  api: { getAgentBackends: vi.fn() },
}))

import { api } from '../../api/client'
import type { AgentBackendsResponse } from '../../api/types'
import { resetAgentBackendsCache, useAgentBackends } from '../useAgentBackends'

beforeEach(() => {
  vi.mocked(api.getAgentBackends).mockReset()
  // 検出結果はモジュール内で共有される（下の「1 回だけ取得」を参照）。
  // テスト間で持ち越すと後続のテストが fetch されずに前の結果を見てしまう
  resetAgentBackendsCache()
})

/**
 * Task 9: AI 戦略開発バックエンド（claude / codex）の検出結果はマウント時に
 * 1 回だけ取得する。取得に失敗しても GUI 全体を巻き込まず、開発ビューだけを
 * 非表示にできるよう data=null, loading=false へ縮退させる。
 */
describe('useAgentBackends', () => {
  it('マウント時に 1 回だけ取得し data を返す', async () => {
    const response: AgentBackendsResponse = {
      enabled: true, default_max_turns: 100, max_max_turns: 500,
      backends: [{ id: 'claude', available: true, version: '1.0.0' }],
    }
    vi.mocked(api.getAgentBackends).mockResolvedValue(response)
    const { result } = renderHook(() => useAgentBackends())

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual(response)
    expect(api.getAgentBackends).toHaveBeenCalledTimes(1)
  })

  it('複数の呼び出し元がマウントしても取得は 1 回に集約される', async () => {
    // WHY: RootLayout（ナビ表示判定）と DevelopPage が別インスタンスで呼ぶため、
    // /develop へ遷移するたびにサーバー側で claude/codex の --version
    // サブプロセスが起動していた。検出結果は起動中に変わらないので共有する
    const response: AgentBackendsResponse = {
      enabled: true, default_max_turns: 100, max_max_turns: 500,
      backends: [{ id: 'claude', available: true, version: '1.0.0' }],
    }
    vi.mocked(api.getAgentBackends).mockResolvedValue(response)

    const first = renderHook(() => useAgentBackends())
    const second = renderHook(() => useAgentBackends())
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    await waitFor(() => expect(second.result.current.loading).toBe(false))

    expect(api.getAgentBackends).toHaveBeenCalledTimes(1)
    expect(second.result.current.data).toEqual(response)
  })

  it('取得に失敗した場合は共有結果を捨て、次のマウントで再試行する', async () => {
    // WHY: 失敗をキャッシュすると、サーバー起動直後の一時的な失敗が
    // リロードするまで開発ビュー非表示のまま固定されてしまう
    vi.mocked(api.getAgentBackends).mockRejectedValueOnce(new Error('boom'))
    const first = renderHook(() => useAgentBackends())
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    expect(first.result.current.data).toBeNull()

    const response: AgentBackendsResponse = { enabled: true, default_max_turns: 100, max_max_turns: 500, backends: [] }
    vi.mocked(api.getAgentBackends).mockResolvedValue(response)
    const second = renderHook(() => useAgentBackends())
    await waitFor(() => expect(second.result.current.data).toEqual(response))
    expect(api.getAgentBackends).toHaveBeenCalledTimes(2)
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
