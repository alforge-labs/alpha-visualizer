import type { ReactElement } from 'react'
import { Link } from 'react-router'
import type { useStrategyList } from '../hooks/useStrategyList'
import type { Lang } from '../i18n/strings'
import type { Theme } from '../hooks/useTheme'
import type { StrategyListItem } from '../api/types'
import { FilterBar } from '../components/browser/FilterBar'
import { StrategyTable } from '../components/browser/StrategyTable'
import { CreateStrategyEntry } from '../components/browser/CreateStrategyEntry'
import { StrategySlidePanel } from '../components/browser/StrategySlidePanel'
import { CompareFloatingBar } from '../components/browser/CompareFloatingBar'
import { GroupByToggle } from '../components/browser/GroupByToggle'
import { Heroline } from '../components/browser/Heroline'
import { SavedViews } from '../components/browser/SavedViews'
import { SymbolCoverageTable } from '../components/browser/SymbolCoverageTable'
import { CollapsibleSection } from '../components/browser/CollapsibleSection'
import { SettingsToggles } from '../components/SettingsToggles'
import { Loading } from '../design/primitives'
import { makeL } from '../i18n/strings'
import { buildSymbolStats } from '../lib/symbolStats'

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
  // 折り畳みラベルの銘柄数は Heroline の「銘柄数」・FilterBar の「銘柄で絞る」と
  // 揃える（どちらも未割当を除いた実効銘柄数）。表の行数（未割当込み）との差は
  // 「+ 未割当」で明示する。詳細は設計仕様 §3.6 を参照。
  const coverage = buildSymbolStats(list.allRecipes)
  const unrunRecipeTotal = coverage.reduce((acc, s) => acc + s.unrunRecipeCount, 0)
  const assignedSymbolCount = coverage.filter(s => s.symbol !== null).length
  const hasUnassigned = coverage.some(s => s.symbol === null)
  const coverageLabel = hasUnassigned
    ? L(
        `銘柄カバレッジ（${assignedSymbolCount} 銘柄 + 未割当 · 未実行 ${unrunRecipeTotal} レシピ）`,
        `Symbol coverage (${assignedSymbolCount} symbols + unassigned · ${unrunRecipeTotal} unrun recipes)`,
      )
    : L(
        `銘柄カバレッジ（${assignedSymbolCount} 銘柄 · 未実行 ${unrunRecipeTotal} レシピ）`,
        `Symbol coverage (${assignedSymbolCount} symbols · ${unrunRecipeTotal} unrun recipes)`,
      )

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
          padding: 'var(--space-4) var(--layout-gutter)',
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
            margin: '4px 0 0 0',
            fontFamily: 'var(--serif)',
            fontSize: 'var(--browse-fs-h1)',
            fontWeight: 700,
            color: 'var(--text)',
            letterSpacing: '-0.01em',
            lineHeight: 1.1,
          }}
        >
          {L('登録済みの戦略を一覧する', 'Browse the strategy library')}
        </h1>
        {!list.loading && <Heroline items={list.all} lang={lang} />}
        <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* issue #365: 作成ウィザード（Detail 戦略構成タブ）への発見可能な導線 */}
          <div style={{ marginTop: 'var(--space-3)' }}>
            <CreateStrategyEntry strategies={list.all} lang={lang} />
          </div>
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
        <CollapsibleSection
          label={coverageLabel}
          testId="symbol-coverage-collapsible"
        >
          <SymbolCoverageTable recipes={list.allRecipes} lang={lang} />
        </CollapsibleSection>
      )}

      <div style={{ display: 'flex', flex: 1 }}>
        {list.loading ? (
          <Loading label={L('読み込み中…', 'Loading…')} />
        ) : (
          <StrategyTable
            recipes={list.recipes}
            groups={list.groups}
            strategyTotal={list.all.length}
            recipeTotal={list.recipeTotal}
            hiddenUnrunRecipeCount={list.hiddenUnrunRecipeCount}
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
