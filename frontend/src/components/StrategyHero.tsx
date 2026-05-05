import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import { Chip } from '../design/primitives/Chip'

interface StrategyHeroProps {
  strategyName: string
  symbol: string
  timeframe: string
  periodStart?: string
  periodEnd?: string
  isMock?: boolean
  lang: Lang
}

export function StrategyHero({
  strategyName,
  symbol,
  timeframe,
  periodStart,
  periodEnd,
  isMock = false,
  lang,
}: StrategyHeroProps) {
  const L = makeL(lang)
  const period =
    periodStart && periodEnd
      ? `${periodStart} → ${periodEnd}`
      : L('期間未設定', 'Period not available')

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        padding: 'var(--space-7) 0 var(--space-5)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
            color: 'var(--text3)',
            letterSpacing: 'var(--tracking-caption)',
            textTransform: 'uppercase',
          }}
        >
          {L('戦略', 'Strategy')}
        </span>
        {isMock && <Chip tone="warning">{L('サンプルデータ', 'Sample data')}</Chip>}
      </div>
      <h1
        style={{
          margin: 0,
          fontFamily: 'var(--serif)',
          fontSize: 'var(--fs-display)',
          fontWeight: 700,
          letterSpacing: 'var(--tracking-display)',
          lineHeight: 'var(--lh-tight)',
          color: 'var(--text)',
        }}
      >
        {strategyName || '—'}
      </h1>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-4)',
          flexWrap: 'wrap',
        }}
      >
        {symbol && (
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 'var(--fs-h3)',
              color: 'var(--text2)',
              fontWeight: 600,
            }}
          >
            {symbol}
          </span>
        )}
        {timeframe && (
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 'var(--fs-mono-sm)',
              color: 'var(--text3)',
              letterSpacing: 'var(--tracking-mono)',
              textTransform: 'uppercase',
            }}
          >
            {timeframe}
          </span>
        )}
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
            color: 'var(--text3)',
            letterSpacing: 'var(--tracking-mono)',
          }}
        >
          {period}
        </span>
      </div>
    </div>
  )
}
