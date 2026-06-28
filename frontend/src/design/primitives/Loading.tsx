import type { CSSProperties, ReactElement } from 'react'
import { SR_ONLY_STYLE } from './srOnly'

/**
 * ローディング系プリミティブ（issue #266）。
 *
 * 一律「Loading…」テキストの代わりに、描画前のレイアウト領域を確保する
 * スケルトンを共有化し、CLS（レイアウトシフト）を抑える。アニメーションは
 * a11y.css の `.af-skeleton` で付与し、prefers-reduced-motion 時は
 * tokens.css のグローバル指定で自動無効化される。
 */

interface SkeletonProps {
  /** 幅。数値は px として解釈される。既定: '100%' */
  width?: number | string
  /** 高さ。数値は px として解釈される。既定: 16 */
  height?: number | string
  /** 角丸。既定: var(--radius-sm) */
  radius?: number | string
  style?: CSSProperties
}

/** 単一のスケルトンプレースホルダ（装飾用途のため aria-hidden）。 */
export function Skeleton({
  width = '100%',
  height = 16,
  radius = 'var(--radius-sm)',
  style,
}: SkeletonProps): ReactElement {
  return (
    <span
      aria-hidden="true"
      data-testid="skeleton"
      className="af-skeleton"
      style={{
        display: 'block',
        width,
        height,
        borderRadius: radius,
        ...style,
      }}
    />
  )
}

interface LoadingProps {
  /** スクリーンリーダー向けの読み上げラベル（例: '読み込み中…'）。 */
  label: string
  /** 並べるスケルトン行数。既定: 3 */
  rows?: number
  /** ルート遷移の fallback など、ビューポート全体を占有する場合に true。 */
  fullPage?: boolean
}

/**
 * アクセシブルなローディング状態。
 *
 * `role="status"` + `aria-live="polite"` で SR に読み込み中を通知しつつ、
 * 視覚的にはスケルトン行を描画してレイアウト領域を先取りする。
 */
export function Loading({ label, rows = 3, fullPage = false }: LoadingProps): ReactElement {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="loading"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        padding: fullPage ? 'var(--space-7)' : 'var(--space-6) 0',
        ...(fullPage ? { minHeight: '100vh', background: 'var(--bg)' } : null),
      }}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton
          key={i}
          height={i === 0 ? 20 : 14}
          width={i === 0 ? '40%' : `${Math.max(40, 92 - i * 10)}%`}
        />
      ))}
      <span style={SR_ONLY_STYLE}>{label}</span>
    </div>
  )
}
