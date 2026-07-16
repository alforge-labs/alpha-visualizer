import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import type { LiveListItem } from '../api/types'
import { Chip } from '../design/primitives'
import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import type { Theme } from '../hooks/useTheme'
import { SettingsToggles } from '../components/SettingsToggles'
import { LiveTab } from '../components/live/LiveTab'

export interface LiveScreenProps {
  items: LiveListItem[]
  loading: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  lang: Lang
  theme: Theme
  onSetLang: (l: Lang) => void
  onSetTheme: (t: Theme) => void
}

/**
 * Live 一覧画面（Presentational、#221）。
 *
 * ライブ実績（trade 単位 / position ベース combine portfolio）を持つ
 * エントリの一覧と、選択中エントリの詳細（LiveTab）を表示する。
 * strategies.db 未登録の combine portfolio もここから到達できる。
 */
export function LiveScreen({
  items,
  loading,
  selectedId,
  onSelect,
  lang,
  theme,
  onSetLang,
  onSetTheme,
}: LiveScreenProps): ReactElement {
  const L = makeL(lang)

  return (
    <div
      data-testid="live-screen"
      style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)' }}
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
          <Link
            to="/browse"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontFamily: 'var(--sans)',
              fontSize: 'var(--fs-caption)',
              fontWeight: 500,
              color: 'var(--text3)',
              textDecoration: 'none',
              letterSpacing: 'var(--tracking-caption)',
              textTransform: 'uppercase',
              marginBottom: 'var(--space-3)',
            }}
          >
            ← {L('戦略ブラウザ', 'Browse')}
          </Link>
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--serif)',
              fontSize: '2rem',
              fontWeight: 700,
              color: 'var(--text)',
              letterSpacing: '-0.01em',
              lineHeight: 1.1,
            }}
          >
            Live
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
              'ライブ / ペーパートレードの実績を一覧します。combine ポートフォリオ（position ベース）と戦略単位の実績の両方をバックテストと突き合わせて確認できます。',
              'Browse live / paper trading records. Both combine portfolios (position-based) and per-strategy records are shown with backtest comparison.',
            )}
          </p>
        </div>
        <SettingsToggles
          lang={lang}
          onSetLang={onSetLang}
          theme={theme}
          onSetTheme={onSetTheme}
        />
      </header>

      <EntryList items={items} selectedId={selectedId} onSelect={onSelect} lang={lang} />

      <div style={{ flex: 1, padding: 'var(--space-5) var(--space-7)' }}>
        {loading ? (
          <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
            {L('読み込み中…', 'Loading…')}
          </div>
        ) : items.length === 0 ? (
          <EmptyState lang={lang} />
        ) : selectedId ? (
          <LiveTab key={selectedId} strategyId={selectedId} runId="" lang={lang} />
        ) : null}
      </div>
    </div>
  )
}

interface EntryListProps {
  items: LiveListItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  lang: Lang
}

function EntryList({ items, selectedId, onSelect, lang }: EntryListProps): ReactElement | null {
  const L = makeL(lang)
  if (items.length === 0) return null
  return (
    <div
      style={{
        padding: 'var(--space-4) var(--space-7)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'var(--space-2)',
        alignItems: 'center',
        background: 'var(--bg)',
      }}
    >
      {items.map((item) => {
        const active = item.strategy_id === selectedId
        return (
          <button
            key={item.strategy_id}
            type="button"
            onClick={() => onSelect(item.strategy_id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              fontFamily: 'var(--mono)',
              fontSize: '0.85rem',
              color: active ? 'var(--text)' : 'var(--text2)',
              background: active ? 'var(--surface)' : 'transparent',
              border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
            }}
          >
            {item.strategy_id}
            <Chip tone={item.kind === 'position' ? 'accent' : 'neutral'}>
              {item.kind === 'position' ? L('ポートフォリオ', 'Portfolio') : L('戦略', 'Strategy')}
            </Chip>
          </button>
        )
      })}
    </div>
  )
}

function EmptyState({ lang }: { lang: Lang }): ReactElement {
  const L = makeL(lang)
  return (
    <div
      style={{
        color: 'var(--text3)',
        fontFamily: 'var(--mono)',
        fontSize: '0.9rem',
        lineHeight: 1.8,
      }}
    >
      <div>{L('ライブ実績データがまだありません', 'No live records yet')}</div>
      <div style={{ color: 'var(--text2)', fontSize: '0.78rem' }}>
        {L(
          'alpha-strike が記録したライブイベントを alpha-forge live sync-events → live import-events / live replay で取り込むとここに表示されます。',
          'Records appear here after alpha-strike logs live events and you import them with alpha-forge live sync-events → live import-events / live replay.',
        )}
      </div>
    </div>
  )
}
