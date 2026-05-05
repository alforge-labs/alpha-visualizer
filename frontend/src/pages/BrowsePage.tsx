import { useState } from 'react'
import { useViewerSettings } from '../hooks/useTheme'
import { useStrategyList } from '../hooks/useStrategyList'
import { FilterBar } from '../components/browser/FilterBar'
import { StrategyTable } from '../components/browser/StrategyTable'
import { StrategySlidePanel } from '../components/browser/StrategySlidePanel'
import { CompareFloatingBar } from '../components/browser/CompareFloatingBar'
import { SettingsToggles } from '../components/SettingsToggles'
import { makeL } from '../i18n/strings'

export function BrowsePage(): React.ReactElement {
  const { settings, update } = useViewerSettings()
  const { lang, variation } = settings
  const L = makeL(lang)
  const list = useStrategyList()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [compareIds, setCompareIds] = useState<string[]>([])

  const selectedStrategy = list.all.find(s => s.strategy_id === selectedId) ?? null

  const handleSelect = (id: string): void => {
    setSelectedId(prev => (prev === id ? null : id))
  }

  const handleToggleCompare = (id: string): void => {
    setCompareIds(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : prev.length < 6
          ? [...prev, id]
          : prev,
    )
  }

  const handleRemoveCompare = (id: string): void => {
    setCompareIds(prev => prev.filter(x => x !== id))
  }

  if (list.error) {
    return (
      <div
        style={{
          padding: 'var(--space-7)',
          fontFamily: 'var(--mono)',
          fontSize: 'var(--fs-mono-md)',
          color: 'var(--danger)',
          letterSpacing: 'var(--tracking-mono)',
          background: 'var(--bg)',
          minHeight: '100vh',
        }}
      >
        {list.error}
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'var(--bg)',
      }}
    >
      <header
        style={{
          padding: 'var(--space-6) var(--space-7) var(--space-5)',
          background: 'var(--bg)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 'var(--fs-caption)',
            fontWeight: 500,
            color: 'var(--text3)',
            letterSpacing: 'var(--tracking-caption)',
            textTransform: 'uppercase',
          }}
        >
          {L('戦略ブラウザ', 'Strategy browser')}
        </div>
        <h1
          style={{
            margin: '6px 0 0 0',
            fontFamily: 'var(--serif)',
            fontSize: '2rem',
            fontWeight: 700,
            color: 'var(--text)',
            letterSpacing: '-0.01em',
            lineHeight: 1.1,
          }}
        >
          {L('登録済みの戦略を一覧する', 'Browse the strategy library')}
        </h1>
        <p
          style={{
            margin: '12px 0 0 0',
            maxWidth: 720,
            fontFamily: 'var(--sans)',
            fontSize: 'var(--fs-body)',
            color: 'var(--text2)',
            lineHeight: 1.55,
          }}
        >
          {L(
            '最新のバックテスト結果を一覧で比較し、有望な候補を詳細画面に進めましょう。行にカーソルを乗せると直近の equity sparkline がプリビューされます。',
            'Scan the latest backtests at a glance, hover a row to peek at its recent equity, and dive into the full detail when something stands out.',
          )}
        </p>
        </div>
        <SettingsToggles
          variation={variation}
          onSetVariation={(v) => update('variation', v)}
          lang={lang}
          onSetLang={(l) => update('lang', l)}
        />
      </header>

      <FilterBar symbols={list.symbols} timeframes={list.timeframes} lang={lang} />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {list.loading ? (
          <div
            style={{
              padding: 'var(--space-7)',
              fontFamily: 'var(--mono)',
              fontSize: 'var(--fs-mono-md)',
              color: 'var(--text3)',
              letterSpacing: 'var(--tracking-mono)',
              textTransform: 'uppercase',
            }}
          >
            {L('読み込み中…', 'Loading…')}
          </div>
        ) : (
          <StrategyTable
            items={list.filtered}
            total={list.all.length}
            sortKey={list.sortKey}
            sortDir={list.sortDir}
            onSort={list.setSort}
            selectedId={selectedId}
            onSelect={handleSelect}
            compareIds={compareIds}
            onToggleCompare={handleToggleCompare}
            lang={lang}
          />
        )}
        {selectedStrategy && (
          <StrategySlidePanel
            strategy={selectedStrategy}
            onClose={() => setSelectedId(null)}
            lang={lang}
          />
        )}
      </div>

      <CompareFloatingBar
        compareIds={compareIds}
        strategies={list.all}
        onRemove={handleRemoveCompare}
        lang={lang}
      />
    </div>
  )
}
