import { useMemo, useState } from 'react'
import { ParentSize } from '@visx/responsive'
import { Group } from '@visx/group'
import { useChartTheme } from '../../design/useChartTheme'
import { fmtNumber } from '../../lib/format'

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
const PAD = 12
const LABEL_FONT_PX = 12
/** 列ラベルの回転角度（-35度。小さいほど上方向に伸びる） */
const COL_LABEL_DEG = 35
/** ラベルを SVG 内で切り詰める最大文字数（はみ出し回避用） */
const LABEL_MAX_CHARS = 22

function truncate(label: string, max: number): string {
  if (label.length <= max) return label
  return `${label.slice(0, max - 1)}…`
}

/** ラベル文字数から SVG 上の概算幅（px）を返す */
function approxLabelWidth(text: string, fontPx: number): number {
  return Math.ceil(text.length * fontPx * 0.55)
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
  const truncatedLabels = useMemo(
    () => labels.map(l => truncate(l, LABEL_MAX_CHARS)),
    [labels],
  )
  // 行ラベル幅: 最長のラベル長から動的に算出（凡例用銘柄に必要な余白も加味）
  const longestRowChars = useMemo(
    () => Math.max(0, ...truncatedLabels.map(l => l.length)),
    [truncatedLabels],
  )
  const labelW = Math.max(120, approxLabelWidth('M'.repeat(longestRowChars), 13) + PAD * 2)

  // 列ラベル高: -COL_LABEL_DEG 度の回転で必要な縦方向余白
  const longestColPx = useMemo(
    () => Math.max(...truncatedLabels.map(l => approxLabelWidth(l, LABEL_FONT_PX)), 1),
    [truncatedLabels],
  )
  const colLabelHeight = Math.ceil(longestColPx * Math.sin((COL_LABEL_DEG * Math.PI) / 180))
  const labelH = Math.max(64, colLabelHeight + PAD * 2)

  const innerW = Math.max(0, width - labelW - PAD * 2)
  const cell = Math.max(CELL_MIN, Math.min(CELL_MAX, n > 0 ? innerW / n : CELL_MIN))
  const gridSize = cell * n
  const totalH = height ?? labelH + gridSize + PAD * 2
  const gridLeft = labelW
  const gridTop = labelH

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
          {truncatedLabels.map((label, i) => (
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
                <title>{labels[i]}</title>
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
          {truncatedLabels.map((label, j) => (
            <g
              key={`col-${j}`}
              transform={`translate(${j * cell + cell / 2}, ${-PAD}) rotate(-${COL_LABEL_DEG})`}
            >
              <text
                textAnchor="start"
                fill={theme.text2}
                fontFamily={theme.serif}
                fontSize={LABEL_FONT_PX}
                fontWeight={600}
              >
                <title>{labels[j]}</title>
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
                    {fmtNumber(r, { decimals: 2, sign: true })}
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
          ρ = {fmtNumber(r, { decimals: 2, sign: true })}
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
