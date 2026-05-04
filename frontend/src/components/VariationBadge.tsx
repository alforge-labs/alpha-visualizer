import type { Variation } from '../hooks/useTheme'

const NAMES: Record<Variation, string> = { atlas: 'Atlas', terminal: 'Terminal', clarity: 'Clarity' }
const DESCS: Record<Variation, string> = {
  atlas: 'バランス型サイドバーレイアウト',
  terminal: '高密度ターミナルスタイル',
  clarity: 'クリーンカードレイアウト',
}

export function VariationBadge({ variation }: { variation: Variation }) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        zIndex: 50,
        pointerEvents: 'none',
      }}
    >
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#00e49a' }} />
      <span
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 11,
          color: 'var(--text2)',
          fontWeight: 600,
        }}
      >
        {NAMES[variation]}
      </span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
        {DESCS[variation]}
      </span>
    </div>
  )
}
