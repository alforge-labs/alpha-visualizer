import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import type { BacktestMetrics } from '../../api/types'

interface Props {
  metrics: BacktestMetrics
  lang: Lang
}

export function SignalQualityBadge({ metrics, lang }: Props) {
  const sv = metrics.statistical_validity
  const ds = metrics.deflated_sharpe
  if (!sv) return null
  const L = makeL(lang)
  const score = sv.signal_quality_score
  const psr = ds?.probabilistic_sr
  const dsr = ds?.deflated_sr
  const scoreColor =
    score >= 0.7 ? 'var(--success)' : score >= 0.4 ? 'var(--warn)' : 'var(--danger)'

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 'var(--fs-caption)',
            color: 'var(--text3)',
            letterSpacing: 'var(--tracking-caption)',
            textTransform: 'uppercase',
          }}
        >
          {L('シグナル品質スコア', 'Signal Quality Score')}
        </span>
        <span
          style={{
            background: sv.is_valid ? 'var(--accent-bg)' : 'color-mix(in srgb, var(--warn) 12%, transparent)',
            border: `1px solid ${sv.is_valid ? 'var(--accent-glow)' : 'color-mix(in srgb, var(--warn) 30%, transparent)'}`,
            borderRadius: 'var(--radius-sm)',
            padding: '2px 10px',
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
            fontWeight: 700,
            letterSpacing: 'var(--tracking-mono)',
            color: sv.is_valid ? 'var(--success)' : 'var(--warn)',
          }}
        >
          {sv.is_valid ? L('有効', 'VALID') : L('要注意', 'WARN')}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--sans)', fontSize: 14, color: 'var(--text2)' }}>
            {L('品質スコア', 'Quality Score')}
          </span>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 15,
              fontWeight: 700,
              color: scoreColor,
            }}
          >
            {(score * 100).toFixed(0)}/100
          </span>
        </div>
        <div style={{ height: 5, background: 'var(--bg2)', borderRadius: 3 }}>
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
              [L('PSR', 'PSR'), `${(psr * 100).toFixed(1)}%`, psr >= 0.9 ? 'var(--success)' : 'var(--warn)'],
              [
                L('DSR（補正済）', 'DSR (deflated)'),
                `${(dsr * 100).toFixed(1)}%`,
                dsr >= 0.9 ? 'var(--success)' : 'var(--warn)',
              ],
              [L('試行数', 'N trials'), String(ds.n_trials), 'var(--text2)'],
            ] as const
          ).map(([lbl, val, c], i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 'var(--fs-caption)',
                  color: 'var(--text3)',
                  letterSpacing: 'var(--tracking-caption)',
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
            background: 'color-mix(in srgb, var(--warn) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--warn) 24%, transparent)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <span style={{ color: 'var(--warn)', flexShrink: 0 }}>⚠</span>
          <span style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--warn)', lineHeight: 1.5 }}>
            {sv.warning}
          </span>
        </div>
      )}
    </div>
  )
}
