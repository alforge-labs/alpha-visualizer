import { useState } from 'react'
import type { Lang } from '../../i18n/strings'
import type { Theme } from '../../hooks/useTheme'
import type { MonthlyReturns } from '../../api/types'

interface MonthlyHeatmapProps {
  data: MonthlyReturns
  lang: Lang
  theme: Theme
}

const MONTHS_JA = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface Hover {
  y: number
  m: number
  v: number | null
}

export function MonthlyHeatmap({ data, lang, theme }: MonthlyHeatmapProps) {
  const [hov, setHov] = useState<Hover | null>(null)
  const months = lang === 'ja' ? MONTHS_JA : MONTHS_EN
  const years = Object.keys(data).map(Number).sort((a, b) => a - b)
  const cW = 54
  const cH = 28
  const yW = 44
  const gap = 2
  const svgW = yW + 8 + 12 * (cW + gap)
  const svgH = 28 + years.length * (cH + gap)

  const cellColor = (v: number | null): string => {
    if (v === null) return 'rgba(255,255,255,0.02)'
    const k = Math.min(Math.abs(v) / 14, 1)
    return v >= 0 ? `rgba(0,228,154,${0.08 + k * 0.58})` : `rgba(255,92,92,${0.08 + k * 0.55})`
  }

  const textCol = (v: number | null): string => {
    if (v === null) return 'var(--text3)'
    if (theme === 'light') return v >= 0 ? '#0a2018' : '#2a0808'
    return v >= 0 ? '#c8ffe8' : '#ffd0d0'
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        style={{ width: '100%', minWidth: 560, display: 'block' }}
      >
        {months.map((m, i) => (
          <text
            key={i}
            x={yW + 8 + i * (cW + gap) + cW / 2}
            y={18}
            textAnchor="middle"
            fill="var(--text3)"
            fontSize="11"
            fontFamily="'JetBrains Mono',monospace"
            fontWeight="500"
          >
            {m}
          </text>
        ))}
        {years.map((year, yi) => (
          <g key={year}>
            <text
              x={yW}
              y={24 + yi * (cH + gap) + cH / 2 + 4}
              textAnchor="end"
              fill="var(--text2)"
              fontSize="11"
              fontFamily="'JetBrains Mono',monospace"
            >
              {year}
            </text>
            {(data[year] ?? []).map((v, mi) => {
              const cx = yW + 8 + mi * (cW + gap)
              const cy = 22 + yi * (cH + gap)
              const isH = hov && hov.y === year && hov.m === mi
              return (
                <g
                  key={mi}
                  onMouseEnter={() => setHov({ y: year, m: mi, v })}
                  onMouseLeave={() => setHov(null)}
                >
                  <rect
                    x={cx}
                    y={cy}
                    width={cW}
                    height={cH}
                    rx="3"
                    fill={cellColor(v)}
                    stroke={isH ? 'rgba(255,255,255,0.25)' : 'transparent'}
                    strokeWidth="1"
                  />
                  <text
                    x={cx + cW / 2}
                    y={cy + cH / 2 + 4}
                    textAnchor="middle"
                    fill={textCol(v)}
                    fontSize="11"
                    fontFamily="'JetBrains Mono',monospace"
                    fontWeight="500"
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
