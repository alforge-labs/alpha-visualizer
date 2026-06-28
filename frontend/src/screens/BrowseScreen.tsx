import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import type { useStrategyList } from '../hooks/useStrategyList'
import type { Lang } from '../i18n/strings'
import type { Theme } from '../hooks/useTheme'
import type { StrategyListItem } from '../api/types'
import { FilterBar } from '../components/browser/FilterBar'
import { StrategyTable } from '../components/browser/StrategyTable'
import { StrategySlidePanel } from '../components/browser/StrategySlidePanel'
import { CompareFloatingBar } from '../components/browser/CompareFloatingBar'
import { GroupByToggle } from '../components/browser/GroupByToggle'
import { Heroline } from '../components/browser/Heroline'
import { SavedViews } from '../components/browser/SavedViews'
import { SymbolAtlas } from '../components/browser/SymbolAtlas'
import { SettingsToggles } from '../components/SettingsToggles'
import { Loading } from '../design/primitives'
import { makeL } from '../i18n/strings'

interface BrowseScreenProps {
  list: ReturnType<typeof useStrategyList>
  lang: Lang
  theme: Theme
  selectedStrategy: StrategyListItem | null
  onUpdateLang: (lang: Lang) => void
  onUpdateTheme: (theme: Theme) => void
  onSelect: (id: string) => void
  onCloseSlidePanel: () => void
}

export function BrowseScreen({
  list,
  lang,
  theme,
  selectedStrategy,
  onUpdateLang,
  onUpdateTheme,
  onSelect,
  onCloseSlidePanel,
}: BrowseScreenProps): ReactElement {
  const L = makeL(lang)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        background: 'var(--bg)',
      }}
    >
      <header
        className="u-toolbar-wrap"
        style={{
          padding: 'var(--layout-gutter-y) var(--layout-gutter) var(--space-5)',
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
            fontSize: 'var(--hero-fs-h1)',
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
        {!list.loading && <Heroline items={list.all} lang={lang} />}
        <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
          {(['/ideas', '/live'] as const).map((to) => (
            <Link
              key={to}
              to={to}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                marginTop: 'var(--space-3)',
                fontFamily: 'var(--sans)',
                fontSize: 'var(--fs-caption)',
                fontWeight: 500,
                color: 'var(--text3)',
                textDecoration: 'none',
                letterSpacing: 'var(--tracking-caption)',
                textTransform: 'uppercase',
              }}
            >
              {to === '/ideas' ? L('Ideas →', 'Ideas →') : L('Live →', 'Live →')}
            </Link>
          ))}
        </div>
        </div>
        <SettingsToggles
          lang={lang}
          onSetLang={onUpdateLang}
          theme={theme}
          onSetTheme={onUpdateTheme}
        />
      </header>

      <SavedViews lang={lang} />

      <FilterBar symbols={list.symbols} timeframes={list.timeframes} lang={lang} />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-4)',
          padding: 'var(--space-3) var(--layout-gutter)',
          background: 'var(--bg)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <GroupByToggle groupBy={list.groupBy} onChange={list.setGroupBy} lang={lang} />
      </div>

      {!list.loading && list.all.length > 0 && (
        <SymbolAtlas items={list.all} lang={lang} />
      )}

      <div style={{ display: 'flex', flex: 1 }}>
        {list.loading ? (
          <Loading label={L('読み込み中…', 'Loading…')} />
        ) : (
          <StrategyTable
            items={list.filtered}
            groups={list.groups}
            total={list.all.length}
            sortKey={list.sortKey}
            sortDir={list.sortDir}
            onSort={list.setSort}
            selectedId={list.selectedId}
            onSelect={onSelect}
            compareIds={list.compareIds}
            onToggleCompare={list.toggleCompareId}
            lang={lang}
          />
        )}
        {selectedStrategy && (
          <>
            {/* 768px 以下のドロワー時のみ表示（u-drawer-md-down-backdrop は @media で hidden→block 切替） */}
            <div
              className="u-drawer-md-down-backdrop u-hide-md-up"
              data-testid="slide-panel-backdrop"
              onClick={onCloseSlidePanel}
              aria-hidden="true"
            />
            <StrategySlidePanel
              strategy={selectedStrategy}
              onClose={onCloseSlidePanel}
              lang={lang}
            />
          </>
        )}
      </div>

      <CompareFloatingBar
        compareIds={list.compareIds}
        strategies={list.all}
        onRemove={list.removeCompareId}
        lang={lang}
      />
    </div>
  )
}
