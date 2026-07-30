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

/**
 * issue #395: aria-modal="true" を宣言しながらフォーカス管理が無く、
 * 開いてもフォーカスが背後に残り Tab で背景 UI を操作できた。
 * destructive 確認（再実行・孤児削除）に使われるため、初期フォーカス・
 * フォーカストラップ・閉じた後の復帰を実装して modal として機能させる。
 */
describe('ConfirmDialog focus management (issue #395)', () => {
  function Harness({ open }: { open: boolean }) {
    return (
      <div>
        <button type="button">trigger</button>
        <ConfirmDialog
          open={open}
          message="m"
          confirmLabel="OK"
          cancelLabel="Cancel"
          onConfirm={() => {}}
          onCancel={() => {}}
        />
      </div>
    )
  }

  it('moves the initial focus to the safe (cancel) button on open', () => {
    const { rerender } = render(<Harness open={false} />)
    screen.getByText('trigger').focus()
    rerender(<Harness open />)
    expect(document.activeElement).toBe(screen.getByText('Cancel').closest('button'))
  })

  it('traps Tab within the dialog (wraps from last to first and back)', () => {
    render(<Harness open />)
    const cancel = screen.getByText('Cancel').closest('button')!
    const ok = screen.getByText('OK').closest('button')!
    // 最後の要素で Tab → 先頭へ戻る
    ok.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(cancel)
    // 先頭の要素で Shift+Tab → 最後へ戻る
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(ok)
  })

  it('restores focus to the previously focused element on close', () => {
    const { rerender } = render(<Harness open={false} />)
    const trigger = screen.getByText('trigger')
    trigger.focus()
    rerender(<Harness open />)
    expect(document.activeElement).not.toBe(trigger)
    rerender(<Harness open={false} />)
    expect(document.activeElement).toBe(trigger)
  })
})
