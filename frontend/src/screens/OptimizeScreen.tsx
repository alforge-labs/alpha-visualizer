import { useState } from 'react'
import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import type { OptimizeResult, OptimizeTrial } from '../api/types'
import { SectionHeader, SectionLabel } from '../design/primitives'
import { OptimizeScatter } from '../components/charts/OptimizeScatter'

interface Props {
  data: OptimizeResult
  compact: boolean
  lang: Lang
}

function fmtNum(v: number | undefined, digits = 2): string {
  if (v === undefined) return '—'
  return v.toFixed(digits)
}

function topTrials(trials: OptimizeTrial[], n: number): OptimizeTrial[] {
  return [...trials].sort((a, b) => b.metric - a.metric).slice(0, n)
}

export function OptimizeScreen({ data, compact, lang }: Props) {
  const L = makeL(lang)
  const paramNames = data.trials.length > 0 ? Object.keys(data.trials[0]!.params) : []
  const [xParam, setXParam] = useState<string>(paramNames[0] ?? '')

  const top10 = topTrials(data.trials, 10)
  const allParamKeys = paramNames
  const metricLabel = data.metric_name.replace(/_/g, ' ')

  return (
    <div data-testid="optimize-screen" style={{ display: 'flex', flexDirection: 'column' }}>
      <SectionHeader
        title={L('最適化トライアル分析', 'Optimization Trial Analysis')}
        subtitle={
          L('試行数', 'Trials') +
          `: ${data.trials.length} · ` +
          L('最良', 'Best') +
          ` ${metricLabel}: ${data.best_metric.toFixed(3)}`
        }
      />

      {data.trials.length === 0 ? (
        <div
          style={{
            padding: 'var(--space-6) 0',
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
            letterSpacing: 'var(--tracking-mono)',
            color: 'var(--text3)',
          }}
        >
          {L('最適化トライアルデータがありません', 'No optimization trial data available')}
        </div>
      ) : (
        <>
          {/* 散布図セクション */}
          <div style={{ marginTop: 'var(--space-4)' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 12,
              }}
            >
              <SectionLabel>
                {L('パラメータ感度散布図', 'Parameter Sensitivity Scatter')}
              </SectionLabel>
              <select
                value={xParam}
                onChange={(e) => setXParam(e.target.value)}
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 'var(--fs-mono-sm)',
                  letterSpacing: 'var(--tracking-mono)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '4px 8px',
                  cursor: 'pointer',
                }}
              >
                {paramNames.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <OptimizeScatter
              trials={data.trials}
              xParam={xParam}
              metricName={data.metric_name}
              lang={lang}
              compact={compact}
            />
          </div>

          {/* 上位 10 試行テーブル */}
          <div style={{ marginTop: compact ? 'var(--space-5)' : 'var(--space-6)' }}>
            <SectionLabel>{L('上位 10 トライアル', 'Top 10 Trials')}</SectionLabel>
            <div style={{ overflowX: 'auto', marginTop: 8 }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontFamily: 'var(--mono)',
                  fontSize: 'var(--fs-mono-sm)',
                  letterSpacing: 'var(--tracking-mono)',
                }}
              >
                <thead>
                  <tr>
                    <th style={thStyle}>#</th>
                    {allParamKeys.map((k) => (
                      <th key={k} style={thStyle}>
                        {k}
                      </th>
                    ))}
                    <th style={{ ...thStyle, color: 'var(--accent)' }}>{metricLabel}</th>
                    {top10[0]?.metrics.total_return_pct !== undefined && (
                      <th style={thStyle}>{L('リターン', 'Return')} %</th>
                    )}
                    {top10[0]?.metrics.max_drawdown_pct !== undefined && (
                      <th style={thStyle}>DD %</th>
                    )}
                    <th style={thStyle}>{L('合否', 'Pass')}</th>
                  </tr>
                </thead>
                <tbody>
                  {top10.map((trial, i) => (
                    <tr
                      key={i}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: i % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--surface) 40%, transparent)',
                      }}
                    >
                      <td style={tdStyle}>{i + 1}</td>
                      {allParamKeys.map((k) => (
                        <td key={k} style={tdStyle}>
                          {trial.params[k] ?? '—'}
                        </td>
                      ))}
                      <td
                        style={{
                          ...tdStyle,
                          fontWeight: 600,
                          color: trial.metric > 0 ? 'var(--success)' : 'var(--danger)',
                        }}
                      >
                        {fmtNum(trial.metric, 3)}
                      </td>
                      {trial.metrics.total_return_pct !== undefined && (
                        <td
                          style={{
                            ...tdStyle,
                            color: trial.metrics.total_return_pct >= 0 ? 'var(--success)' : 'var(--danger)',
                          }}
                        >
                          {trial.metrics.total_return_pct >= 0 ? '+' : ''}
                          {fmtNum(trial.metrics.total_return_pct)}
                        </td>
                      )}
                      {trial.metrics.max_drawdown_pct !== undefined && (
                        <td style={{ ...tdStyle, color: 'var(--danger)' }}>
                          {fmtNum(trial.metrics.max_drawdown_pct)}
                        </td>
                      )}
                      <td style={tdStyle}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '1px 8px',
                            borderRadius: 4,
                            fontSize: '0.85em',
                            background: trial.pass
                              ? 'color-mix(in srgb, var(--success) 18%, transparent)'
                              : 'color-mix(in srgb, var(--danger) 15%, transparent)',
                            color: trial.pass ? 'var(--success)' : 'var(--danger)',
                          }}
                        >
                          {trial.pass ? L('合格', 'Pass') : L('不合格', 'Fail')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 適用ボタン（フェーズ 2 プレースホルダー） */}
          <div style={{ marginTop: 'var(--space-5)', display: 'flex', gap: 12 }}>
            <button
              disabled
              title={L(
                '最良パラメータを戦略に適用（フェーズ 2 で実装予定）',
                'Apply best params to strategy (Phase 2)',
              )}
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 'var(--fs-mono-sm)',
                letterSpacing: 'var(--tracking-mono)',
                padding: '6px 16px',
                border: '1px solid var(--border)',
                borderRadius: 6,
                background: 'var(--surface)',
                color: 'var(--text3)',
                cursor: 'not-allowed',
                opacity: 0.55,
              }}
            >
              {L('戦略に適用…', 'Apply to Strategy…')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 10px',
  color: 'var(--text3)',
  fontWeight: 500,
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '5px 10px',
  color: 'var(--text)',
  whiteSpace: 'nowrap',
}
