import { useMemo, useState } from 'react'
import { useDashboard, RANGES } from '../../contexts/DashboardContext'
import { getRangeN } from '../../contexts/dashboardConstants'

export interface EquityDataset {
  label: string
  values: number[]
  dates: string[]
  color: string
}

interface Props {
  datasets: EquityDataset[]
  compact?: boolean
}

interface Tooltip { x: number; y: number; date: string; vals: { label: string; v: number; color: string }[] }

export function BenchmarkChart({ datasets, compact = false }: Props) {
  const { selectedRange, setSelectedRange } = useDashboard()
  const [tooltip, setTooltip] = useState<Tooltip | null>(null)

  const W = 800, H = compact ? 180 : 252
  const P = { l: 58, r: 20, t: 16, b: compact ? 24 : 32 }
  const pW = W - P.l - P.r
  const pH = H - P.t - P.b

  const sliced = useMemo(() => {
    if (datasets.length === 0) return []
    const n = datasets[0]?.values.length ?? 0
    const bars = Math.min(getRangeN(selectedRange), n)
    const s = Math.max(0, n - bars)
    return datasets.map(ds => {
      const vals = ds.values.slice(s)
      const base = vals[0] ?? 1
      return { ...ds, values: vals.map(v => (base === 0 ? 0 : (v / base) * 100)), dates: ds.dates.slice(s) }
    })
  }, [datasets, selectedRange])

  const allVals = sliced.flatMap(ds => ds.values).filter(Number.isFinite)
  const minV = Math.min(...allVals, 95)
  const maxV = Math.max(...allVals, 105)
  const span = maxV - minV || 1

  function toX(i: number, len: number) { return P.l + (i / Math.max(len - 1, 1)) * pW }
  function toY(v: number) { return P.t + pH - ((v - minV) / span) * pH }

  function makePath(vals: number[]) {
    return vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i, vals.length).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')
  }

  const dates = sliced[0]?.dates ?? []
  const len = sliced[0]?.values.length ?? 0

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginBottom: 6 }}>
        {RANGES.map(r => (
          <button key={r} onClick={() => setSelectedRange(r)} style={{
            height: 22, padding: '0 8px', borderRadius: 4, cursor: 'pointer',
            fontFamily: 'var(--mono)', fontSize: 11,
            background: selectedRange === r ? 'var(--accent-bg)' : 'var(--surface)',
            border: selectedRange === r ? '1px solid var(--accent-glow)' : '1px solid var(--border)',
            color: selectedRange === r ? 'var(--accent)' : 'var(--text2)',
          }}>{r}</button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}
        onMouseMove={e => {
          const rect = (e.currentTarget as SVGElement).getBoundingClientRect()
          const mx = (e.clientX - rect.left) * (W / rect.width)
          const i = Math.round(((mx - P.l) / pW) * Math.max(len - 1, 1))
          const ci = Math.max(0, Math.min(len - 1, i))
          setTooltip({
            x: toX(ci, len), y: P.t,
            date: dates[ci] ?? '',
            vals: sliced.map(ds => ({ label: ds.label, v: ds.values[ci] ?? 0, color: ds.color })),
          })
        }}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Y軸グリッド */}
        {[0, 0.25, 0.5, 0.75, 1].map(t => {
          const yv = minV + t * span
          const y = toY(yv)
          return (
            <g key={t}>
              <line x1={P.l} x2={P.l + pW} y1={y} y2={y} stroke="var(--border)" strokeWidth={0.5} />
              <text x={P.l - 4} y={y + 4} textAnchor="end" fontSize={9} fill="var(--text3)" fontFamily="var(--mono)">
                {yv.toFixed(0)}
              </text>
            </g>
          )
        })}
        {/* 100ライン */}
        <line x1={P.l} x2={P.l + pW} y1={toY(100)} y2={toY(100)} stroke="var(--text3)" strokeWidth={0.5} strokeDasharray="4,4" />
        {/* データ系列 */}
        {sliced.map(ds => (
          <path key={ds.label} d={makePath(ds.values)} fill="none" stroke={ds.color} strokeWidth={1.5} />
        ))}
        {/* ツールチップ縦線 */}
        {tooltip && <line x1={tooltip.x} x2={tooltip.x} y1={P.t} y2={P.t + pH} stroke="var(--text3)" strokeWidth={0.5} />}
        {/* X軸ラベル */}
        {len > 1 && [0, Math.floor(len / 2), len - 1].map(i => (
          <text key={i} x={toX(i, len)} y={H - 4} textAnchor="middle" fontSize={9} fill="var(--text3)" fontFamily="var(--mono)">
            {(dates[i] ?? '').slice(0, 7)}
          </text>
        ))}
      </svg>
      {/* 凡例 */}
      <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
        {sliced.map(ds => (
          <div key={ds.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 16, height: 2, background: ds.color }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)' }}>{ds.label}</span>
          </div>
        ))}
      </div>
      {/* ツールチップ */}
      {tooltip && (
        <div style={{
          position: 'absolute', background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 4, padding: '6px 10px', pointerEvents: 'none', fontSize: 11,
          fontFamily: 'var(--mono)', color: 'var(--text)',
        }}>
          <div style={{ color: 'var(--text3)', marginBottom: 4 }}>{tooltip.date}</div>
          {tooltip.vals.map(v => (
            <div key={v.label} style={{ color: v.color }}>{v.label}: {v.v.toFixed(2)}</div>
          ))}
        </div>
      )}
    </div>
  )
}
