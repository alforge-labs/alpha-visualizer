import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import type { Variation } from '../../hooks/useTheme'
import type { BacktestMetrics } from '../../api/types'

interface Props {
  metrics: BacktestMetrics
  lang: Lang
  variation: Variation
}

export function SignalQualityBadge({ metrics, lang, variation }: Props) {
  const sv = metrics.statistical_validity
  const ds = metrics.deflated_sharpe
  if (!sv) return null
  const L = makeL(lang)
  const score = sv.signal_quality_score
  const psr = ds?.probabilistic_sr
  const dsr = ds?.deflated_sr
  const scoreColor = score >= 0.7 ? '#00e49a' : score >= 0.4 ? '#f5a623' : '#ff5c5c'

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: variation === 'clarity' ? 10 : 7,
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--text3)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          {L('シグナル品質スコア', 'Signal Quality Score')}
        </span>
        <span
          style={{
            background: sv.is_valid ? 'var(--accent-bg)' : 'rgba(245,166,35,0.1)',
            border: `1px solid ${sv.is_valid ? 'var(--accent-glow)' : 'rgba(245,166,35,0.3)'}`,
            borderRadius: 4,
            padding: '2px 8px',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            fontWeight: 700,
            color: sv.is_valid ? '#00e49a' : '#f5a623',
          }}
        >
          {sv.is_valid ? L('有効', 'VALID') : L('要注意', 'WARN')}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--text2)' }}>
            {L('品質スコア', 'Quality Score')}
          </span>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 13,
              fontWeight: 700,
              color: scoreColor,
            }}
          >
            {(score * 100).toFixed(0)}/100
          </span>
        </div>
        <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
          <div
            style={{
              height: '100%',
              width: `${score * 100}%`,
              background: scoreColor,
              borderRadius: 3,
              transition: 'width 0.6s',
            }}
          />
        </div>
      </div>
      {psr !== undefined && dsr !== undefined && ds && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {(
            [
              [L('PSR', 'PSR'), `${(psr * 100).toFixed(1)}%`, psr >= 0.9 ? '#00e49a' : '#f5a623'],
              [
                L('DSR（補正済）', 'DSR (deflated)'),
                `${(dsr * 100).toFixed(1)}%`,
                dsr >= 0.9 ? '#00e49a' : '#f5a623',
              ],
              [L('試行数', 'N trials'), String(ds.n_trials), 'var(--text2)'],
            ] as const
          ).map(([lbl, val, c], i) => (
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
                  fontSize: 16,
                  fontWeight: 700,
                  color: c,
                }}
              >
                {val}
              </span>
            </div>
          ))}
        </div>
      )}
      {sv.warning && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '8px 10px',
            background: 'rgba(245,166,35,0.07)',
            border: '1px solid rgba(245,166,35,0.2)',
            borderRadius: 5,
          }}
        >
          <span style={{ color: '#f5a623', flexShrink: 0 }}>⚠</span>
          <span style={{ fontFamily: 'var(--sans)', fontSize: 11, color: '#f5a623', lineHeight: 1.5 }}>
            {sv.warning}
          </span>
        </div>
      )}
    </div>
  )
}
