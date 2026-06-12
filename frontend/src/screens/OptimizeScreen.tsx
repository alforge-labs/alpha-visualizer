import { useMemo, useState } from 'react'
import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import type { OptimizeResult, OptimizeTrial } from '../api/types'
import { SectionHeader, SectionLabel, Tab, TabBar } from '../design/primitives'
import { OptimizeScatter } from '../components/charts/OptimizeScatter'
import { OptimizeHeatmap } from '../components/charts/OptimizeHeatmap'
import { metricOptions, numericParamNames } from '../lib/optimizeHeatmap'
import { fmtNumber } from '../lib/format'

interface Props {
  data: OptimizeResult
  compact: boolean
  lang: Lang
}

function topTrials(trials: OptimizeTrial[], n: number): OptimizeTrial[] {
  return [...trials].sort((a, b) => b.metric - a.metric).slice(0, n)
}

type ChartView = 'scatter' | 'heatmap'

export function OptimizeScreen({ data, compact, lang }: Props) {
  const L = makeL(lang)
  const paramNames = data.trials.length > 0 ? Object.keys(data.trials[0]!.params) : []
  const [xParam, setXParam] = useState<string>(paramNames[0] ?? '')
  const [view, setView] = useState<ChartView>('scatter')

  // ヒートマップ用の選択状態。null = 未選択（先頭の有効値にフォールバック）
  const [heatXState, setHeatXState] = useState<string | null>(null)
  const [heatYState, setHeatYState] = useState<string | null>(null)
  const [heatMetricState, setHeatMetricState] = useState<string | null>(null)

  const numericParams = useMemo(() => numericParamNames(data.trials), [data.trials])
  const metricKeys = useMemo(
    () => metricOptions(data.metric_name, data.trials),
    [data.metric_name, data.trials],
  )
  const heatX =
    heatXState !== null && numericParams.includes(heatXState)
      ? heatXState
      : (numericParams[0] ?? '')
  const heatYOptions = numericParams.filter((p) => p !== heatX)
  const heatY =
    heatYState !== null && heatYOptions.includes(heatYState)
      ? heatYState
      : (heatYOptions[0] ?? '')
  const heatMetric =
    heatMetricState !== null && metricKeys.includes(heatMetricState)
      ? heatMetricState
      : data.metric_name

  const top10 = topTrials(data.trials, 10)
  const allParamKeys = paramNames
  const metricLabel = data.metric_name.replace(/_/g, ' ')
  const bestMetricLabel =
    data.best_metric !== null && Number.isFinite(data.best_metric)
      ? fmtNumber(data.best_metric, { decimals: 3 })
      : '—'

  return (
    <div data-testid="optimize-screen" style={{ display: 'flex', flexDirection: 'column' }}>
      <SectionHeader
        title={L('最適化トライアル分析', 'Optimization Trial Analysis')}
        subtitle={
          L('試行数', 'Trials') +
          `: ${data.trials.length} · ` +
          L('最良', 'Best') +
          ` ${metricLabel}: ${bestMetricLabel}`
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
          {/* チャートセクション（散布図 / ヒートマップ切替） */}
          <div style={{ marginTop: 'var(--space-4)' }}>
            <TabBar ariaLabel={L('チャート表示切替', 'Chart view')}>
              <Tab active={view === 'scatter'} onClick={() => setView('scatter')} small>
                {L('散布図', 'Scatter')}
              </Tab>
              <Tab active={view === 'heatmap'} onClick={() => setView('heatmap')} small>
                {L('ヒートマップ', 'Heatmap')}
              </Tab>
            </TabBar>

            {view === 'scatter' && (
              <div>
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
                    style={selectStyle}
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
            )}

            {view === 'heatmap' &&
              (numericParams.length < 2 ? (
                <div
                  style={{
                    padding: 'var(--space-5) 0',
                    fontFamily: 'var(--mono)',
                    fontSize: 'var(--fs-mono-sm)',
                    letterSpacing: 'var(--tracking-mono)',
                    color: 'var(--text3)',
                  }}
                >
                  {L(
                    `ヒートマップ表示には数値パラメータが 2 種類以上必要です（現在 ${numericParams.length} 種類）`,
                    `Heatmap view requires at least 2 numeric parameters (found ${numericParams.length})`,
                  )}
                </div>
              ) : (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      marginBottom: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <SectionLabel>
                      {L('パラメータヒートマップ', 'Parameter Heatmap')}
                    </SectionLabel>
                    <label style={selectLabelStyle}>
                      X
                      <select
                        aria-label={L('X軸パラメータ', 'X-axis parameter')}
                        value={heatX}
                        onChange={(e) => setHeatXState(e.target.value)}
                        style={selectStyle}
                      >
                        {numericParams.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={selectLabelStyle}>
                      Y
                      <select
                        aria-label={L('Y軸パラメータ', 'Y-axis parameter')}
                        value={heatY}
                        onChange={(e) => setHeatYState(e.target.value)}
                        style={selectStyle}
                      >
                        {heatYOptions.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={selectLabelStyle}>
                      {L('メトリクス', 'Metric')}
                      <select
                        aria-label={L('メトリクス', 'Metric')}
                        value={heatMetric}
                        onChange={(e) => setHeatMetricState(e.target.value)}
                        style={selectStyle}
                      >
                        {metricKeys.map((m) => (
                          <option key={m} value={m}>
                            {m.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <OptimizeHeatmap
                    trials={data.trials}
                    xParam={heatX}
                    yParam={heatY}
                    metricKey={heatMetric}
                    primaryMetricName={data.metric_name}
                    lang={lang}
                    compact={compact}
                  />
                </div>
              ))}
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
                        {fmtNumber(trial.metric, { decimals: 3 })}
                      </td>
                      {trial.metrics.total_return_pct !== undefined && (
                        <td
                          style={{
                            ...tdStyle,
                            color: trial.metrics.total_return_pct >= 0 ? 'var(--success)' : 'var(--danger)',
                          }}
                        >
                          {trial.metrics.total_return_pct >= 0 ? '+' : ''}
                          {fmtNumber(trial.metrics.total_return_pct, { decimals: 2 })}
                        </td>
                      )}
                      {trial.metrics.max_drawdown_pct !== undefined && (
                        <td style={{ ...tdStyle, color: 'var(--danger)' }}>
                          {fmtNumber(trial.metrics.max_drawdown_pct, { decimals: 2 })}
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

const selectStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 'var(--fs-mono-sm)',
  letterSpacing: 'var(--tracking-mono)',
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '4px 8px',
  cursor: 'pointer',
}

const selectLabelStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontFamily: 'var(--mono)',
  fontSize: 'var(--fs-mono-sm)',
  letterSpacing: 'var(--tracking-mono)',
  color: 'var(--text3)',
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
