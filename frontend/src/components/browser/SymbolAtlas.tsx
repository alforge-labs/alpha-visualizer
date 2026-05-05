import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { StrategyListItem } from '../../api/types'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { useSymbolStats, type SymbolStat } from '../../hooks/useSymbolStats'
import {
  ASSET_CLASS_LABEL,
  ASSET_CLASS_ORDER,
  type AssetClass,
} from '../../lib/assetClass'
import { SymbolCard } from './SymbolCard'

interface Props {
  items: StrategyListItem[]
  lang: Lang
}

interface AssetSection {
  assetClass: AssetClass
  stats: SymbolStat[]
  totalStrategies: number
}

function groupByAssetClass(stats: SymbolStat[]): AssetSection[] {
  const buckets = new Map<AssetClass, SymbolStat[]>()
  for (const s of stats) {
    const arr = buckets.get(s.assetClass)
    if (arr) arr.push(s)
    else buckets.set(s.assetClass, [s])
  }
  const out: AssetSection[] = []
  for (const cls of ASSET_CLASS_ORDER) {
    const groupStats = buckets.get(cls)
    if (!groupStats || groupStats.length === 0) continue
    const totalStrategies = groupStats.reduce((acc, s) => acc + s.count, 0)
    out.push({ assetClass: cls, stats: groupStats, totalStrategies })
  }
  return out
}

export function SymbolAtlas({ items, lang }: Props) {
  const L = makeL(lang)
  const [searchParams, setSearchParams] = useSearchParams()
  const stats = useSymbolStats(items)
  const sections = useMemo(() => groupByAssetClass(stats), [stats])

  const symbolParam = searchParams.get('symbol') ?? ''
  const symbolFilter = symbolParam.split(',').filter(Boolean)

  const toggleSymbol = (symbol: string): void => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      const current = next.get('symbol')?.split(',').filter(Boolean) ?? []
      const updated = current.includes(symbol)
        ? current.filter(v => v !== symbol)
        : [...current, symbol]
      if (updated.length) next.set('symbol', updated.join(','))
      else next.delete('symbol')
      return next
    }, { replace: true })
  }

  if (sections.length === 0) return null

  const totalSymbols = stats.length
  const totalStrategies = items.length

  return (
    <section
      aria-label={L('銘柄アトラス', 'Symbol atlas')}
      style={{
        padding: 'var(--space-5) var(--space-7)',
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-5)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--serif)',
            fontSize: '1.25rem',
            fontWeight: 600,
            color: 'var(--text)',
            letterSpacing: '-0.005em',
          }}
        >
          {L('銘柄アトラス', 'Symbol Atlas')}
        </h2>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
            color: 'var(--text3)',
            letterSpacing: 'var(--tracking-mono)',
            textTransform: 'uppercase',
          }}
        >
          {L(
            `${totalSymbols}銘柄 · ${totalStrategies}戦略`,
            `${totalSymbols} symbols · ${totalStrategies} strategies`,
          )}
        </span>
      </div>

      {sections.map(section => {
        const label = ASSET_CLASS_LABEL[section.assetClass][lang]
        return (
          <div
            key={section.assetClass}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 'var(--space-3)',
                paddingBottom: 'var(--space-2)',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontFamily: 'var(--sans)',
                  fontSize: 'var(--fs-caption)',
                  fontWeight: 600,
                  color: 'var(--text2)',
                  letterSpacing: 'var(--tracking-caption)',
                  textTransform: 'uppercase',
                }}
              >
                {label}
              </h3>
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 'var(--fs-mono-sm)',
                  color: 'var(--text3)',
                  letterSpacing: 'var(--tracking-mono)',
                  textTransform: 'uppercase',
                }}
              >
                {L(
                  `${section.stats.length}銘柄 · ${section.totalStrategies}戦略`,
                  `${section.stats.length} symbols · ${section.totalStrategies} strategies`,
                )}
              </span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 'var(--space-3)',
              }}
            >
              {section.stats.map(stat => {
                const key = stat.symbol ?? '__unassigned__'
                const isSelected = stat.symbol != null && symbolFilter.includes(stat.symbol)
                const hasOtherSelected = symbolFilter.length > 0 && !isSelected
                return (
                  <SymbolCard
                    key={key}
                    stat={stat}
                    selected={isSelected}
                    disabled={hasOtherSelected}
                    onClick={toggleSymbol}
                    lang={lang}
                  />
                )
              })}
            </div>
          </div>
        )
      })}
    </section>
  )
}
