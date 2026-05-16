import { useState, type ReactNode } from 'react'

import { StrategySignalChartTV } from '../../charts/tv/StrategySignalChartTV'
import { resolveLightweightChartsFlag } from '../../constants/featureFlags'
import { Card, SectionHeader } from '../../design/primitives'
import { useStrategyHistorical } from '../../hooks/useStrategyHistorical'
import type { RegimeSeries, Trade } from '../../api/types'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'

export interface SignalChartCardProps {
  symbol: string | null
  trades: Trade[]
  /** BacktestDetail.regime_series（未提供なら regime markers は描画しない） */
  regimeSeries?: RegimeSeries | null
  lang: Lang
}

/**
 * StrategyScreen の「シグナル時系列」セクション。
 *
 * 責務:
 * - feature flag `?tv=1` の gating（OFF 時は実験機能 placeholder）
 * - `useStrategyHistorical(symbol)` の loading / no_data / error / ready 分岐
 * - 空 trades のときも chart は表示し caption で「シグナルなし」と伝える
 *
 * StrategySignalChartTV 本体は純粋表示なので、本コンポーネントが上記の
 * UI 状態管理を担当することで関心の分離を保つ。
 */
export function SignalChartCard({ symbol, trades, regimeSeries, lang }: SignalChartCardProps) {
  const L = makeL(lang)
  // mount 時に 1 回だけ評価。?tv=1 で URL を切り替えた場合はリロード前提（既存 BacktestScreen と同等）。
  const [flagOn] = useState(() => resolveLightweightChartsFlag())

  if (!flagOn) {
    return (
      <CardShell title={L('シグナル時系列', 'Signal Chart')}>
        <Hint>
          {L(
            'シグナル時系列は実験機能です（?tv=1 で有効化）',
            'Signal chart is experimental (enable with ?tv=1)',
          )}
        </Hint>
      </CardShell>
    )
  }

  const caption = symbol
    ? `${symbol} — 1d (β)${regimeSeries ? L('  •  regime 表示中', '  •  regime on') : ''}`
    : undefined

  return (
    <CardShell title={L('シグナル時系列', 'Signal Chart')} caption={caption}>
      <SignalChartBody symbol={symbol} trades={trades} regimeSeries={regimeSeries} lang={lang} />
    </CardShell>
  )
}

function SignalChartBody({ symbol, trades, regimeSeries, lang }: SignalChartCardProps) {
  const L = makeL(lang)
  const state = useStrategyHistorical(symbol, '1d')

  if (symbol == null || state.status === 'loading') {
    return <Hint>{L('読み込み中…', 'Loading...')}</Hint>
  }
  if (state.status === 'no_data') {
    return (
      <Hint>
        {L(
          `${symbol ?? ''} の OHLC データが見つかりません`,
          `OHLC data not found for ${symbol ?? ''}`,
        )}
      </Hint>
    )
  }
  if (state.status === 'error') {
    return <Hint tone="danger">{L(`エラー: ${state.error}`, `Error: ${state.error}`)}</Hint>
  }

  // ready
  return (
    <>
      <StrategySignalChartTV
        bars={state.data.bars}
        trades={trades}
        regimeSeries={regimeSeries}
        showRegime={regimeSeries != null}
      />
      {trades.length === 0 && (
        <Hint>{L('シグナルなし', 'No signals')}</Hint>
      )}
    </>
  )
}

function CardShell({
  title,
  caption,
  children,
}: {
  title: string
  caption?: string
  children: ReactNode
}) {
  return (
    <Card>
      <SectionHeader title={title} small />
      {caption && (
        <div
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
            color: 'var(--text3)',
            marginTop: 'calc(-1 * var(--space-2))',
            marginBottom: 'var(--space-3)',
          }}
        >
          {caption}
        </div>
      )}
      {children}
    </Card>
  )
}

function Hint({
  children,
  tone = 'muted',
}: {
  children: ReactNode
  tone?: 'muted' | 'danger'
}) {
  return (
    <div
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 'var(--fs-mono-sm)',
        color: tone === 'danger' ? 'var(--danger)' : 'var(--text3)',
        padding: 'var(--space-4) 0',
      }}
    >
      {children}
    </div>
  )
}
