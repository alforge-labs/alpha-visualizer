import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { toneColor } from './format'
import type { DiffTone } from './format'

interface SummaryCardProps {
  label: string
  value: string
  diff: string
  diffTone: DiffTone
  backtest: string
  lang: Lang
  /** trade 単位は 'live-summary-card'（既定）、position は 'live-position-card' */
  testId?: string
}

/** Live サマリーの 1 メトリクスカード（live 値 + BT 値 + diff）。 */
export function SummaryCard({
  label,
  value,
  diff,
  diffTone,
  backtest,
  lang,
  testId = 'live-summary-card',
}: SummaryCardProps) {
  const L = makeL(lang)
  return (
    <div
      data-testid={testId}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--sans)',
          fontSize: 'var(--fs-caption)',
          color: 'var(--text3)',
          letterSpacing: 'var(--tracking-caption)',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: '1.4rem',
          fontWeight: 600,
          color: 'var(--text)',
        }}
      >
        {value}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: 'var(--mono)',
          fontSize: '0.78rem',
          color: 'var(--text3)',
        }}
      >
        <span>
          {L('BT', 'BT')}: {backtest}
        </span>
        <span data-testid="live-diff" style={{ color: toneColor(diffTone) }}>
          {diff}
        </span>
      </div>
    </div>
  )
}
