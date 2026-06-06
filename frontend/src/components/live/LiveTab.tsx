import { useEffect, useState } from 'react'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { ApiError, api } from '../../api/client'
import type { LiveDetailResponse, LiveTrade } from '../../api/types'
import { SectionLabel } from '../../design/primitives'
import { diffTone } from './format'
import { fmtDiff, fmtInteger, fmtNumber } from '../../lib/format'
import { LivePositionView } from './LivePositionView'
import { SummaryCard } from './SummaryCard'

interface Props {
  strategyId: string
  runId: string
  lang: Lang
}

export function LiveTab({ strategyId, runId, lang }: Props) {
  const L = makeL(lang)
  type State =
    | { status: 'loading' }
    | { status: 'ready'; data: LiveDetailResponse }
    | { status: 'no_data' }
    | { status: 'error'; message: string }
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    api
      .getLive(strategyId, runId)
      .then((res) => {
        if (!cancelled) setState({ status: 'ready', data: res })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        // 404 はライブ実績未記録を意味するため UI では「データなし」表示にする。
        if (e instanceof ApiError && e.status === 404) {
          setState({ status: 'no_data' })
          return
        }
        const message = e instanceof Error ? e.message : 'Unknown error'
        setState({ status: 'error', message })
      })
    return () => {
      cancelled = true
    }
  }, [strategyId, runId])

  if (state.status === 'loading') {
    return (
      <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
        {L('読み込み中…', 'Loading…')}
      </div>
    )
  }
  if (state.status === 'no_data') {
    return (
      <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
        {L(
          'この戦略にはライブ実績データがありません',
          'No live data for this strategy',
        )}
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div style={{ color: 'var(--danger)', fontFamily: 'var(--mono)' }}>
        {L('ライブデータの取得に失敗しました', 'Failed to load live data')}: {state.message}
      </div>
    )
  }

  const data = state.data

  // combine portfolio（position ベース、#221）は trade 単位の表示と
  // メトリクス体系が異なるため専用ビューに委譲する。
  if (data.live.summary.kind === 'position') {
    return (
      <LivePositionView
        summary={data.live.summary}
        warnings={data.warnings}
        lang={lang}
      />
    )
  }

  const summary = data.live.summary
  const aligned = data.backtest?.aligned ?? null
  const diff = data.diff
  const period = data.live.period

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <SectionLabel>{L('ライブ実績サマリー', 'Live Summary')}</SectionLabel>
        <PeriodLine
          livePeriod={period}
          backtestRunId={data.backtest?.run_id ?? null}
          warnings={data.warnings}
          lang={lang}
        />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            marginTop: 8,
          }}
        >
          <SummaryCard
            label={L('総取引数', 'Total Trades')}
            value={fmtInteger(summary.total_trades ?? null)}
            diff={fmtDiff(diff?.total_trades ?? null)}
            diffTone={diffTone(diff?.total_trades)}
            backtest={fmtInteger(aligned?.total_trades ?? null)}
            lang={lang}
          />
          <SummaryCard
            label={L('勝率', 'Win Rate')}
            value={fmtNumber(summary.win_rate_pct ?? null, { suffix: '%' })}
            diff={fmtDiff(diff?.win_rate_pct ?? null, '%')}
            diffTone={diffTone(diff?.win_rate_pct)}
            backtest={fmtNumber(aligned?.win_rate_pct ?? null, { suffix: '%' })}
            lang={lang}
          />
          <SummaryCard
            label={L('プロフィットファクター', 'Profit Factor')}
            value={fmtNumber(summary.profit_factor ?? null)}
            diff={fmtDiff(diff?.profit_factor ?? null)}
            diffTone={diffTone(diff?.profit_factor)}
            backtest={fmtNumber(aligned?.profit_factor ?? null)}
            lang={lang}
          />
          <SummaryCard
            label={L('最大DD', 'Max DD')}
            value={fmtNumber(summary.max_drawdown_pct ?? null, { suffix: '%' })}
            diff={fmtDiff(diff?.max_drawdown_pct ?? null, '%')}
            diffTone={diffTone(diff?.max_drawdown_pct)}
            backtest={fmtNumber(aligned?.max_drawdown_pct ?? null, { suffix: '%' })}
            lang={lang}
          />
          <SummaryCard
            label={L('純PnL', 'Net PnL')}
            value={fmtNumber(summary.net_pnl ?? null)}
            diff={fmtDiff(diff?.net_pnl ?? null)}
            diffTone={diffTone(diff?.net_pnl)}
            backtest={fmtNumber(aligned?.net_pnl ?? null)}
            lang={lang}
          />
        </div>
      </div>

      <div>
        <SectionLabel>{L('直近トレード一覧', 'Recent Trades')}</SectionLabel>
        <LiveTradesTable trades={data.live.trades} lang={lang} />
      </div>
    </div>
  )
}

interface PeriodLineProps {
  livePeriod: { start: string; end: string } | null
  backtestRunId: string | null
  warnings: string[]
  lang: Lang
}

function PeriodLine({ livePeriod, backtestRunId, warnings, lang }: PeriodLineProps) {
  const L = makeL(lang)
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 16,
        marginTop: 4,
        fontFamily: 'var(--mono)',
        fontSize: '0.78rem',
        color: 'var(--text3)',
      }}
    >
      <span>
        {L('Live期間', 'Live period')}:{' '}
        {livePeriod
          ? `${livePeriod.start} 〜 ${livePeriod.end}`
          : L('（trades なし）', '(no trades)')}
      </span>
      {backtestRunId ? (
        <span>
          {L('BT', 'BT')}: {backtestRunId}
        </span>
      ) : (
        <span>{L('対応 BT 無し', 'No BT match')}</span>
      )}
      {warnings.length > 0 && (
        <span style={{ color: 'var(--text2)' }}>
          ⚠ {warnings.join(' / ')}
        </span>
      )}
    </div>
  )
}

interface LiveTradesTableProps {
  trades: LiveTrade[]
  lang: Lang
}

function LiveTradesTable({ trades, lang }: LiveTradesTableProps) {
  const L = makeL(lang)
  if (trades.length === 0) {
    return (
      <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: '0.85rem' }}>
        {L('トレードがありません', 'No trades')}
      </div>
    )
  }

  const cellS: React.CSSProperties = {
    padding: '6px 8px',
    fontFamily: 'var(--mono)',
    fontSize: '0.78rem',
    borderBottom: '1px solid var(--border)',
  }
  const headS: React.CSSProperties = {
    ...cellS,
    color: 'var(--text3)',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 'var(--tracking-caption)',
    background: 'var(--surface)',
  }

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        overflowX: 'auto',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
        <thead>
          <tr>
            <th style={{ ...headS, textAlign: 'left' }}>{L('銘柄', 'Symbol')}</th>
            <th style={{ ...headS, textAlign: 'left' }}>{L('方向', 'Side')}</th>
            <th style={{ ...headS, textAlign: 'left' }}>{L('エントリー', 'Entry')}</th>
            <th style={{ ...headS, textAlign: 'left' }}>{L('イグジット', 'Exit')}</th>
            <th style={{ ...headS, textAlign: 'right' }}>{L('数量', 'Qty')}</th>
            <th style={{ ...headS, textAlign: 'right' }}>PnL</th>
            <th style={{ ...headS, textAlign: 'right' }}>{L('リターン', 'Return')}</th>
            <th style={{ ...headS, textAlign: 'left' }}>{L('理由', 'Reason')}</th>
          </tr>
        </thead>
        <tbody>
          {trades.slice(0, 50).map((t, i) => {
            const pnlColor =
              t.net_pnl > 0
                ? 'var(--success)'
                : t.net_pnl < 0
                  ? 'var(--danger)'
                  : 'var(--text)'
            return (
              <tr
                key={t.trade_id || i}
                style={{
                  background: i % 2 === 0 ? 'transparent' : 'rgba(127,127,127,0.04)',
                }}
              >
                <td style={cellS}>{t.symbol || '—'}</td>
                <td style={cellS}>{t.side}</td>
                <td style={cellS}>{t.entry_at}</td>
                <td style={cellS}>{t.exit_at}</td>
                <td style={{ ...cellS, textAlign: 'right' }}>
                  {fmtNumber(t.qty)}
                </td>
                <td style={{ ...cellS, textAlign: 'right', color: pnlColor }}>
                  {fmtNumber(t.net_pnl)}
                </td>
                <td style={{ ...cellS, textAlign: 'right' }}>
                  {t.return_pct == null ? '—' : fmtNumber(t.return_pct, { suffix: '%' })}
                </td>
                <td style={cellS}>{t.exit_reason ?? '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
