import type { ReactNode } from 'react'

interface SectionHeaderProps {
  title: string
  /** モノ caption。任意 */
  caption?: string
  /** 互換のための別名。caption と同じ役割。caption が優先 */
  subtitle?: string
  /** 右側スロット（操作系・サマリ） */
  right?: ReactNode
  /** sub-section 用。serif → sans に変えてサイズも一段階下げる */
  small?: boolean
}

export function SectionHeader({
  title,
  caption,
  subtitle,
  right,
  small = false,
}: SectionHeaderProps) {
  const captionText = caption ?? subtitle
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        paddingBottom: 'var(--space-3)',
        borderBottom: '1px solid var(--border)',
        marginBottom: 'var(--space-4)',
        flexWrap: 'wrap',
      }}
    >
      <div>
        <h2
          style={{
            margin: 0,
            fontFamily: small ? 'var(--sans)' : 'var(--serif)',
            fontSize: small ? 'var(--fs-h3)' : 'var(--fs-h2)',
            fontWeight: small ? 600 : 700,
            letterSpacing: small ? 0 : 'var(--tracking-display)',
            color: 'var(--text)',
            lineHeight: 'var(--lh-snug)',
          }}
        >
          {title}
        </h2>
        {captionText && (
          <p
            style={{
              margin: '6px 0 0',
              fontFamily: 'var(--mono)',
              fontSize: 'var(--fs-mono-sm)',
              color: 'var(--text3)',
              letterSpacing: 'var(--tracking-mono)',
              textTransform: 'uppercase',
            }}
          >
            {captionText}
          </p>
        )}
      </div>
      {right}
    </div>
  )
}

interface SectionLabelProps {
  children: ReactNode
}

/** Mini section heading — 小さなサブセクション用のキャプション */
export function SectionLabel({ children }: SectionLabelProps) {
  return (
    <div
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 'var(--fs-mono-sm)',
        color: 'var(--text3)',
        letterSpacing: 'var(--tracking-caption)',
        textTransform: 'uppercase',
        marginBottom: 'var(--space-2)',
      }}
    >
      {children}
    </div>
  )
}
