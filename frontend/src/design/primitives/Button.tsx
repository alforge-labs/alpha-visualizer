import type { CSSProperties, ReactNode } from 'react'

type Variant = 'primary' | 'ghost' | 'link' | 'subtle'
type Size = 'sm' | 'md'

interface ButtonProps {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: Variant
  size?: Size
  type?: 'button' | 'submit'
  style?: CSSProperties
  title?: string
}

function buttonStyle(variant: Variant, size: Size, disabled: boolean): CSSProperties {
  const padding = size === 'sm' ? '6px 12px' : '8px 16px'
  const fontSize = size === 'sm' ? 'var(--fs-mono-sm)' : 'var(--fs-caption)'
  const base: CSSProperties = {
    padding,
    borderRadius: 'var(--radius-sm)',
    fontFamily: variant === 'link' ? 'var(--sans)' : 'var(--mono)',
    fontSize,
    fontWeight: 600,
    letterSpacing: variant === 'link' ? 0 : 'var(--tracking-mono)',
    textTransform: variant === 'link' ? 'none' : 'uppercase',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    transition: 'background var(--motion-fast), border-color var(--motion-fast), color var(--motion-fast)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    lineHeight: 1.2,
  }
  switch (variant) {
    case 'primary':
      return {
        ...base,
        background: 'var(--accent)',
        color: 'var(--surface)',
        border: '1px solid var(--accent-strong)',
      }
    case 'ghost':
      return {
        ...base,
        background: 'transparent',
        color: 'var(--text2)',
        border: '1px solid var(--border)',
      }
    case 'subtle':
      return {
        ...base,
        background: 'var(--surface-2)',
        color: 'var(--text2)',
        border: '1px solid var(--border)',
      }
    case 'link':
    default:
      return {
        ...base,
        background: 'transparent',
        color: 'var(--accent)',
        border: '1px solid transparent',
        padding: 0,
      }
  }
}

export function Button({
  children,
  onClick,
  disabled = false,
  variant = 'ghost',
  size = 'md',
  type = 'button',
  style,
  title,
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{ ...buttonStyle(variant, size, disabled), ...style }}
    >
      {children}
    </button>
  )
}
