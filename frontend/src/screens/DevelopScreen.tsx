import { useState } from 'react'
import type { ReactElement } from 'react'
import { Link } from 'react-router'
import type { AgentBackendsResponse, JobStatus } from '../api/types'
import { Button, ErrorBanner } from '../design/primitives'
import type { Theme } from '../hooks/useTheme'
import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import { SettingsToggles } from '../components/SettingsToggles'

type AgentBackendId = 'claude' | 'codex'

// types.ts は AgentBackendsResponse のみを alias export しており(Task 9 確定分)、
// ネストした 1 要素の型は個別 export されていないため、ここで派生させる。
type AgentBackendInfo = AgentBackendsResponse['backends'][number]

export interface DevelopScreenProps {
  lang: Lang
  theme: Theme
  backends: AgentBackendsResponse | null
  running: boolean
  status: JobStatus | null
  logLines: string[]
  result: Record<string, unknown> | null
  error: string | null
  onStart: (goal: string, symbol: string, backend: AgentBackendId) => void
  onCancel: () => void
  onSetLang: (l: Lang) => void
  onSetTheme: (t: Theme) => void
}

// 導入導線 URL。backend/services/agent_cli.py の AGENT_NOT_FOUND_MESSAGES と同じ
// リンク先（Claude Code / Codex CLI の公式導入ページ）を UI 側でも案内する。
const INSTALL_URLS: Record<AgentBackendId, string> = {
  claude: 'https://claude.com/claude-code',
  codex: 'https://developers.openai.com/codex/cli',
}

const HEADER_STYLE = {
  padding: 'var(--space-6) var(--space-7) var(--space-5)',
  background: 'var(--bg)',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  alignItems: 'flex-start' as const,
  justifyContent: 'space-between' as const,
  gap: 'var(--space-4)',
} as const

const TITLE_STYLE = {
  margin: 0,
  fontFamily: 'var(--serif)',
  fontSize: '2rem',
  fontWeight: 700,
  color: 'var(--text)',
  letterSpacing: '-0.01em',
  lineHeight: 1.1,
} as const

const DESC_STYLE = {
  margin: '12px 0 0 0',
  maxWidth: 720,
  fontFamily: 'var(--sans)',
  fontSize: 'var(--fs-body)',
  color: 'var(--text2)',
  lineHeight: 1.55,
} as const

const BODY_STYLE = {
  flex: 1,
  padding: 'var(--space-6) var(--space-7)',
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 'var(--space-4)',
}

const LABEL_STYLE = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 4,
  fontFamily: 'var(--sans)',
  fontSize: 'var(--fs-caption)',
  fontWeight: 500,
  color: 'var(--text3)',
  letterSpacing: 'var(--tracking-caption)',
  textTransform: 'uppercase' as const,
}

const CONTROL_STYLE = {
  padding: '8px 12px',
  fontFamily: 'var(--mono)',
  fontSize: 'var(--fs-mono-md)',
  color: 'var(--text)',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  textTransform: 'none' as const,
  letterSpacing: 'normal',
}

const LOG_STYLE = {
  margin: 0,
  padding: '8px 12px',
  maxHeight: 320,
  overflow: 'auto',
  whiteSpace: 'pre-wrap' as const,
  fontFamily: 'var(--mono)',
  fontSize: 'var(--fs-mono-sm)',
  color: 'var(--text2)',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
}

interface HeaderProps {
  lang: Lang
  theme: Theme
  onSetLang: (l: Lang) => void
  onSetTheme: (t: Theme) => void
}

function Header({ lang, theme, onSetLang, onSetTheme }: HeaderProps): ReactElement {
  const L = makeL(lang)
  return (
    <header style={HEADER_STYLE}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={TITLE_STYLE}>{L('AI 戦略開発', 'Agent Develop')}</h1>
        <p style={DESC_STYLE}>
          {L(
            'ローカルの Claude Code / Codex CLI を使って戦略を自動開発します。CLI は外部（Anthropic / OpenAI）と通信します。',
            'Uses your local Claude Code / Codex CLI to automatically develop strategies. The CLI communicates with external services (Anthropic / OpenAI).',
          )}
        </p>
      </div>
      <SettingsToggles lang={lang} onSetLang={onSetLang} theme={theme} onSetTheme={onSetTheme} />
    </header>
  )
}

function LocalhostOnlyNotice({ lang }: { lang: Lang }): ReactElement {
  const L = makeL(lang)
  return (
    <div style={BODY_STYLE}>
      <p style={{ ...DESC_STYLE, margin: 0 }}>
        {L(
          'この機能は localhost でのみ利用できます',
          'This feature is only available on localhost',
        )}
      </p>
    </div>
  )
}

function InstallGuidanceCard({ lang }: { lang: Lang }): ReactElement {
  const L = makeL(lang)
  const items: { id: AgentBackendId; label: string }[] = [
    { id: 'claude', label: 'Claude Code' },
    { id: 'codex', label: 'Codex CLI' },
  ]
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        padding: 'var(--space-4)',
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        fontFamily: 'var(--sans)',
        fontSize: 'var(--fs-body)',
        color: 'var(--text2)',
      }}
    >
      <p style={{ margin: 0 }}>
        {L(
          'claude / codex コマンドのどちらも見つかりませんでした。どちらかを導入すると戦略開発を開始できます。',
          'Neither the claude nor codex command was found. Install one of them to start developing strategies.',
        )}
      </p>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {items.map((it) => (
          <li key={it.id}>
            <a
              href={INSTALL_URLS[it.id]}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--accent)', textDecoration: 'none' }}
            >
              {it.label}
              <span aria-hidden="true"> ↗</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

interface DevelopFormProps {
  lang: Lang
  availableBackends: AgentBackendInfo[]
  running: boolean
  onStart: (goal: string, symbol: string, backend: AgentBackendId) => void
}

// フォームの入力値（goal/symbol/backend 選択）は screens/ 本体には持たせず、
// この内側コンポーネントに閉じ込める。ただし他の Screen（OptimizeScreen の
// xParam/view 選択等）と同様、これは fetch を伴わない純粋な UI 入力 state
// であり、ADR-0001 が禁止する「data fetch hook」ではないため useState を使う。
function DevelopForm({ lang, availableBackends, running, onStart }: DevelopFormProps): ReactElement {
  const L = makeL(lang)
  const [goal, setGoal] = useState('')
  const [symbol, setSymbol] = useState('')
  const [backend, setBackend] = useState<AgentBackendId>(
    availableBackends[0]?.id ?? 'claude',
  )

  const canStart = goal.trim().length > 0 && !running

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        maxWidth: 560,
      }}
    >
      <label style={LABEL_STYLE}>
        {L('ゴール', 'Goal')}
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          disabled={running}
          rows={4}
          required
          style={{ ...CONTROL_STYLE, resize: 'vertical' }}
        />
      </label>
      <label style={LABEL_STYLE}>
        {L('銘柄（任意）', 'Symbol (optional)')}
        <input
          type="text"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          disabled={running}
          placeholder="CL=F"
          style={CONTROL_STYLE}
        />
      </label>
      <label style={LABEL_STYLE}>
        {L('バックエンド', 'Backend')}
        <select
          value={backend}
          onChange={(e) => setBackend(e.target.value as AgentBackendId)}
          disabled={running}
          style={CONTROL_STYLE}
        >
          {availableBackends.map((b) => (
            <option key={b.id} value={b.id}>
              {b.id}
              {b.version ? ` (${b.version})` : ''}
            </option>
          ))}
        </select>
      </label>
      <div>
        <Button
          variant="primary"
          disabled={!canStart}
          onClick={() => onStart(goal.trim(), symbol.trim(), backend)}
        >
          {running ? L('実行中…', 'Running…') : L('開始', 'Start')}
        </Button>
      </div>
    </div>
  )
}

function RunningPanel({
  lang,
  logLines,
  onCancel,
}: {
  lang: Lang
  logLines: string[]
  onCancel: () => void
}): ReactElement {
  const L = makeL(lang)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxWidth: 720 }}>
      <pre style={LOG_STYLE} aria-label={L('ジョブログ', 'Job log')}>
        {logLines.join('\n')}
      </pre>
      <div>
        <Button variant="subtle" size="sm" onClick={onCancel}>
          {L('キャンセル', 'Cancel')}
        </Button>
      </div>
    </div>
  )
}

function CompletionPanel({
  lang,
  status,
  result,
  error,
}: {
  lang: Lang
  status: JobStatus
  result: Record<string, unknown> | null
  error: string | null
}): ReactElement | null {
  const L = makeL(lang)
  if (status === 'succeeded') {
    const strategyId =
      result && typeof result.strategy_id === 'string' ? result.strategy_id : null
    if (strategyId) {
      return (
        <p style={{ margin: 0, fontFamily: 'var(--sans)', fontSize: 'var(--fs-body)' }}>
          <Link to={`/detail/${strategyId}`} style={{ color: 'var(--accent)' }}>
            {L(`結果を見る: ${strategyId}`, `View result: ${strategyId}`)}
          </Link>
        </p>
      )
    }
    // succeeded なのに result から strategy_id を特定できないケース。ログを
    // 見れば手がかりがあるはずなので、黙って何も出さない（silent fail）ことは
    // せず、必ず案内を出す。
    return (
      <p style={{ margin: 0, fontFamily: 'var(--sans)', fontSize: 'var(--fs-body)', color: 'var(--warn)' }}>
        {L(
          '完了しましたが結果を特定できませんでした。ログを確認してください',
          'Finished, but the result could not be determined. Check the log.',
        )}
      </p>
    )
  }
  if (status === 'failed') {
    return <ErrorBanner message={error ?? L('不明なエラー', 'Unknown error')} retryLabel={L('再試行', 'Retry')} />
  }
  if (status === 'cancelled') {
    return (
      <p style={{ margin: 0, fontFamily: 'var(--sans)', fontSize: 'var(--fs-body)', color: 'var(--text3)' }}>
        {L('キャンセルされました', 'Cancelled')}
      </p>
    )
  }
  return null
}

/**
 * AI 戦略開発画面（Presentational、Task 10）。
 *
 * `useAgentBackends` / `useAgentRunner` の結果を props としてのみ受け取り、
 * fetch やジョブ購読は一切行わない（ADR-0001）。`backends.enabled === false`
 * （非 loopback 公開中）または `backends === null`（未取得・取得失敗）の場合は
 * フォームを出さずに localhost 限定の案内のみを表示する。ナビ側の
 * `showDevelop` 非表示だけに頼らず、直接 URL アクセス時もここでガードする。
 */
export function DevelopScreen({
  lang,
  theme,
  backends,
  running,
  status,
  logLines,
  result,
  error,
  onStart,
  onCancel,
  onSetLang,
  onSetTheme,
}: DevelopScreenProps): ReactElement {
  if (!backends || !backends.enabled) {
    return (
      <div
        data-testid="develop-screen"
        style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)' }}
      >
        <Header lang={lang} theme={theme} onSetLang={onSetLang} onSetTheme={onSetTheme} />
        <LocalhostOnlyNotice lang={lang} />
      </div>
    )
  }

  const availableBackends = backends.backends.filter((b) => b.available)

  return (
    <div
      data-testid="develop-screen"
      style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)' }}
    >
      <Header lang={lang} theme={theme} onSetLang={onSetLang} onSetTheme={onSetTheme} />
      <div style={BODY_STYLE}>
        {availableBackends.length === 0 ? (
          <InstallGuidanceCard lang={lang} />
        ) : (
          <>
            <DevelopForm
              lang={lang}
              availableBackends={availableBackends}
              running={running}
              onStart={onStart}
            />
            {running && (
              <RunningPanel lang={lang} logLines={logLines} onCancel={onCancel} />
            )}
            {!running && status && (
              <CompletionPanel lang={lang} status={status} result={result} error={error} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
