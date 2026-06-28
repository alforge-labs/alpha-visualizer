import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ConfirmDialog } from '../ConfirmDialog'

/**
 * issue #265: ネイティブ window.confirm を廃し、アプリ内モーダルで確認する。
 * confirm を OK しても location.reload() せず、呼び出し側が状態を保持したまま
 * 再フェッチできるよう、onConfirm/onCancel コールバックだけを責務とする。
 */
describe('ConfirmDialog (issue #265)', () => {
  it('renders nothing when closed', () => {
    render(
      <ConfirmDialog
        open={false}
        message="m"
        confirmLabel="OK"
        cancelLabel="Cancel"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the message and invokes onConfirm when confirmed', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        open
        message="本当に再実行しますか"
        confirmLabel="実行"
        cancelLabel="やめる"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('本当に再実行しますか')).toBeInTheDocument()
    fireEvent.click(screen.getByText('実行'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('invokes onCancel from the cancel button and the Escape key', () => {
    const onCancel = vi.fn()
    render(
      <ConfirmDialog
        open
        message="m"
        confirmLabel="OK"
        cancelLabel="Cancel"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    )
    fireEvent.click(screen.getByText('Cancel'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(2)
  })
})
