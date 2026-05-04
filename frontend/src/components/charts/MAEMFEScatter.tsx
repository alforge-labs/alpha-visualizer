import { useContext, useState } from 'react'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import type { Trade } from '../../api/types'
import { DashboardContext } from '../../contexts/DashboardContext'

interface MAEMFEScatterProps {
  trades: Trade[]
  lang: Lang
  compact: boolean
}

interface Tip {
  t: Trade
  cx: number
  cy: number
}

export function MAEMFEScatter({ trades, lang, compact }: MAEMFEScatterProps) {
  const [tooltip, setTooltip] = useState<Tip | null>(null)
  const ctx = useContext(DashboardContext)
  const highlightedTradeId = ctx?.highlightedTradeId ?? null
  const setHighlightedTradeId = ctx?.setHighlightedTradeId ?? (() => {})
  const L = makeL(lang)

  const valid = trades.filter((t) => t.mae_pct != null && t.mfe_pct != null)
  const maxMAE = (Math.max(...valid.map((t) => t.mae_pct), 1) || 1) * 1.12
  const maxMFE = (Math.max(...valid.map((t) => t.mfe_pct), 1) || 1) * 1.12

  const W = 800
  const H = compact ? 240 : 300
  const P = { l: 60, r: 24, t: 20, b: 56 }
  const pW = W - P.l - P.r
  const pH = H - P.t - P.b

  const toX = (v: number) => P.l + (v / maxMAE) * pW
  const toY = (v: number) => P.t + (1 - v / maxMFE) * pH

  const wins = valid.filter((t) => t.return_pct > 0)
  const losses = valid.filter((t) => t.return_pct <= 0)

  const avg = (xs: number[]) =>
    xs.length ? (xs.reduce((s, n) => s + n, 0) / xs.length).toFixed(2) : '—'
  const avgMAEWin = avg(wins.map((t) => t.mae_pct))
  const avgMFEWin = avg(wins.map((t) => t.mfe_pct))
  const avgMAELoss = avg(losses.map((t) => t.mae_pct))

  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    x: toX(f * maxMAE),
    label: `${(f * maxMAE).toFixed(1)}%`,
  }))
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    y: toY(f * maxMFE),
    label: `${(f * maxMFE).toFixed(1)}%`,
  }))

  const diagEnd = Math.min(maxMAE, maxMFE)

  const legend: ReadonlyArray<readonly [string, string, string]> = [
    ['#00e49a', L('利益トレード', 'Winning'), `${wins.length}件 MAE avg ${avgMAEWin}% / MFE avg ${avgMFEWin}%`],
    ['#ff5c5c', L('損失トレード', 'Losing'), `${losses.length}件 MAE avg ${avgMAELoss}%`],
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', paddingLeft: P.l }}>
        {legend.map(([c, lbl, sub], i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.75 }}
            />
            <div>
              <span
                style={{
                  fontFamily: 'var(--sans)',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text)',
                }}
              >
                {lbl}
              </span>
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 11,
                  color: 'var(--text3)',
                  marginLeft: 6,
                }}
              >
                {sub}
              </span>
            </div>
          </div>
        ))}
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--text3)',
            marginLeft: 'auto',
          }}
        >
          {L('円サイズ = |リターン|', 'dot size = |return|')}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
        <defs>
          <clipPath id="scClip">
            <rect x={P.l} y={P.t} width={pW} height={pH} />
          </clipPath>
        </defs>

        {xTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={t.x}
              y1={P.t}
              x2={t.x}
              y2={P.t + pH}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="1"
            />
            <text
              x={t.x}
              y={P.t + pH + 16}
              textAnchor="middle"
              fill="var(--text3)"
              fontSize="11"
              fontFamily="var(--mono)"
            >
              {t.label}
            </text>
          </g>
        ))}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={P.l}
              y1={t.y}
              x2={P.l + pW}
              y2={t.y}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="1"
            />
            <text
              x={P.l - 6}
              y={t.y + 4}
              textAnchor="end"
              fill="var(--text3)"
              fontSize="11"
              fontFamily="var(--mono)"
            >
              {t.label}
            </text>
          </g>
        ))}

        <text
          x={P.l + pW / 2}
          y={H - 6}
          textAnchor="middle"
          fill="var(--text2)"
          fontSize="12"
          fontFamily="var(--mono)"
          fontWeight="500"
        >
          MAE% — {L('最大不利変動', 'Max Adverse Excursion')}
        </text>
        <text
          transform={`translate(13,${P.t + pH / 2}) rotate(-90)`}
          textAnchor="middle"
          fill="var(--text2)"
          fontSize="12"
          fontFamily="var(--mono)"
          fontWeight="500"
        >
          MFE% — {L('最大有利変動', 'Max Favorable Excursion')}
        </text>

        <line
          x1={toX(0)}
          y1={toY(0)}
          x2={toX(diagEnd)}
          y2={toY(diagEnd)}
          stroke="rgba(115,120,144,0.3)"
          strokeWidth="1.5"
          strokeDasharray="5,4"
          clipPath="url(#scClip)"
        />
        <text
          x={toX(diagEnd * 0.62) + 6}
          y={toY(diagEnd * 0.62) - 5}
          fill="var(--text3)"
          fontSize="11"
          fontFamily="var(--mono)"
        >
          MAE=MFE
        </text>

        {valid.map((t, i) => {
          const win = t.return_pct > 0
          const r = Math.max(3.5, Math.min(12, Math.abs(t.return_pct) * 1.3))
          return (
            <circle
              key={i}
              cx={toX(t.mae_pct)}
              cy={toY(t.mfe_pct)}
              r={r}
              fill={win ? 'rgba(0,228,154,0.55)' : 'rgba(255,92,92,0.55)'}
              stroke={win ? '#00e49a' : '#ff5c5c'}
              strokeWidth="1"
              clipPath="url(#scClip)"
              opacity={highlightedTradeId === null || highlightedTradeId === String(t.id) ? 0.85 : 0.25}
              onMouseEnter={() => {
                setTooltip({ t, cx: toX(t.mae_pct), cy: toY(t.mfe_pct) })
                setHighlightedTradeId(String(t.id))
              }}
              onMouseLeave={() => {
                setTooltip(null)
                setHighlightedTradeId(null)
              }}
              style={{ cursor: 'default' }}
            />
          )
        })}

        {tooltip &&
          (() => {
            const { t, cx, cy } = tooltip
            const tipW = 152
            const tipH = 76
            const tx = cx + 12 + tipW > W ? cx - tipW - 12 : cx + 12
            const ty = Math.max(P.t, Math.min(P.t + pH - tipH, cy - tipH / 2))
            const win = t.return_pct > 0
            return (
              <g>
                <rect
                  x={tx}
                  y={ty}
                  width={tipW}
                  height={tipH}
                  rx="5"
                  fill="var(--surface)"
                  stroke="var(--border-h)"
                />
                <text
                  x={tx + 10}
                  y={ty + 16}
                  fill="var(--text2)"
                  fontSize="11"
                  fontFamily="var(--mono)"
                >
                  #{t.id} {t.direction} · {t.holding_days}d
                </text>
                <text
                  x={tx + 10}
                  y={ty + 31}
                  fill={win ? '#00e49a' : '#ff5c5c'}
                  fontSize="14"
                  fontFamily="var(--mono)"
                  fontWeight="700"
                >
                  {win ? '+' : ''}
                  {t.return_pct.toFixed(2)}%
                </text>
                <text
                  x={tx + 10}
                  y={ty + 47}
                  fill="var(--text3)"
                  fontSize="11"
                  fontFamily="var(--mono)"
                >
                  MAE {t.mae_pct.toFixed(2)}%
                </text>
                <text
                  x={tx + 10}
                  y={ty + 62}
                  fill="var(--text3)"
                  fontSize="11"
                  fontFamily="var(--mono)"
                >
                  MFE {t.mfe_pct.toFixed(2)}%
                </text>
              </g>
            )
          })()}
      </svg>
    </div>
  )
}
