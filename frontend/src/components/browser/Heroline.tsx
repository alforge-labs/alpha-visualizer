import { useMemo } from 'react'
import type { StrategyListItem } from '../../api/types'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { Stat } from '../../design/primitives/Stat'

interface Props {
  items: StrategyListItem[]
  lang: Lang
}

interface HeroMetrics {
  totalStrategies: number
  uniqueSymbols: number
  topSharpe: number | null
  recentRunsCount: number
}

const RECENT_DAYS = 7
const MS_PER_DAY = 24 * 60 * 60 * 1000

function computeMetrics(items: StrategyListItem[]): HeroMetrics {
  const symbolSet = new Set<string>()
  let topSharpe: number | null = null
  let recent = 0
  const cutoff = Date.now() - RECENT_DAYS * MS_PER_DAY

  for (const s of items) {
    if (s.symbol) symbolSet.add(s.symbol)
    if (s.latest_sharpe != null) {
      topSharpe = topSharpe == null ? s.latest_sharpe : Math.max(topSharpe, s.latest_sharpe)
    }
    if (s.last_run_at) {
      const ts = Date.parse(s.last_run_at)
      if (!Number.isNaN(ts) && ts >= cutoff) recent += 1
    }
  }

  return {
    totalStrategies: items.length,
    uniqueSymbols: symbolSet.size,
    topSharpe,
    recentRunsCount: recent,
  }
}

function fmtSharpe(v: number | null): string {
  return v == null ? '—' : v.toFixed(2)
}

function sharpeTone(v: number | null): 'positive' | 'warning' | 'negative' | 'neutral' {
  if (v == null) return 'neutral'
  if (v >= 1.5) return 'positive'
  if (v >= 1.0) return 'warning'
  return 'negative'
}

export function Heroline({ items, lang }: Props) {
  const L = makeL(lang)
  const m = useMemo(() => computeMetrics(items), [items])

  return (
    <div
      role="group"
      aria-label={L('全体メトリクス', 'Overview metrics')}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'var(--space-6)',
        marginTop: 'var(--space-5)',
        paddingTop: 'var(--space-5)',
        borderTop: '1px solid var(--border)',
      }}
    >
      <Stat
        size="lg"
        label={L('戦略数', 'Strategies')}
        value={m.totalStrategies > 0 ? String(m.totalStrategies) : '—'}
        sub={L('登録済み', 'registered')}
      />
      <Stat
        size="lg"
        label={L('銘柄数', 'Symbols')}
        value={m.uniqueSymbols > 0 ? String(m.uniqueSymbols) : '—'}
        sub={L('割当済', 'with assignments')}
      />
      <Stat
        size="lg"
        tone={sharpeTone(m.topSharpe)}
        label={L('最高 Sharpe', 'Top Sharpe')}
        value={fmtSharpe(m.topSharpe)}
        sub={L('最新バックテスト', 'latest backtests')}
      />
      <Stat
        size="lg"
        tone={m.recentRunsCount > 0 ? 'accent' : 'neutral'}
        label={L('直近実行', 'Recent runs')}
        value={m.recentRunsCount > 0 ? String(m.recentRunsCount) : '—'}
        sub={L(`${RECENT_DAYS}日以内`, `last ${RECENT_DAYS} days`)}
      />
    </div>
  )
}
