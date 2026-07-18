import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../api/client', () => ({
  api: {
    duplicateStrategy: vi.fn(),
  },
}))

import { api } from '../../../api/client'
import { DuplicateStrategyCard } from '../DuplicateStrategyCard'

const duplicateMock = vi.mocked(api.duplicateStrategy)

/**
 * vis#301: 複製ベースの新規戦略作成。登録は forge strategy save（--force なし）
 * への委譲で、ID 衝突は 409。UI 側は「不正 ID で送信できない」「成功時に
 * onDuplicated が新 ID で呼ばれる」「API エラーが表示される」を固定する。
 */
describe('<DuplicateStrategyCard />', () => {
  it('disables the button for invalid or same-as-source IDs', async () => {
    const user = userEvent.setup()
    render(
      <DuplicateStrategyCard strategyId="orig" lang="ja" onDuplicated={vi.fn()} />,
    )
    const button = screen.getByRole('button', { name: '複製' })
    expect(button).toBeDisabled()

    const input = screen.getByRole('textbox', { name: '新しい戦略 ID' })
    await user.type(input, '../evil')
    expect(button).toBeDisabled()
    expect(screen.getByText(/英数字・ハイフン・アンダースコア/)).toBeInTheDocument()

    await user.clear(input)
    await user.type(input, 'orig')
    // 元 ID と同一は 409 になるだけなので送信させない
    expect(button).toBeDisabled()
  })

  it('calls onDuplicated with the new ID on success', async () => {
    const user = userEvent.setup()
    duplicateMock.mockResolvedValueOnce({
      status: 'ok',
      strategy_id: 'orig_v2',
      log_tail: null,
    })
    const onDuplicated = vi.fn()
    render(
      <DuplicateStrategyCard strategyId="orig" lang="ja" onDuplicated={onDuplicated} />,
    )
    await user.type(screen.getByRole('textbox', { name: '新しい戦略 ID' }), 'orig_v2')
    await user.click(screen.getByRole('button', { name: '複製' }))

    await waitFor(() => expect(onDuplicated).toHaveBeenCalledWith('orig_v2'))
    expect(duplicateMock).toHaveBeenCalledWith('orig', 'orig_v2')
  })

  it('shows the API error (e.g. 409 conflict) without calling onDuplicated', async () => {
    const user = userEvent.setup()
    duplicateMock.mockRejectedValueOnce(new Error("strategy_id 'orig_v2' は既に存在します"))
    const onDuplicated = vi.fn()
    render(
      <DuplicateStrategyCard strategyId="orig" lang="ja" onDuplicated={onDuplicated} />,
    )
    await user.type(screen.getByRole('textbox', { name: '新しい戦略 ID' }), 'orig_v2')
    await user.click(screen.getByRole('button', { name: '複製' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('既に存在します')
    expect(onDuplicated).not.toHaveBeenCalled()
  })
})
