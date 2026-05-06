import { useMemo, useState } from 'react'
import { ParentSize } from '@visx/responsive'
import { Group } from '@visx/group'
import { useChartTheme } from '../../design/useChartTheme'

export interface CorrelationCellMeta {
  /** 共通サンプル数（最小長） */
  overlap: number
  /** 行・列戦略の銘柄が一致しているか（false で注釈を出す） */
  symbolsMatch: boolean
}

export interface CorrelationHeatmapVProps {
  labels: string[]
  matrix: (number | null)[][]
  /** セルごとの追加情報。省略時はツールチップに overlap を表示しない */
  meta?: CorrelationCellMeta[][]
  /** 軸ラベル下に表示する銘柄（labels と同じ長さ。省略可） */
  symbols?: (string | null | undefined)[]
  height?: number
}

interface Hover {
  row: number
  col: number
}

const CELL_MIN = 36
const CELL_MAX = 64
const LABEL_W = 132
const LABEL_H = 88
const PAD = 12

function formatR(r: number | null): string {
  if (r === null) return '—'
  const sign = r >= 0 ? '+' : ''
  return `${sign}${r.toFixed(2)}`
}

/**
 * Pearson 相関ヒートマップ。
 *
 * カラーマッピング:
 * - 高相関（+1 寄り）= warning（同質リスクの集中を警告）
 * - 低相関（-1 寄り）= success（分散効果あり）
 * - 0 周辺は中間色
 */
export function CorrelationHeatmapV(props: CorrelationHeatmapVProps): React.ReactElement {
  return (
    <ParentSize>
      {({ width }) => (width > 0 ? <Inner {...props} width={width} /> : null)}
    </ParentSize>
  )
}

function Inner({
  labels,
  matrix,
  meta,
  symbols,
  width,
  height,
}: CorrelationHeatmapVProps & { width: number }) {
  const theme = useChartTheme()
  const [hov, setHov] = useState<Hover | null>(null)

  const n = labels.length
  const innerW = Math.max(0, width - LABEL_W - PAD * 2)
  const cell = Math.max(CELL_MIN, Math.min(CELL_MAX, n > 0 ? innerW / n : CELL_MIN))
  const gridSize = cell * n
  const totalH = height ?? LABEL_H + gridSize + PAD * 2
  const gridLeft = LABEL_W
  const gridTop = LABEL_H

  const cellColor = useMemo(() => {
    return (r: number | null): string => {
      if (r === null) return 'transparent'
      // r in [-1, 1] → high positive = warning, high negative = success
      if (r >= 0) {
        const k = Math.min(Math.max(r, 0), 1)
        return `color-mix(in srgb, ${theme.warn} ${(0.1 + k * 0.7) * 100}%, transparent)`
      }
      const k = Math.min(Math.max(-r, 0), 1)
      return `color-mix(in srgb, ${theme.success} ${(0.1 + k * 0.6) * 100}%, transparent)`
    }
  }, [theme])

  return (
    <div style={{ position: 'relative', overflowX: 'auto' }}>
      <svg
        width={Math.max(width, gridLeft + gridSize + PAD)}
        height={totalH}
        role="img"
        aria-label={`Correlation heatmap, ${n} strategies`}
        style={{ display: 'block' }}
      >
        <Group left={gridLeft} top={gridTop}>
          {labels.map((label, i) => (
            <g key={`row-${i}`}>
              <text
                x={-PAD}
                y={i * cell + cell / 2 + 4}
                textAnchor="end"
                fill={theme.text2}
                fontFamily={theme.serif}
                fontSize={13}
                fontWeight={600}
              >
                {label}
              </text>
              {symbols?.[i] && (
                <text
                  x={-PAD}
                  y={i * cell + cell / 2 + 18}
                  textAnchor="end"
                  fill={theme.text3}
                  fontFamily={theme.mono}
                  fontSize={10}
                  letterSpacing="0.04em"
                >
                  {symbols[i]}
                </text>
              )}
            </g>
          ))}
          {labels.map((label, j) => (
            <g key={`col-${j}`} transform={`translate(${j * cell + cell / 2}, ${-PAD}) rotate(-35)`}>
              <text
                textAnchor="start"
                fill={theme.text2}
                fontFamily={theme.serif}
                fontSize={12}
                fontWeight={600}
              >
                {label}
              </text>
            </g>
          ))}

          {matrix.map((row, i) =>
            row.map((r, j) => {
              const isH = hov && hov.row === i && hov.col === j
              const cx = j * cell
              const cy = i * cell
              return (
                <g
                  key={`c-${i}-${j}`}
                  onMouseEnter={() => setHov({ row: i, col: j })}
                  onMouseLeave={() => setHov(null)}
                  style={{ cursor: 'default' }}
                >
                  <rect
                    x={cx + 1}
                    y={cy + 1}
                    width={cell - 2}
                    height={cell - 2}
                    rx={3}
                    fill={cellColor(r)}
                    stroke={isH ? theme.borderStrong : theme.border}
                    strokeWidth={isH ? 1.5 : 1}
                  />
                  <text
                    x={cx + cell / 2}
                    y={cy + cell / 2 + 4}
                    textAnchor="middle"
                    fill={r === null ? theme.text3 : theme.text}
                    fontFamily={theme.mono}
                    fontSize={12}
                    fontWeight={500}
                  >
                    {formatR(r)}
                  </text>
                </g>
              )
            }),
          )}
        </Group>
      </svg>

      {hov && (
        <CellTooltip
          row={hov.row}
          col={hov.col}
          labels={labels}
          matrix={matrix}
          meta={meta}
          left={gridLeft + hov.col * cell + cell + 12}
          top={gridTop + hov.row * cell}
          theme={theme}
        />
      )}
    </div>
  )
}

interface CellTooltipProps {
  row: number
  col: number
  labels: string[]
  matrix: (number | null)[][]
  meta?: CorrelationCellMeta[][]
  left: number
  top: number
  theme: ReturnType<typeof useChartTheme>
}

function CellTooltip({ row, col, labels, matrix, meta, left, top, theme }: CellTooltipProps) {
  const r = matrix[row]?.[col] ?? null
  const cellMeta = meta?.[row]?.[col]
  const rowLabel = labels[row] ?? ''
  const colLabel = labels[col] ?? ''
  return (
    <div
      role="tooltip"
      style={{
        position: 'absolute',
        left,
        top,
        background: theme.surface,
        border: `1px solid ${theme.borderStrong}`,
        color: theme.text,
        borderRadius: 8,
        padding: '10px 12px',
        fontFamily: theme.mono,
        fontSize: 12,
        boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
        minWidth: 200,
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ color: theme.text3, fontSize: 11 }}>
          {rowLabel} × {colLabel}
        </span>
        <span style={{ color: theme.text, fontSize: 14, fontWeight: 600 }}>
          ρ = {formatR(r)}
        </span>
        {cellMeta && (
          <span style={{ color: theme.text2, fontSize: 11 }}>
            overlap = {cellMeta.overlap}d
            {!cellMeta.symbolsMatch && ' · 銘柄が異なる'}
          </span>
        )}
      </div>
    </div>
  )
}
