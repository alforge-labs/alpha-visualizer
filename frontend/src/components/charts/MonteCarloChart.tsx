import { useMemo } from 'react'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import type { Trade } from '../../api/types'

interface MonteCarloChartProps {
  trades: Trade[]
  lang: Lang
  compact: boolean
}

interface Pt {
  xi: number
  v: number
}

const N_SIM = 400

export function MonteCarloChart({ trades, lang, compact }: MonteCarloChartProps) {
  const L = makeL(lang)

  const { pCurves, stats } = useMemo(() => {
    const rets = trades.map((t) => t.return_pct / 100)
    const n = rets.length
    let seed = 0x12345678
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0
      return (seed >>> 0) % n
    }

    const sims: number[][] = []
    for (let s = 0; s < N_SIM; s++) {
      let eq = 100
      const curve: number[] = [100]
      for (let i = 0; i < n; i++) {
        eq = Math.max(eq * (1 + (rets[rand()] ?? 0)), 0.01)
        curve.push(eq)
      }
      sims.push(curve)
    }

    const step = Math.max(1, Math.floor(n / 120))
    const xs: number[] = []
    for (let i = 0; i <= n; i += step) xs.push(i)
    if (xs[xs.length - 1] !== n) xs.push(n)

    const PCT = [5, 25, 50, 75, 95] as const
    const out: Record<number, Pt[]> = { 5: [], 25: [], 50: [], 75: [], 95: [] }

    xs.forEach((xi) => {
      const vals = sims.map((s) => s[xi] ?? 0).sort((a, b) => a - b)
      PCT.forEach((p) => {
        const v = vals[Math.floor((p / 100) * (N_SIM - 1))] ?? 0
        out[p]!.push({ xi, v })
      })
    })

    const finals = sims.map((s) => s[n] ?? 100).sort((a, b) => a - b)
    const stats = {
      p5: finals[Math.floor(0.05 * (N_SIM - 1))] ?? 100,
      p50: finals[Math.floor(0.5 * (N_SIM - 1))] ?? 100,
      p95: finals[Math.floor(0.95 * (N_SIM - 1))] ?? 100,
      lossProb: (finals.filter((f) => f < 100).length / N_SIM) * 100,
    }

    return { pCurves: out, stats }
  }, [trades])

  const W = 800
  const H = compact ? 200 : 262
  const P = { l: 60, r: 36, t: 18, b: 32 }
  const pW = W - P.l - P.r
  const pH = H - P.t - P.b
  const n = trades.length

  const allV = [...(pCurves[5] ?? []), ...(pCurves[95] ?? [])].map((d) => d.v)
  const minV = (Math.min(...allV) || 90) * 0.97
  const maxV = (Math.max(...allV) || 110) * 1.03
  const span = Math.max(maxV - minV, 1e-9)

  const toX = (xi: number) => P.l + (xi / Math.max(n, 1)) * pW
  const toY = (v: number) => P.t + (1 - (v - minV) / span) * pH

  const makePath = (pts: Pt[]) =>
    pts.map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(d.xi).toFixed(1)},${toY(d.v).toFixed(1)}`).join(' ')

  const makeBand = (upper: Pt[], lower: Pt[]) =>
    `${makePath(upper)} ${[...lower]
      .reverse()
      .map((d) => `L${toX(d.xi).toFixed(1)},${toY(d.v).toFixed(1)}`)
      .join(' ')} Z`

  const baseY = toY(100)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const v = minV + (1 - f) * (maxV - minV)
    return { y: toY(v), label: v.toFixed(0) }
  })

  const statRows: ReadonlyArray<readonly [string, string, string]> = [
    [
      L('中央値リターン', 'Median Return'),
      `${((stats.p50 / 100 - 1) * 100).toFixed(1)}%`,
      stats.p50 >= 100 ? '#00e49a' : '#ff5c5c',
    ],
    [L('最良 95%ile', 'Best 95%ile'), `${((stats.p95 / 100 - 1) * 100).toFixed(1)}%`, '#00e49a'],
    [
      L('最悪 5%ile', 'Worst 5%ile'),
      `${((stats.p5 / 100 - 1) * 100).toFixed(1)}%`,
      stats.p5 < 100 ? '#ff5c5c' : '#f5a623',
    ],
    [
      L('損失確率', 'Loss Prob.'),
      `${stats.lossProb.toFixed(1)}%`,
      stats.lossProb > 30 ? '#ff5c5c' : '#f5a623',
    ],
  ]

  const legend: ReadonlyArray<readonly [string, number, string]> = [
    ['rgba(0,228,154,0.1)', 10, L('90% CI', '90% CI')],
    ['rgba(0,228,154,0.22)', 10, L('50% CI', '50% CI')],
    ['#00e49a', 2, L('中央値', 'Median')],
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', paddingLeft: P.l }}>
        {statRows.map(([lbl, val, c], i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: 'var(--text3)',
                letterSpacing: '0.08em',
              }}
            >
              {lbl}
            </span>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 20,
                fontWeight: 700,
                color: c,
                letterSpacing: '-0.03em',
              }}
            >
              {val}
            </span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, alignItems: 'center' }}>
          {legend.map(([c, h, l], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 20, height: h, background: c, borderRadius: 2 }} />
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)' }}>
                {l}
              </span>
            </div>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
        <defs>
          <clipPath id="mcClip">
            <rect x={P.l} y={P.t} width={pW} height={pH} />
          </clipPath>
        </defs>

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

        {baseY >= P.t && baseY <= P.t + pH && (
          <line
            x1={P.l}
            y1={baseY}
            x2={P.l + pW}
            y2={baseY}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="1"
            strokeDasharray="5,4"
            clipPath="url(#mcClip)"
          />
        )}

        <path
          d={makeBand(pCurves[95] ?? [], pCurves[5] ?? [])}
          fill="rgba(0,228,154,0.07)"
          clipPath="url(#mcClip)"
        />
        <path
          d={makeBand(pCurves[75] ?? [], pCurves[25] ?? [])}
          fill="rgba(0,228,154,0.15)"
          clipPath="url(#mcClip)"
        />

        <path
          d={makePath(pCurves[95] ?? [])}
          fill="none"
          stroke="rgba(0,228,154,0.28)"
          strokeWidth="1"
          clipPath="url(#mcClip)"
        />
        <path
          d={makePath(pCurves[75] ?? [])}
          fill="none"
          stroke="rgba(0,228,154,0.42)"
          strokeWidth="1"
          clipPath="url(#mcClip)"
        />
        <path
          d={makePath(pCurves[50] ?? [])}
          fill="none"
          stroke="#00e49a"
          strokeWidth="2.5"
          clipPath="url(#mcClip)"
        />
        <path
          d={makePath(pCurves[25] ?? [])}
          fill="none"
          stroke="rgba(0,228,154,0.42)"
          strokeWidth="1"
          clipPath="url(#mcClip)"
        />
        <path
          d={makePath(pCurves[5] ?? [])}
          fill="none"
          stroke="rgba(0,228,154,0.28)"
          strokeWidth="1"
          clipPath="url(#mcClip)"
        />

        {(
          [
            [pCurves[95] ?? [], '95%'],
            [pCurves[50] ?? [], '50%'],
            [pCurves[5] ?? [], '5%'],
          ] as const
        ).map(([pts, lbl], i) => {
          const last = pts[pts.length - 1]
          if (!last) return null
          return (
            <text
              key={i}
              x={toX(last.xi) + 5}
              y={toY(last.v) + 4}
              fill="var(--text2)"
              fontSize="11"
              fontFamily="var(--mono)"
            >
              {lbl}
            </text>
          )
        })}

        {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
          <text
            key={i}
            x={P.l + f * pW}
            y={H - 4}
            textAnchor="middle"
            fill="var(--text3)"
            fontSize="11"
            fontFamily="var(--mono)"
          >
            {Math.round(f * n)}
          </text>
        ))}
      </svg>

      <div
        style={{
          paddingLeft: P.l,
          fontFamily: 'var(--mono)',
          fontSize: 11,
          color: 'var(--text3)',
        }}
      >
        {N_SIM}
        {L(
          'シミュレーション · トレードをランダムリサンプリング（シード固定）',
          ' simulations · random resampling of trades (fixed seed)'
        )}
      </div>
    </div>
  )
}
