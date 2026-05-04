import { useState } from 'react'
import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import type { Variation } from '../hooks/useTheme'
import type { WFOResult } from '../api/types'
import { Pill, SecHead, SectionLabel } from '../components/common'
import { EquityChart } from '../components/charts/EquityChart'
import { WFOTimeline } from '../components/charts/WFOTimeline'

interface Props {
  data: WFOResult
  compact: boolean
  lang: Lang
  variation: Variation
}

type Tab = 'timeline' | 'equity'

export function WFOScreen({ data, compact, lang, variation }: Props) {
  const [tab, setTab] = useState<Tab>('timeline')
  const L = makeL(lang)
  const tabs: ReadonlyArray<readonly [Tab, string]> = [
    ['timeline', L('タイムライン', 'Timeline')],
    ['equity', L('OOS合成曲線', 'OOS Composite')],
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <SecHead
        title={L('ウォークフォーワード検証', 'Walk-Forward Optimization')}
        subtitle={L(
          '5ウィンドウ · IS 12ヶ月 / OOS 6ヶ月 · ローリング',
          '5 Windows · IS 12M / OOS 6M · Rolling'
        )}
      />
      <div
        style={{
          display: 'flex',
          gap: 0,
          borderBottom: '1px solid var(--border)',
          marginBottom: 20,
        }}
      >
        {tabs.map(([id, label]) => (
          <Pill key={id} active={tab === id} onClick={() => setTab(id)}>
            {label}
          </Pill>
        ))}
      </div>
      {tab === 'timeline' && <WFOTimeline windows={data.windows} lang={lang} />}
      {tab === 'equity' && (
        <div>
          <SectionLabel>
            {L(
              'OOS合成エクイティカーブ（全ウィンドウの実績を結合）',
              'OOS Composite Equity (stitched OOS windows)'
            )}
          </SectionLabel>
          <EquityChart
            equity={data.composite_equity}
            dates={data.composite_dates}
            isCutoffIdx={-1}
            compact={compact}
            variation={variation}
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
                  border: `1px solid ${w.pass ? 'rgba(0,228,154,0.2)' : 'rgba(255,92,92,0.2)'}`,
                  borderRadius: 6,
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    color: w.pass ? '#00e49a' : '#ff5c5c',
                    fontWeight: 700,
                  }}
                >
                  {w.label} {w.pass ? '✓' : '✗'}
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
                  OOS {w.oos_start}→{w.oos_end}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 12,
                    fontWeight: 700,
                    color: w.oos_return >= 0 ? '#00e49a' : '#ff5c5c',
                  }}
                >
                  {w.oos_return >= 0 ? '+' : ''}
                  {w.oos_return.toFixed(1)}%
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)' }}>
                  Sharpe {w.oos_sharpe.toFixed(2)}
                </span>
                <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {Object.entries(w.params).map(([k, v]) => (
                    <span
                      key={k}
                      style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}
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
