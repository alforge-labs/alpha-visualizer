import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import type { IdeaItem, LinkedRun } from '../api/types'
import { Card, Chip } from '../design/primitives'
import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import type { Theme } from '../hooks/useTheme'
import { SettingsToggles } from '../components/SettingsToggles'

const STATUS_VALUES = ['backlog', 'in_progress', 'tested', 'archived'] as const
type Status = (typeof STATUS_VALUES)[number]

function statusLabel(status: Status, lang: Lang): string {
  const map: Record<Status, [string, string]> = {
    backlog: ['バックログ', 'Backlog'],
    in_progress: ['進行中', 'In Progress'],
    tested: ['テスト済み', 'Tested'],
    archived: ['アーカイブ', 'Archived'],
  }
  const [ja, en] = map[status]
  return lang === 'ja' ? ja : en
}

function statusTone(status: string): 'neutral' | 'accent' | 'positive' | 'warning' {
  if (status === 'in_progress') return 'accent'
  if (status === 'tested') return 'positive'
  if (status === 'archived') return 'neutral'
  return 'warning'
}

export interface IdeasScreenProps {
  filtered: IdeaItem[]
  loading: boolean
  allTags: string[]
  statusFilter: string
  tagFilter: string
  onStatusFilterChange: (s: string) => void
  onTagFilterChange: (t: string) => void
  lang: Lang
  theme: Theme
  onSetLang: (l: Lang) => void
  onSetTheme: (t: Theme) => void
}

export function IdeasScreen({
  filtered,
  loading,
  allTags,
  statusFilter,
  tagFilter,
  onStatusFilterChange,
  onTagFilterChange,
  lang,
  theme,
  onSetLang,
  onSetTheme,
}: IdeasScreenProps): ReactElement {
  const L = makeL(lang)
  const hasFilter = statusFilter !== '' || tagFilter !== ''

  return (
    <div data-testid="ideas-screen" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)' }}>
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
            Ideas
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
              'forge idea コマンドで蓄積した戦略アイデアを一覧します。ステータスやタグで絞り込み、リンク済み戦略の詳細に移動できます。',
              'Browse strategy ideas added with forge idea. Filter by status or tag and jump to linked strategy details.',
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

      <div
        style={{
          padding: 'var(--space-4) var(--space-7)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
          alignItems: 'center',
          background: 'var(--bg)',
        }}
      >
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <StatusButton
            label={L('すべて', 'All')}
            active={statusFilter === ''}
            onClick={() => onStatusFilterChange('')}
          />
          {STATUS_VALUES.map((s) => (
            <StatusButton
              key={s}
              label={statusLabel(s, lang)}
              active={statusFilter === s}
              onClick={() => onStatusFilterChange(statusFilter === s ? '' : s)}
            />
          ))}
        </div>

        {allTags.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              flexWrap: 'wrap',
              borderLeft: '1px solid var(--border)',
              paddingLeft: 'var(--space-3)',
              marginLeft: 'var(--space-1)',
            }}
          >
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                aria-pressed={tagFilter === tag}
                onClick={() => onTagFilterChange(tagFilter === tag ? '' : tag)}
                style={{
                  padding: '3px 10px',
                  background: tagFilter === tag ? 'var(--accent)' : 'var(--surface-2)',
                  border: `1px solid ${tagFilter === tag ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-pill)',
                  fontFamily: 'var(--mono)',
                  fontSize: 'var(--fs-mono-sm)',
                  fontWeight: 600,
                  color: tagFilter === tag ? 'var(--surface)' : 'var(--text2)',
                  letterSpacing: 'var(--tracking-mono)',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  transition: 'background var(--motion-fast), color var(--motion-fast)',
                }}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      <main style={{ flex: 1, padding: 'var(--space-6) var(--space-7)' }}>
        {loading ? (
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 'var(--fs-mono-md)',
              color: 'var(--text3)',
              letterSpacing: 'var(--tracking-mono)',
            }}
          >
            {L('読み込み中…', 'Loading…')}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState lang={lang} hasFilter={hasFilter} />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
              gap: 'var(--space-4)',
            }}
          >
            {filtered.map((idea) => (
              <IdeaCard key={idea.idea_id} idea={idea} lang={lang} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

interface IdeaCardProps {
  idea: IdeaItem
  lang: Lang
}

function IdeaCard({ idea, lang }: IdeaCardProps) {
  const L = makeL(lang)
  const description = idea.description ?? ''
  const tags = idea.tags ?? []
  const linkedStrategies = idea.linked_strategies ?? []
  const linkedRuns: LinkedRun[] = Array.isArray(idea.linked_runs)
    ? idea.linked_runs.filter(
        (r): r is LinkedRun =>
          typeof r === 'object' && r !== null && 'strategy_id' in r,
      )
    : []
  const title = idea.title ?? idea.idea_id
  const status = idea.status ?? ''
  const notesHistory = idea.notes_history ?? []

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 'var(--fs-mono-sm)',
              color: 'var(--text3)',
              letterSpacing: 'var(--tracking-mono)',
              marginBottom: 4,
            }}
          >
            {idea.idea_id}
          </div>
          <div
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 'var(--fs-body)',
              fontWeight: 600,
              color: 'var(--text)',
            }}
          >
            {title}
          </div>
        </div>
        {status && (
          <Chip tone={statusTone(status)}>
            {STATUS_VALUES.includes(status as Status)
              ? statusLabel(status as Status, lang)
              : status}
          </Chip>
        )}
      </div>

      {description && (
        <div
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 'var(--fs-caption)',
            color: 'var(--text2)',
            lineHeight: 1.5,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {description}
        </div>
      )}

      {tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          {tags.map((tag) => (
            <Chip key={tag} tone="neutral">
              {tag}
            </Chip>
          ))}
        </div>
      )}

      {linkedStrategies.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 'var(--fs-mono-sm)',
              color: 'var(--text3)',
              letterSpacing: 'var(--tracking-mono)',
              textTransform: 'uppercase',
            }}
          >
            {L('リンク済み戦略', 'Linked strategies')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {linkedStrategies.map((strategyId) => (
              <Link
                key={strategyId}
                to={`/detail/${encodeURIComponent(strategyId)}`}
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 'var(--fs-mono-sm)',
                  color: 'var(--accent)',
                  textDecoration: 'none',
                  letterSpacing: 'var(--tracking-mono)',
                }}
              >
                {strategyId} →
              </Link>
            ))}
          </div>
        </div>
      )}

      {linkedRuns.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 'var(--fs-mono-sm)',
              color: 'var(--text3)',
              letterSpacing: 'var(--tracking-mono)',
              textTransform: 'uppercase',
            }}
          >
            {L('バックテスト結果', 'Backtest runs')}
          </div>
          {linkedRuns.map((run) => (
            <div
              key={run.run_id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                padding: 'var(--space-2) var(--space-3)',
                background: 'var(--surface-2)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
              }}
            >
              <Link
                to={`/detail/${encodeURIComponent(run.strategy_id)}`}
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 'var(--fs-mono-sm)',
                  color: 'var(--accent)',
                  textDecoration: 'none',
                  letterSpacing: 'var(--tracking-mono)',
                }}
              >
                {run.strategy_id} →
              </Link>
              {run.notes && (
                <div
                  style={{
                    fontFamily: 'var(--sans)',
                    fontSize: 'var(--fs-caption)',
                    color: 'var(--text2)',
                    lineHeight: 1.4,
                  }}
                >
                  {run.notes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {notesHistory.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 'var(--fs-mono-sm)',
              color: 'var(--text3)',
              letterSpacing: 'var(--tracking-mono)',
              textTransform: 'uppercase',
            }}
          >
            {L('メモ', 'Notes')}
          </div>
          <div
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 'var(--fs-caption)',
              color: 'var(--text2)',
              lineHeight: 1.5,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {notesHistory[notesHistory.length - 1]}
          </div>
        </div>
      )}
    </Card>
  )
}

interface StatusButtonProps {
  label: string
  active: boolean
  onClick: () => void
}

function StatusButton({ label, active, onClick }: StatusButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{
        padding: '4px 14px',
        background: active ? 'var(--accent)' : 'var(--surface-2)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-pill)',
        fontFamily: 'var(--sans)',
        fontSize: 'var(--fs-caption)',
        fontWeight: 600,
        color: active ? 'var(--surface)' : 'var(--text2)',
        cursor: 'pointer',
        transition: 'background var(--motion-fast), color var(--motion-fast)',
      }}
    >
      {label}
    </button>
  )
}

interface EmptyStateProps {
  lang: Lang
  hasFilter: boolean
}

function EmptyState({ lang, hasFilter }: EmptyStateProps) {
  const L = makeL(lang)
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-8) var(--space-7)',
        gap: 'var(--space-3)',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--serif)',
          fontSize: '1.25rem',
          fontWeight: 600,
          color: 'var(--text2)',
        }}
      >
        {hasFilter
          ? L('該当するアイデアがありません', 'No ideas match the filter')
          : L('アイデアがありません', 'No ideas yet')}
      </div>
      {!hasFilter && (
        <div
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
            color: 'var(--text3)',
            letterSpacing: 'var(--tracking-mono)',
          }}
        >
          forge idea add --title &quot;...&quot;
        </div>
      )}
    </div>
  )
}
