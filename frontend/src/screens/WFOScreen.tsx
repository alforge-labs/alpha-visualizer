import { useState } from 'react'
import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import type { WFOResult } from '../api/types'
import { SectionHeader, SectionLabel, Tab, TabBar } from '../design/primitives'
import { WFOEquityTV } from '../charts/tv/WFOEquityTV'
import { WFOTimeline } from '../components/charts/WFOTimeline'
import { metricShortLabel } from '../lib/metricLabel'

interface Props {
  data: WFOResult
  compact: boolean
  lang: Lang
}

type Tab = 'timeline' | 'equity'

/** 2 つの ISO 日付間の概算月数（不正・逆順・欠損は null）。 */
function monthsBetween(start: string, end: string): number | null {
  if (!start || !end) return null
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return null
  return Math.round((e - s) / 86_400_000 / 30.44)
}

export function WFOScreen({ data, compact, lang }: Props) {
  const [tab, setTab] = useState<Tab>('timeline')
  const L = makeL(lang)
  // issue #353: サブタイトルをハードコードせず実データから導出する。
  // 期間は先頭ウィンドウの日付から概算し、導出できない項目は表示しない
  // （「ローリング」等の実行設定は API に無いため出さない）。
  const firstWindow = data.windows[0]
  const isMonths = firstWindow ? monthsBetween(firstWindow.is_start, firstWindow.is_end) : null
  const oosMonths = firstWindow
    ? monthsBetween(firstWindow.oos_start, firstWindow.oos_end)
    : null
  const subtitleParts = [
    L(`${data.windows.length}ウィンドウ`, `${data.windows.length} Windows`),
    ...(isMonths != null && oosMonths != null
      ? [L(`IS ${isMonths}ヶ月 / OOS ${oosMonths}ヶ月`, `IS ${isMonths}M / OOS ${oosMonths}M`)]
      : []),
  ]
  // 非 sharpe 指標の WFT 結果は is_sharpe/oos_sharpe にその指標の値が入る
  // ため、ラベルを metric_name に合わせて切り替える（vis#303）
  const metricLabel = metricShortLabel(data.metric_name)
  const tabs: ReadonlyArray<readonly [Tab, string]> = [
    ['timeline', L('タイムライン', 'Timeline')],
    ['equity', L('OOS合成曲線', 'OOS Composite')],
  ]
  return (
    <div data-testid="wfo-screen" style={{ display: 'flex', flexDirection: 'column' }}>
      <SectionHeader
        title={L('ウォークフォワード検証', 'Walk-Forward Optimization')}
        subtitle={subtitleParts.join(' · ')}
      />
      <TabBar>
        {tabs.map(([id, label]) => (
          <Tab key={id} active={tab === id} onClick={() => setTab(id)} small>
            {label}
          </Tab>
        ))}
      </TabBar>
      {tab === 'timeline' && (
        <WFOTimeline windows={data.windows} lang={lang} metricLabel={metricLabel} />
      )}
      {tab === 'equity' && (
        <div>
          <SectionLabel>
            {L(
              'OOS合成エクイティカーブ（全ウィンドウの実績を結合）',
              'OOS Composite Equity (stitched OOS windows)'
            )}
          </SectionLabel>
          <WFOEquityTV
            lang={lang}
            composite_equity={data.composite_equity}
            composite_dates={data.composite_dates}
            windows={data.windows}
            compact={compact}
          />
          <div style={{ marginTop: 12, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {data.windows.map((w) => (
              <div
                key={w.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                  padding: '8px 12px',
                  background: 'var(--surface)',
                  border: `1px solid ${w.pass ? 'color-mix(in srgb, var(--success) 30%, transparent)' : 'color-mix(in srgb, var(--danger) 28%, transparent)'}`,
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 13,
                    color: w.pass ? 'var(--success)' : 'var(--danger)',
                    fontWeight: 700,
                  }}
                >
                  {w.label} {w.pass ? '✓' : '✗'}
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text3)' }}>
                  OOS {w.oos_start}→{w.oos_end}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 14,
                    fontWeight: 700,
                    color: w.oos_return >= 0 ? 'var(--success)' : 'var(--danger)',
                  }}
                >
                  {w.oos_return >= 0 ? '+' : ''}
                  {w.oos_return.toFixed(1)}%
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text2)' }}>
                  {metricLabel} {w.oos_sharpe.toFixed(2)}
                </span>
                <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {Object.entries(w.params).map(([k, v]) => (
                    <span
                      key={k}
                      style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text3)' }}
                    >
                      {k}: <span style={{ color: 'var(--text2)' }}>{v}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
