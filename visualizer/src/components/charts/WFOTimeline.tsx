import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import type { WFOWindow } from '../../api/types'

interface WFOTimelineProps {
  windows: WFOWindow[]
  lang: Lang
}

interface Tick {
  left: string
  label: string
}

export function WFOTimeline({ windows, lang }: WFOTimelineProps) {
  const L = makeL(lang)
  const tStart = new Date('2020-01-01')
  const tEnd = new Date('2023-07-01')
  const totalMs = tEnd.getTime() - tStart.getTime()

  const pct = (d: string) =>
    ((new Date(`${d}-01`).getTime() - tStart.getTime()) / totalMs) * 100 + '%'

  const wPct = (s: string, e: string) => {
    const eDate = new Date(`${e}-01`)
    eDate.setMonth(eDate.getMonth() + 1)
    return ((eDate.getTime() - new Date(`${s}-01`).getTime()) / totalMs) * 100 + '%'
  }

  const ticks: Tick[] = []
  const td = new Date('2020-01-01')
  while (td < tEnd) {
    if (td.getMonth() % 6 === 0) {
      ticks.push({
        left: pct(td.toISOString().slice(0, 7)),
        label: `${td.getFullYear()}-${String(td.getMonth() + 1).padStart(2, '0')}`,
      })
    }
    td.setMonth(td.getMonth() + 1)
  }

  const passN = windows.filter((w) => w.pass).length
  const ratioSum = windows.reduce((s, w) => s + w.oos_is_ratio, 0)
  const isSum = windows.reduce((s, w) => s + w.is_sharpe, 0)
  const oosSum = windows.reduce((s, w) => s + w.oos_sharpe, 0)
  const avgRatio = (ratioSum / windows.length).toFixed(2)
  const avgIS = (isSum / windows.length).toFixed(2)
  const avgOOS = (oosSum / windows.length).toFixed(2)

  const passRateColor = passN / windows.length >= 0.7 ? '#00e49a' : '#f5a623'
  const ratioNum = parseFloat(avgRatio)
  const ratioColor = ratioNum >= 0.7 ? '#00e49a' : ratioNum < 0 ? '#ff5c5c' : '#f5a623'
  const oosColor = parseFloat(avgOOS) > 0 ? '#00e49a' : '#ff5c5c'

  const summaryItems: ReadonlyArray<readonly [string, string, string]> = [
    [L('パス率', 'Pass Rate'), `${passN}/${windows.length}`, passRateColor],
    [L('平均OOS/IS比', 'Avg OOS/IS'), avgRatio, ratioColor],
    [L('IS 平均Sharpe', 'Avg IS Sharpe'), avgIS, 'var(--text)'],
    [L('OOS 平均Sharpe', 'Avg OOS Sharpe'), avgOOS, oosColor],
  ]

  const maxIs = Math.max(...windows.map((w) => w.is_sharpe)) * 1.1 || 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
        {summaryItems.map(([lbl, val, col], i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: 'var(--text3)',
                letterSpacing: '0.09em',
                textTransform: 'uppercase',
              }}
            >
              {lbl}
            </span>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 22,
                fontWeight: 700,
                color: col,
                letterSpacing: '-0.03em',
              }}
            >
              {val}
            </span>
          </div>
        ))}
      </div>

      <div style={{ position: 'relative', paddingLeft: 40 }}>
        {ticks.map((t, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `calc(40px + ${t.left})`,
              top: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <div style={{ width: 1, height: 8, background: 'rgba(255,255,255,0.08)' }} />
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: 'var(--text3)',
                whiteSpace: 'nowrap',
                marginTop: 2,
              }}
            >
              {t.label}
            </span>
          </div>
        ))}
        <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {windows.map((w) => (
            <div key={w.id} style={{ position: 'relative', height: 34 }}>
              <span
                style={{
                  position: 'absolute',
                  left: -34,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontFamily: 'var(--mono)',
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--text2)',
                }}
              >
                {w.label}
              </span>
              <div
                title={`IS ${w.is_start}→${w.is_end}  Sharpe: ${w.is_sharpe}`}
                style={{
                  position: 'absolute',
                  left: pct(w.is_start),
                  width: wPct(w.is_start, w.is_end),
                  height: '100%',
                  background: 'rgba(0,228,154,0.1)',
                  border: '1px solid rgba(0,228,154,0.22)',
                  borderRadius: 5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  cursor: 'default',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    color: 'rgba(0,228,154,0.7)',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                  }}
                >
                  IS {w.is_sharpe.toFixed(2)}
                </span>
              </div>
              <div
                title={`OOS ${w.oos_start}→${w.oos_end}  Sharpe: ${w.oos_sharpe}`}
                style={{
                  position: 'absolute',
                  left: pct(w.oos_start),
                  width: wPct(w.oos_start, w.oos_end),
                  height: '100%',
                  background: w.pass ? 'rgba(0,228,154,0.2)' : 'rgba(255,92,92,0.18)',
                  border: w.pass ? '1px solid rgba(0,228,154,0.45)' : '1px solid rgba(255,92,92,0.4)',
                  borderRadius: 5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  cursor: 'default',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    color: w.pass ? '#00e49a' : '#ff5c5c',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}
                >
                  OOS {w.oos_sharpe.toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4 }}>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--text3)',
            letterSpacing: '0.09em',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          {L('IS vs OOS シャープレシオ', 'IS vs OOS Sharpe Ratio')}
        </span>
        {windows.map((w) => {
          const isW = (Math.max(w.is_sharpe, 0) / maxIs) * 65
          const oosW = (Math.min(Math.abs(w.oos_sharpe), maxIs) / maxIs) * 65
          return (
            <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--text2)',
                  width: 26,
                  flexShrink: 0,
                }}
              >
                {w.label}
              </span>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div
                    style={{
                      width: `${isW}%`,
                      height: 5,
                      background: 'rgba(0,228,154,0.3)',
                      borderRadius: 3,
                    }}
                  />
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
                    IS {w.is_sharpe.toFixed(2)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div
                    style={{
                      width: `${oosW}%`,
                      height: 5,
                      background: w.pass ? 'rgba(0,228,154,0.65)' : 'rgba(255,92,92,0.5)',
                      borderRadius: 3,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 11,
                      color: w.pass ? '#00e49a' : '#ff5c5c',
                      fontWeight: 600,
                    }}
                  >
                    OOS {w.oos_sharpe.toFixed(2)}
                  </span>
                  <span style={{ fontSize: 11, color: w.pass ? '#00e49a' : '#ff5c5c' }}>
                    {w.pass ? '✓' : '✗'}
                  </span>
                </div>
              </div>
              <div style={{ width: 70, textAlign: 'right', flexShrink: 0 }}>
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    color: w.oos_is_ratio > 0 ? 'var(--text3)' : '#ff5c5c',
                  }}
                >
                  ratio {w.oos_is_ratio.toFixed(3)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
