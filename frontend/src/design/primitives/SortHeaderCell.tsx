import type { CSSProperties } from 'react'

export type SortDirection = 'asc' | 'desc'

interface SortHeaderCellProps {
  label: string
  /** この列が現在の並べ替え基準か */
  active: boolean
  /** active なときの方向 */
  direction: SortDirection
  onSort: () => void
  align?: 'left' | 'right' | 'center'
  width?: number | string
  className?: string
  /** 各テーブル固有の <th> ベーススタイル（TH_BASE 等）を引き継ぐ */
  baseStyle?: CSSProperties
}

/**
 * ソート可能なテーブル列ヘッダ（issue #259）。
 * `<th scope="col">` 内に実 `<button>` を置き、キーボード操作（Enter/Space）と
 * `aria-sort` による並べ替え状態の読み上げを成立させる。`scope="col"` により
 * セル↔ヘッダの関連付け（axe td-has-header）も解消する。
 */
export function SortHeaderCell({
  label,
  active,
  direction,
  onSort,
  align = 'right',
  width,
  className,
  baseStyle,
}: SortHeaderCellProps) {
  const ariaSort = active ? (direction === 'desc' ? 'descending' : 'ascending') : 'none'
  const arrow = active ? (direction === 'desc' ? ' ↓' : ' ↑') : ''
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={className}
      style={{ ...baseStyle, textAlign: align, width }}
    >
      <button
        type="button"
        onClick={onSort}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          margin: 0,
          font: 'inherit',
          color: 'inherit',
          letterSpacing: 'inherit',
          textTransform: 'inherit',
          cursor: 'pointer',
          width: '100%',
          textAlign: align,
        }}
      >
        {label}
        {arrow}
      </button>
    </th>
  )
}
