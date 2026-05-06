import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

export interface OverflowMenuItem {
  label: ReactNode
  onClick: () => void
  disabled?: boolean
}

interface OverflowMenuProps {
  items: OverflowMenuItem[]
  ariaLabel?: string
}

// issue #54: 狭幅 Toolbar の trailing を集約するためのオーバーフローメニュー。
// Headless UI 等は導入せず素の React + native button でアクセシブルに実装する。
export function OverflowMenu({ items, ariaLabel = 'More actions' }: OverflowMenuProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  // 外クリックで閉じる
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // Esc で閉じる + フォーカスをトリガーに戻す
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const handleItemClick = (item: OverflowMenuItem): void => {
    if (item.disabled) return
    setOpen(false)
    item.onClick()
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={ariaLabel}
        onClick={() => setOpen(prev => !prev)}
        style={{
          fontFamily: 'var(--mono)',
          fontSize: '1.1rem',
          lineHeight: 1,
          padding: '6px 10px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
          background: open ? 'var(--surface-2)' : 'var(--surface)',
          color: 'var(--text)',
          cursor: 'pointer',
          transition: 'background var(--motion-fast), border-color var(--motion-fast)',
        }}
      >
        ⋯
      </button>
      {open && (
        <ul
          id={menuId}
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            minWidth: 180,
            margin: 0,
            padding: 'var(--space-1) 0',
            listStyle: 'none',
            background: 'var(--surface)',
            border: '1px solid var(--border-h)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-2)',
            zIndex: 40,
          }}
        >
          {items.map((item, i) => (
            <li key={i} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => handleItemClick(item)}
                disabled={item.disabled}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: 'var(--space-2) var(--space-4)',
                  background: 'transparent',
                  border: 'none',
                  textAlign: 'left',
                  fontFamily: 'var(--sans)',
                  fontSize: 'var(--fs-caption)',
                  color: item.disabled ? 'var(--text3)' : 'var(--text)',
                  cursor: item.disabled ? 'not-allowed' : 'pointer',
                  transition: 'background var(--motion-fast)',
                }}
                onMouseEnter={(e) => {
                  if (!item.disabled) {
                    e.currentTarget.style.background = 'var(--surface-2)'
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
