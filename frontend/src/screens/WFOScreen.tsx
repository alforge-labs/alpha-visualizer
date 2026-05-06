import { useState } from 'react'
import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import type { WFOResult } from '../api/types'
import { SectionHeader, SectionLabel, Tab, TabBar } from '../design/primitives'
import { EquityChartV } from '../charts/visx/EquityChartV'
import { WFOTimeline } from '../components/charts/WFOTimeline'

interface Props {
  data: WFOResult
  compact: boolean
  lang: Lang
}

type Tab = 'timeline' | 'equity'

export function WFOScreen({ data, compact, lang }: Props) {
  const [tab, setTab] = useState<Tab>('timeline')
  const L = makeL(lang)
  const tabs: ReadonlyArray<readonly [Tab, string]> = [
    ['timeline', L('タイムライン', 'Timeline')],
    ['equity', L('OOS合成曲線', 'OOS Composite')],
  ]
  return (
    <div data-testid="wfo-screen" style={{ display: 'flex', flexDirection: 'column' }}>
      <SectionHeader
        title={L('ウォークフォーワード検証', 'Walk-Forward Optimization')}
        subtitle={L(
          '5ウィンドウ · IS 12ヶ月 / OOS 6ヶ月 · ローリング',
          '5 Windows · IS 12M / OOS 6M · Rolling'
        )}
      />
      <TabBar>
        {tabs.map(([id, label]) => (
          <Tab key={id} active={tab === id} onClick={() => setTab(id)} small>
            {label}
          </Tab>
        ))}
      </TabBar>
      {tab === 'timeline' && <WFOTimeline windows={data.windows} lang={lang} />}
      {tab === 'equity' && (
        <div>
          <SectionLabel>
            {L(
              'OOS合成エクイティカーブ（全ウィンドウの実績を結合）',
              'OOS Composite Equity (stitched OOS windows)'
            )}
          </SectionLabel>
          <EquityChartV
            equity={data.composite_equity}
            dates={data.composite_dates}
            isCutoffIdx={-1}
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
                  Sharpe {w.oos_sharpe.toFixed(2)}
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
