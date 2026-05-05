import { useMemo, useState } from 'react'
import { ParentSize } from '@visx/responsive'
import type { Lang } from '../../i18n/strings'
import type { MonthlyReturns } from '../../api/types'
import { useChartTheme } from '../../design/useChartTheme'

interface MonthlyHeatmapVProps {
  data: MonthlyReturns
  lang: Lang
}

const MONTHS_JA = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface Hover {
  y: number
  m: number
  v: number | null
}

export function MonthlyHeatmapV({ data, lang }: MonthlyHeatmapVProps) {
  return (
    <ParentSize>
      {({ width }) => (width > 0 ? <Inner width={width} data={data} lang={lang} /> : null)}
    </ParentSize>
  )
}

function Inner({ width, data, lang }: MonthlyHeatmapVProps & { width: number }) {
  const [hov, setHov] = useState<Hover | null>(null)
  const theme = useChartTheme()
  const months = lang === 'ja' ? MONTHS_JA : MONTHS_EN
  const years = useMemo(
    () =>
      Object.keys(data)
        .map(Number)
        .sort((a, b) => a - b),
    [data]
  )

  const yLabelW = 56
  const gap = 4
  const minWidth = 720
  const W = Math.max(minWidth, width)
  const cellW = (W - yLabelW - 12 - 11 * gap) / 12
  const cellH = 32
  const headerH = 30
  const svgH = headerH + years.length * (cellH + gap)

  const cellColor = (v: number | null): string => {
    if (v === null) return 'transparent'
    const k = Math.min(Math.abs(v) / 14, 1)
    if (v >= 0) {
      // success の rgba 表現を JS で組み立てるのは煩雑なので CSS color-mix で
      return `color-mix(in srgb, ${theme.success} ${(0.12 + k * 0.6) * 100}%, transparent)`
    }
    return `color-mix(in srgb, ${theme.danger} ${(0.12 + k * 0.55) * 100}%, transparent)`
  }

  const textCol = (v: number | null): string => {
    if (v === null) return theme.text3
    return theme.text
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg
        width={W}
        height={svgH}
        role="img"
        aria-label={`Monthly returns heatmap, ${years.length} years`}
        style={{ display: 'block' }}
      >
        {months.map((m, i) => (
          <text
            key={i}
            x={yLabelW + 12 + i * (cellW + gap) + cellW / 2}
            y={20}
            textAnchor="middle"
            fill={theme.text3}
            fontFamily={theme.mono}
            fontSize={11}
            fontWeight={600}
            letterSpacing="0.06em"
          >
            {m.toUpperCase()}
          </text>
        ))}
        {years.map((year, yi) => (
          <g key={year}>
            <text
              x={yLabelW}
              y={headerH + yi * (cellH + gap) + cellH / 2 + 4}
              textAnchor="end"
              fill={theme.text2}
              fontFamily={theme.serif}
              fontSize={14}
              fontWeight={600}
            >
              {year}
            </text>
            {(data[year] ?? []).map((v, mi) => {
              const cx = yLabelW + 12 + mi * (cellW + gap)
              const cy = headerH + yi * (cellH + gap)
              const isH = hov && hov.y === year && hov.m === mi
              return (
                <g
                  key={mi}
                  onMouseEnter={() => setHov({ y: year, m: mi, v })}
                  onMouseLeave={() => setHov(null)}
                  style={{ cursor: 'default' }}
                >
                  <rect
                    x={cx}
                    y={cy}
                    width={cellW}
                    height={cellH}
                    rx={3}
                    fill={cellColor(v)}
                    stroke={isH ? theme.borderStrong : theme.border}
                    strokeWidth={1}
                  />
                  <text
                    x={cx + cellW / 2}
                    y={cy + cellH / 2 + 4}
                    textAnchor="middle"
                    fill={textCol(v)}
                    fontFamily={theme.mono}
                    fontSize={12}
                    fontWeight={500}
                  >
                    {v !== null ? (v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1)) : '—'}
                  </text>
                </g>
              )
            })}
          </g>
        ))}
      </svg>
    </div>
  )
}
