import { useState } from 'react'
import type { ReactElement } from 'react'
import { Link } from 'react-router'
import type { AgentBackendsResponse, JobStatus } from '../api/types'
import { Button, ErrorBanner, Loading } from '../design/primitives'
import type { Theme } from '../hooks/useTheme'
import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import type { GoalTypeId } from '../lib/goalBuilder'
import { BUILDER_INDICATORS, GOAL_TYPES, buildGoalText } from '../lib/goalBuilder'
import { SettingsToggles } from '../components/SettingsToggles'

type AgentBackendId = 'claude' | 'codex'

// types.ts は AgentBackendsResponse のみを alias export しており(Task 9 確定分)、
// ネストした 1 要素の型は個別 export されていないため、ここで派生させる。
type AgentBackendInfo = AgentBackendsResponse['backends'][number]

export interface DevelopScreenProps {
  lang: Lang
  theme: Theme
  backends: AgentBackendsResponse | null
  /** useAgentBackends() の初回 fetch 中は true。localhost 案内より優先して中立のローディング表示を出す。 */
  backendsLoading: boolean
  running: boolean
  status: JobStatus | null
  logLines: string[]
  result: Record<string, unknown> | null
  error: string | null
  /** maxTurns は未指定（サーバー既定に任せる）なら null。claude のみ有効 */
  onStart: (
    goal: string,
    symbol: string,
    backend: AgentBackendId,
    maxTurns: number | null,
  ) => void
  onCancel: () => void
  onSetLang: (l: Lang) => void
  onSetTheme: (t: Theme) => void
  /**
   * 保有データの銘柄一覧（未取得銘柄の警告・issue #486）。
   * null / 未指定 = 一覧を取得できていない（警告は出さない縮退）。
   */
  datasetSymbols?: string[] | null
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

const HINT_STYLE = {
  fontFamily: 'var(--sans)',
  fontSize: 'var(--fs-caption)',
  fontWeight: 400,
  color: 'var(--text3)',
  letterSpacing: 'normal',
  textTransform: 'none' as const,
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
  /** サーバー既定のターン上限（入力欄のプレースホルダに使う） */
  defaultMaxTurns: number
  /** 指定できる最大値（サーバー側のバリデーションと揃える） */
  maxMaxTurns: number
  running: boolean
  onStart: (
    goal: string,
    symbol: string,
    backend: AgentBackendId,
    maxTurns: number | null,
  ) => void
  /** 保有データの銘柄一覧（null = 不明。未取得警告・issue #486） */
  datasetSymbols: string[] | null
}

/**
 * ターン上限の入力値を API に渡せる形へ正規化する。
 * 空欄・不正値は null（= サーバー既定に任せる）にして、422 になる値を
 * 送らないようにする。
 */
function parseTurnLimit(raw: string, max: number): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) return null
  return parsed
}

// フォームの入力値（goal/symbol/backend 選択）は screens/ 本体には持たせず、
// この内側コンポーネントに閉じ込める。ただし他の Screen（OptimizeScreen の
// xParam/view 選択等）と同様、これは fetch を伴わない純粋な UI 入力 state
// であり、ADR-0001 が禁止する「data fetch hook」ではないため useState を使う。
function DevelopForm({
  lang,
  availableBackends,
  defaultMaxTurns,
  maxMaxTurns,
  running,
  onStart,
  datasetSymbols,
}: DevelopFormProps): ReactElement {
  const L = makeL(lang)
  const [goal, setGoal] = useState('')
  const [symbol, setSymbol] = useState('')
  const [backend, setBackend] = useState<AgentBackendId>(
    availableBackends[0]?.id ?? 'claude',
  )
  const [maxTurns, setMaxTurns] = useState('')

  // ゴールビルダー（issue #489）。選択が変わるたびにゴール欄へ文を書き込む。
  // 何も選ばれていない状態への遷移では空文字が返り、自由記述を消さない。
  const [builderType, setBuilderType] = useState<GoalTypeId | ''>('')
  const [builderIndicators, setBuilderIndicators] = useState<readonly string[]>([])

  const applyBuilder = (
    typeId: GoalTypeId | '',
    indicators: readonly string[],
  ): void => {
    setBuilderType(typeId)
    setBuilderIndicators(indicators)
    const text = buildGoalText(lang, typeId, indicators)
    if (text !== '') setGoal(text)
  }

  const canStart = goal.trim().length > 0 && !running

  // 未取得銘柄の警告（issue #486）。一覧が取れていない（null）ときは
  // 誤警告を避けて出さない。大文字小文字は無視して照合する。
  const trimmedSymbol = symbol.trim()
  const symbolMissing =
    datasetSymbols != null &&
    trimmedSymbol !== '' &&
    !datasetSymbols.some((s) => s.toUpperCase() === trimmedSymbol.toUpperCase())

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        maxWidth: 560,
      }}
    >
      {/* かんたん入力（issue #489）: 選択式でゴール文を組み立てる補助 UI。
          モード切替ではなく共通のゴール欄へ書き込む形にする — 自由記述は
          常に可能で、組み上がった文もそのまま編集できる。 */}
      <details
        open
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: 'var(--space-2) var(--space-3)',
          background: 'var(--surface)',
        }}
      >
        <summary
          style={{ ...LABEL_STYLE, cursor: 'pointer', userSelect: 'none' }}
        >
          {L('かんたん入力（選ぶだけでゴール文を作成）', 'Quick input (build the goal by selecting)')}
        </summary>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
            marginTop: 'var(--space-2)',
          }}
        >
          <label style={LABEL_STYLE}>
            {L('戦略タイプ', 'Strategy type')}
            <select
              aria-label={L('戦略タイプ', 'Strategy type')}
              value={builderType}
              onChange={(e) =>
                applyBuilder(e.target.value as GoalTypeId | '', builderIndicators)
              }
              disabled={running}
              style={CONTROL_STYLE}
            >
              <option value="">{L('（選択してください）', '(select)')}</option>
              {GOAL_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {lang === 'ja' ? t.ja : t.en}
                </option>
              ))}
            </select>
          </label>
          <fieldset
            style={{
              border: 'none',
              margin: 0,
              padding: 0,
            }}
          >
            <legend style={{ ...LABEL_STYLE, padding: 0 }}>
              {L('使いたい指標（任意）', 'Indicators (optional)')}
            </legend>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
              {BUILDER_INDICATORS.map((ind) => (
                <label
                  key={ind}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontFamily: 'var(--mono)',
                    fontSize: 'var(--fs-mono-sm)',
                    color: 'var(--text2)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={builderIndicators.includes(ind)}
                    onChange={(e) =>
                      applyBuilder(
                        builderType,
                        e.target.checked
                          ? [...builderIndicators, ind]
                          : builderIndicators.filter((i) => i !== ind),
                      )
                    }
                    disabled={running}
                  />
                  {ind}
                </label>
              ))}
            </div>
          </fieldset>
          <span style={HINT_STYLE}>
            {L(
              '選ぶと下の「ゴール」に文が入ります。文は自由に書き換えられます。',
              'Selecting fills the Goal below. You can edit the text freely.',
            )}
          </span>
        </div>
      </details>
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
        {symbolMissing && (
          <span style={{ ...HINT_STYLE, color: 'var(--warn)' }}>
            {L(
              'この銘柄のヒストリカルデータは未取得です。先に取得しておくと確実です（codex はサンドボックスの制限で実行中に取得できません）。',
              'Historical data for this symbol has not been fetched yet. Fetching it first is recommended (codex cannot fetch during a run due to sandbox restrictions).',
            )}{' '}
            <Link
              to={`/data?symbol=${encodeURIComponent(trimmedSymbol)}&interval=1d`}
              style={{ color: 'var(--accent)' }}
            >
              {L('データ画面で取得する →', 'Fetch in the Data view →')}
            </Link>
          </span>
        )}
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
      {/* ターン上限は claude のみ有効（codex exec に相当フラグが無い）。
          codex 選択時に無効な入力欄を見せないよう、条件付きで出す。 */}
      {backend === 'claude' && (
        <label style={LABEL_STYLE}>
          {L('ターン上限（任意）', 'Turn limit (optional)')}
          <input
            type="number"
            min={1}
            max={maxMaxTurns}
            value={maxTurns}
            onChange={(e) => setMaxTurns(e.target.value)}
            disabled={running}
            placeholder={String(defaultMaxTurns)}
            style={CONTROL_STYLE}
          />
          <span style={HINT_STYLE}>
            {L(
              `未指定なら ${defaultMaxTurns}。上限に達すると作業途中でも打ち切られます`,
              `Defaults to ${defaultMaxTurns}. The agent is cut off when it reaches this limit, even mid-task.`,
            )}
          </span>
        </label>
      )}
      <div>
        <Button
          variant="primary"
          disabled={!canStart}
          onClick={() =>
            onStart(
              goal.trim(),
              symbol.trim(),
              backend,
              backend === 'claude' ? parseTurnLimit(maxTurns, maxMaxTurns) : null,
            )
          }
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
      {/*
        実行は数分かかり、画面上の変化はログの追記だけ。ライブリージョンに
        しないと、スクリーンリーダー利用者には進行中なのか止まったのか
        分からない（issue #473）。
        1 行を 1 要素にしているのは aria-atomic="false" と組み合わせて
        「追記された行だけ」を読み上げさせるため。全行を 1 つのテキスト
        ノードにすると、追記のたびに全文が読み直されて実用に耐えない。
      */}
      <div
        role="log"
        aria-live="polite"
        aria-atomic="false"
        aria-label={L('ジョブログ', 'Job log')}
        style={LOG_STYLE}
      >
        {logLines.map((line, i) => (
          <div key={`${i}:${line}`}>{line}</div>
        ))}
      </div>
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
    const summary =
      result && typeof result.summary === 'string' && result.summary.trim()
        ? result.summary.trim()
        : null
    if (strategyId) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <p style={{ margin: 0, fontFamily: 'var(--sans)', fontSize: 'var(--fs-body)' }}>
            {/* strategy_id はエージェント出力由来の未検証文字列。エンコード
                しないと予約文字で別ルートへのリンクになり、成果物へ辿れない */}
            <Link
              to={`/detail/${encodeURIComponent(strategyId)}`}
              style={{ color: 'var(--accent)' }}
            >
              {L(`結果を見る: ${strategyId}`, `View result: ${strategyId}`)}
            </Link>
          </p>
          {/* エージェントは {strategy_id, run_id, summary} を返す契約。
              summary（何を作ったのかの 1 行）まで出して初めて完了表示になる */}
          {summary && (
            <p
              data-testid="develop-summary"
              style={{
                margin: 0,
                fontFamily: 'var(--sans)',
                fontSize: 'var(--fs-body)',
                color: 'var(--text2)',
              }}
            >
              {summary}
            </p>
          )}
          {/* 次アクション導線（issue #490）: 作りっぱなしで終わらせず、
              初中級者を次の学習ステップ（最適化 → Pine → 比較）へ繋ぐ */}
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-3)',
              flexWrap: 'wrap',
              marginTop: 'var(--space-1)',
              fontFamily: 'var(--sans)',
              fontSize: 'var(--fs-caption)',
            }}
          >
            <Link
              to={`/detail/${encodeURIComponent(strategyId)}?tab=optimize`}
              style={{ color: 'var(--accent)' }}
            >
              {L('最適化する →', 'Optimize →')}
            </Link>
            <Link
              to={`/detail/${encodeURIComponent(strategyId)}?tab=strategy`}
              style={{ color: 'var(--accent)' }}
            >
              {L('Pine に出す →', 'Export to Pine →')}
            </Link>
            <Link
              to={`/compare?ids=${encodeURIComponent(strategyId)}`}
              style={{ color: 'var(--accent)' }}
            >
              {L('比較に追加 →', 'Add to compare →')}
            </Link>
          </div>
        </div>
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
 * fetch やジョブ購読は一切行わない（ADR-0001）。`backendsLoading === true`
 * （初回 fetch 中）は案内でもフォームでもなく中立のローディング表示を出す。
 * `backends.enabled === false`（非 loopback 公開中）または
 * `backends === null`（未取得・取得失敗）の場合はフォームを出さずに
 * localhost 限定の案内のみを表示する。ナビ側の `showDevelop` 非表示だけに
 * 頼らず、直接 URL アクセス時もここでガードする。
 */
export function DevelopScreen({
  lang,
  theme,
  backends,
  backendsLoading,
  running,
  status,
  logLines,
  result,
  error,
  onStart,
  onCancel,
  onSetLang,
  onSetTheme,
  datasetSymbols = null,
}: DevelopScreenProps): ReactElement {
  const L = makeL(lang)

  if (backendsLoading) {
    return (
      <div
        data-testid="develop-screen"
        style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)' }}
      >
        <Header lang={lang} theme={theme} onSetLang={onSetLang} onSetTheme={onSetTheme} />
        <div style={BODY_STYLE}>
          <Loading label={L('読み込み中…', 'Loading…')} />
        </div>
      </div>
    )
  }

  // サーバー側は無効時（非 loopback 公開中）に GET /api/agent/backends 自体を
  // 403 で返すため（AgentDisabledError）、useAgentBackends は catch して
  // data=null に縮退する。よって通常は下の `!backends` 側に入り、
  // `backends.enabled === false` は到達しない想定だが、フォールバック値や
  // 将来のサーバー実装変更に備えて防御的に残す。
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
              defaultMaxTurns={backends.default_max_turns}
              maxMaxTurns={backends.max_max_turns}
              running={running}
              onStart={onStart}
              datasetSymbols={datasetSymbols}
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
