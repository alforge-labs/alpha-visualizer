import type { CSSProperties } from 'react'

interface DividerProps {
  orientation?: 'horizontal' | 'vertical'
  style?: CSSProperties
}

export function Divider({ orientation = 'horizontal', style }: DividerProps) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      style={{
        ...(orientation === 'vertical'
          ? { width: 1, alignSelf: 'stretch', minHeight: 14 }
          : { height: 1, width: '100%' }),
        background: 'var(--border)',
        flexShrink: 0,
        ...style,
      }}
    />
  )
}
