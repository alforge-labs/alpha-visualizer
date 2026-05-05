import { useNavigate } from 'react-router-dom'
import type { StrategyListItem } from '../../api/types'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { Button } from '../../design/primitives'

interface Props {
  compareIds: string[]
  strategies: StrategyListItem[]
  onRemove: (id: string) => void
  lang: Lang
}

export function CompareFloatingBar({
  compareIds,
  strategies,
  onRemove,
  lang,
}: Props): React.ReactElement | null {
  const L = makeL(lang)
  const navigate = useNavigate()

  if (compareIds.length === 0) return null

  const nameOf = (id: string): string =>
    strategies.find(s => s.strategy_id === id)?.name ?? id

  const handleCompare = (): void => {
    navigate(`/compare?ids=${compareIds.join(',')}`)
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 200,
        background: 'var(--surface)',
        borderTop: '1px solid var(--accent-glow)',
        boxShadow: '0 -8px 24px color-mix(in srgb, var(--accent) 12%, transparent)',
        padding: '14px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--sans)',
          fontSize: 'var(--fs-caption)',
          fontWeight: 600,
          color: 'var(--accent)',
          letterSpacing: 'var(--tracking-caption)',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        {L(`${compareIds.length}件選択中`, `${compareIds.length} selected`)}
      </span>

      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          flex: 1,
          minWidth: 0,
        }}
      >
        {compareIds.map(id => (
          <span
            key={id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px 6px 14px',
              background: 'var(--accent-bg)',
              border: '1px solid var(--accent-glow)',
              borderRadius: 'var(--radius-pill)',
              fontFamily: 'var(--sans)',
              fontSize: 'var(--fs-caption)',
              fontWeight: 500,
              color: 'var(--text)',
              maxWidth: 240,
            }}
          >
            <span
              style={{
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {nameOf(id)}
            </span>
            <button
              type="button"
              onClick={() => onRemove(id)}
              aria-label={L('外す', 'Remove')}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text3)',
                fontSize: 14,
                padding: 0,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </span>
        ))}
      </div>

      <Button variant="primary" size="md" onClick={handleCompare}>
        {L('比較する →', 'Compare →')}
      </Button>
    </div>
  )
}
