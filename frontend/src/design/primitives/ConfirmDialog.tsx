import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Button } from './Button'
import { Card } from './Card'

/** ダイアログ内でフォーカス可能な要素のセレクタ（issue #395） */
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface ConfirmDialogProps {
  open: boolean
  message: ReactNode
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  title?: string
  tone?: 'default' | 'danger'
}

/**
 * アプリ内の確認モーダル（issue #265）。ネイティブ window.confirm を置き換える。
 * 確認後に window.location.reload() するのではなく、呼び出し側が状態を保持したまま
 * 再フェッチできるよう、onConfirm/onCancel コールバックの委譲のみを責務とする。
 */
export function ConfirmDialog({
  open,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  title,
  tone = 'default',
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)

  // issue #395: aria-modal 宣言に見合うフォーカス管理。
  // 開いたら安全側（キャンセル = DOM 先頭のボタン）へ初期フォーカスし、
  // 閉じたら開く前にフォーカスされていた要素（トリガー）へ復帰する。
  useEffect(() => {
    if (!open) return
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus()
    return () => {
      previouslyFocused?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onCancel()
        return
      }
      // Tab をダイアログ内に閉じ込める（背景 UI の操作を防ぐ）
      if (e.key !== 'Tab') return
      const root = dialogRef.current
      if (!root) return
      const focusables = root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (focusables.length === 0) return
      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!
      const active = document.activeElement
      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last || !root.contains(active)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      role="presentation"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'color-mix(in srgb, var(--text) 45%, transparent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-4)',
        zIndex: 40,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 420, boxShadow: 'var(--shadow-2)', borderRadius: 'var(--radius-md)' }}
      >
        <Card>
          {title && (
            <h2
              style={{
                margin: '0 0 var(--space-3)',
                fontFamily: 'var(--serif)',
                fontSize: 'var(--fs-h3)',
                fontWeight: 700,
                color: 'var(--text)',
              }}
            >
              {title}
            </h2>
          )}
          <div
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 'var(--fs-body)',
              color: 'var(--text2)',
              lineHeight: 'var(--lh-base)',
            }}
          >
            {message}
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 'var(--space-2)',
              marginTop: 'var(--space-5)',
            }}
          >
            <Button variant="ghost" size="sm" onClick={onCancel}>
              {cancelLabel}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={onConfirm}
              style={
                tone === 'danger'
                  ? { background: 'var(--danger)', borderColor: 'var(--danger)' }
                  : undefined
              }
            >
              {confirmLabel}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
