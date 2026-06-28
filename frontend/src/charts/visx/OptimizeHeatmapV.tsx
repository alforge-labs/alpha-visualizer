import { useState } from 'react'
import { ParentSize } from '@visx/responsive'
import { Group } from '@visx/group'
import { useChartTheme } from '../../design/useChartTheme'
import { fmtNumber } from '../../lib/format'
import type { HeatmapGrid } from '../../lib/optimizeHeatmap'

export interface OptimizeHeatmapVProps {
  /** 集約済みグリッド（`computeHeatmapGrid` の結果） */
  grid: HeatmapGrid
  /** X 軸パラメータ名 */
  xLabel: string
  /** Y 軸パラメータ名 */
  yLabel: string
  /** ツールチップに表示するメトリクス名（i18n / 整形済み） */
  metricLabel: string
  compact?: boolean
}

interface Hover {
  xi: number
  yi: number
}

const CELL_MIN = 28
const PAD = 12
const TICK_FONT_PX = 11
/** X 軸ラベルの回転角度（-35度） */
const X_LABEL_DEG = 35
/** セル内に値テキストを描画する最小セル幅（px） */
const CELL_TEXT_MIN = 40

/** ラベル文字数から SVG 上の概算幅（px）を返す */
function approxLabelWidth(text: string, fontPx: number): number {
  return Math.ceil(text.length * fontPx * 0.55)
}

/**
 * 最適化パラメータヒートマップ (Presentational)。
 *
 * X×Y ビンのグリッドを描画し、各セルをメトリクス平均値の濃淡
 * （accent の強度）で塗る。ホバーでツールチップに値と
 * パラメータ組合せを表示する。
 */
export function OptimizeHeatmapV(props: OptimizeHeatmapVProps): React.ReactElement {
  return (
    <ParentSize>
      {({ width }) => (width > 0 ? <Inner {...props} width={width} /> : null)}
    </ParentSize>
  )
}

function Inner({
  grid,
  xLabel,
  yLabel,
  metricLabel,
  compact = false,
  width,
}: OptimizeHeatmapVProps & { width: number }) {
  const theme = useChartTheme()
  const [hov, setHov] = useState<Hover | null>(null)

  const nX = grid.xBins.length
  const nY = grid.yBins.length
  const cellMax = compact ? 40 : 56

  // 左余白: Y 軸ビンラベル幅 + Y 軸タイトル分
  const yTickW = Math.max(
    48,
    ...grid.yBins.map((b) => approxLabelWidth(b.label, TICK_FONT_PX)),
  )
  const axisTitleSpace = 20
  const gridLeft = axisTitleSpace + yTickW + PAD
  const innerW = Math.max(0, width - gridLeft - PAD)
  const cell = Math.max(CELL_MIN, Math.min(cellMax, nX > 0 ? innerW / nX : CELL_MIN))
  const gridW = cell * nX
  const gridH = cell * nY

  // 下余白: 回転した X 軸ビンラベル + X 軸タイトル
  const longestXPx = Math.max(
    ...grid.xBins.map((b) => approxLabelWidth(b.label, TICK_FONT_PX)),
    1,
  )
  const xTickH = Math.ceil(longestXPx * Math.sin((X_LABEL_DEG * Math.PI) / 180)) + PAD
  const totalH = PAD + gridH + xTickH + axisTitleSpace + PAD

  const colorFor = (mean: number): string => {
    const { min, max } = grid
    if (min === null || max === null) return 'transparent'
    const t = max === min ? 0.75 : (mean - min) / (max - min)
    return `color-mix(in srgb, ${theme.accent} ${Math.round((0.08 + t * 0.72) * 100)}%, transparent)`
  }

  /** yBins は昇順 → 大きい値ほど上の行に描画する */
  const rowTop = (yi: number): number => (nY - 1 - yi) * cell

  return (
    <div style={{ position: 'relative', overflowX: 'auto' }}>
      <svg
        width={Math.max(width, gridLeft + gridW + PAD)}
        height={totalH}
        role="img"
        aria-label={`Parameter heatmap, ${nX} x ${nY} cells`}
        style={{ display: 'block' }}
      >
        <Group left={gridLeft} top={PAD}>
          {/* Y 軸ビンラベル */}
          {grid.yBins.map((bin, yi) => (
            <text
              key={`y-${yi}`}
              x={-PAD}
              y={rowTop(yi) + cell / 2 + 4}
              textAnchor="end"
              fill={theme.text2}
              fontFamily={theme.mono}
              fontSize={TICK_FONT_PX}
            >
              {bin.label}
            </text>
          ))}
          {/* X 軸ビンラベル（回転） */}
          {grid.xBins.map((bin, xi) => (
            <g
              key={`x-${xi}`}
              transform={`translate(${xi * cell + cell / 2}, ${gridH + 8}) rotate(-${X_LABEL_DEG})`}
            >
              <text
                textAnchor="end"
                fill={theme.text2}
                fontFamily={theme.mono}
                fontSize={TICK_FONT_PX}
              >
                {bin.label}
              </text>
            </g>
          ))}
          {/* 軸タイトル */}
          <text
            x={gridW / 2}
            y={gridH + xTickH + 14}
            textAnchor="middle"
            fill={theme.text3}
            fontFamily={theme.mono}
            fontSize={TICK_FONT_PX}
            letterSpacing="0.04em"
          >
            {xLabel}
          </text>
          <text
            transform={`translate(${-(yTickW + PAD + 8)}, ${gridH / 2}) rotate(-90)`}
            textAnchor="middle"
            fill={theme.text3}
            fontFamily={theme.mono}
            fontSize={TICK_FONT_PX}
            letterSpacing="0.04em"
          >
            {yLabel}
          </text>

          {/* セル */}
          {grid.cells.map((row, yi) =>
            row.map((c, xi) => {
              const isH = hov !== null && hov.xi === xi && hov.yi === yi
              const cx = xi * cell
              const cy = rowTop(yi)
              return (
                <g
                  key={`c-${yi}-${xi}`}
                  // trial が無いセル (null) ではツールチップを出さない
                  onMouseEnter={() => setHov(c === null ? null : { xi, yi })}
                  onMouseLeave={() => setHov(null)}
                  style={{ cursor: 'default' }}
                >
                  <rect
                    x={cx + 1}
                    y={cy + 1}
                    width={cell - 2}
                    height={cell - 2}
                    rx={3}
                    fill={c === null ? 'transparent' : colorFor(c.mean)}
                    stroke={isH ? theme.borderStrong : theme.border}
                    strokeWidth={isH ? 1.5 : 1}
                  />
                  {c !== null && cell >= CELL_TEXT_MIN && (
                    <text
                      x={cx + cell / 2}
                      y={cy + cell / 2 + 3.5}
                      textAnchor="middle"
                      fill={theme.text}
                      fontFamily={theme.mono}
                      fontSize={10}
                      fontWeight={500}
                    >
                      {fmtNumber(c.mean, { decimals: 2 })}
                    </text>
                  )}
                </g>
              )
            }),
          )}
        </Group>
      </svg>

      {hov && (
        <CellTooltip
          hov={hov}
          grid={grid}
          xLabel={xLabel}
          yLabel={yLabel}
          metricLabel={metricLabel}
          left={gridLeft + hov.xi * cell + cell + 12}
          top={PAD + rowTop(hov.yi)}
          theme={theme}
        />
      )}
    </div>
  )
}

interface CellTooltipProps {
  hov: Hover
  grid: HeatmapGrid
  xLabel: string
  yLabel: string
  metricLabel: string
  left: number
  top: number
  theme: ReturnType<typeof useChartTheme>
}

function CellTooltip({ hov, grid, xLabel, yLabel, metricLabel, left, top, theme }: CellTooltipProps) {
  const cellData = grid.cells[hov.yi]?.[hov.xi] ?? null
  const xBin = grid.xBins[hov.xi]
  const yBin = grid.yBins[hov.yi]
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
        boxShadow: 'var(--shadow-2)',
        minWidth: 180,
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ color: theme.text3, fontSize: 11 }}>
          {xLabel} = {xBin?.label ?? '—'} · {yLabel} = {yBin?.label ?? '—'}
        </span>
        <span style={{ color: theme.text, fontSize: 14, fontWeight: 600 }}>
          {metricLabel} = {cellData ? fmtNumber(cellData.mean, { decimals: 3 }) : '—'}
        </span>
        {cellData && (
          <span style={{ color: theme.text2, fontSize: 11 }}>
            n = {cellData.count}
          </span>
        )}
      </div>
    </div>
  )
}
