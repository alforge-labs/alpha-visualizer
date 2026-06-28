import type { CSSProperties, ReactNode } from 'react'
import { Button } from './Button'

interface ErrorBannerProps {
  /** ユーザー向けに正規化済みのメッセージ（normalizeErrorMessage の戻り値を想定） */
  message: ReactNode
  /** 再試行ボタンのラベル */
  retryLabel: string
  /** 押下で該当データの再フェッチ等を行うハンドラ。未指定なら再試行ボタンを出さない */
  onRetry?: () => void
  /** 生エラー文字列をデバッグ用に title 属性へ保持（UI には表示しない） */
  title?: string
  style?: CSSProperties
}

/**
 * fetch 失敗時のエラー帯（issue #265）。正規化メッセージと再試行導線を併設し、
 * 手動リロードに頼らず該当データだけを再取得できるようにする。
 */
export function ErrorBanner({ message, retryLabel, onRetry, title, style }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        flexWrap: 'wrap',
        fontFamily: 'var(--mono)',
        fontSize: 'var(--fs-mono-sm)',
        letterSpacing: 'var(--tracking-mono)',
        color: 'var(--danger)',
        background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
        border: '1px solid color-mix(in srgb, var(--danger) 22%, transparent)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-3) var(--space-4)',
        ...style,
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>{message}</span>
      {onRetry && (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  )
}
