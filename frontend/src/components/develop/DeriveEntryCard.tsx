import { Link } from 'react-router'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'

const CARD_STYLE: React.CSSProperties = {
  padding: 'var(--space-4)',
  marginTop: 'var(--space-4)',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
}

const LABEL_STYLE: React.CSSProperties = {
  fontFamily: 'var(--sans)',
  fontSize: 'var(--fs-caption)',
  fontWeight: 500,
  color: 'var(--text3)',
  letterSpacing: 'var(--tracking-caption)',
  textTransform: 'uppercase',
}

interface Props {
  strategyId: string
  lang: Lang
}

/**
 * AI 派生開発への導線カード（issue #491）。
 *
 * 「もう少しトレード頻度を下げたい」のような改善を、戦略 JSON を直接
 * 触らずに AI への指示で実現する。入力・実行 UI は /develop に集約されて
 * いる（?base=<id> で派生モードになる）ため、ここは導線のみ。
 */
export function DeriveEntryCard({ strategyId, lang }: Props) {
  const L = makeL(lang)
  return (
    <section style={CARD_STYLE} aria-label={L('AI で改善', 'Improve with AI')}>
      <p style={{ ...LABEL_STYLE, margin: 0 }}>{L('AI で改善', 'Improve with AI')}</p>
      <p
        style={{
          margin: 'var(--space-2) 0',
          fontFamily: 'var(--sans)',
          fontSize: 'var(--fs-caption)',
          color: 'var(--text3)',
        }}
      >
        {L(
          '改善指示（例: トレード頻度を下げて、損切りを浅くして）を AI に伝えて、この戦略の派生版を作ります。元の戦略は変更されません。',
          'Tell the AI how to improve this strategy (e.g. trade less often, use tighter stops) and it will create a derived version. The original strategy is not modified.',
        )}
      </p>
      <Link
        to={`/develop?base=${encodeURIComponent(strategyId)}`}
        style={{
          fontFamily: 'var(--sans)',
          fontSize: 'var(--fs-caption)',
          color: 'var(--accent)',
        }}
      >
        {L('AI で改善する →', 'Improve with AI →')}
      </Link>
    </section>
  )
}
