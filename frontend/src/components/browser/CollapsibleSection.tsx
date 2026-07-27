import { useId, useState } from 'react'

export interface CollapsibleSectionProps {
  /** トグルに出す見出し。件数を含めて「消えた」と誤認させないようにする */
  label: string
  defaultOpen?: boolean
  children: React.ReactNode
  testId?: string
}

/**
 * 折り畳みセクション。開閉 state を自前で持つ。
 *
 * screens/ は useState を持てない（frontend/CLAUDE.md / ADR-0001）ため、
 * BrowseScreen から使う折り畳みはこのコンポーネント側に state を置く。
 */
export function CollapsibleSection({
  label,
  defaultOpen = false,
  children,
  testId,
}: CollapsibleSectionProps): React.ReactElement {
  const [open, setOpen] = useState(defaultOpen)
  const contentId = useId()

  return (
    <div data-testid={testId}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? contentId : undefined}
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          width: '100%',
          padding: 'var(--space-3) var(--layout-gutter)',
          background: 'var(--bg)',
          border: 'none',
          borderBottom: '1px solid var(--border)',
          color: 'var(--text2)',
          fontFamily: 'var(--sans)',
          fontSize: 'var(--fs-caption)',
          fontWeight: 600,
          letterSpacing: 'var(--tracking-caption)',
          textTransform: 'uppercase',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            width: 14,
            fontFamily: 'var(--mono)',
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform var(--motion-fast)',
          }}
        >
          ▾
        </span>
        {label}
      </button>
      {open && <div id={contentId}>{children}</div>}
    </div>
  )
}
