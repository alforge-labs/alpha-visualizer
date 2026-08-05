import type { ReactElement, ReactNode } from 'react'
import { Link } from 'react-router'
import type { SetupCheckStatus, SetupStatusResponse } from '../api/types'
import { CommandSnippet } from '../components/start/CommandSnippet'
import type { GuideSteps } from '../components/start/FirstStrategyGuide'
import { FirstStrategyGuide } from '../components/start/FirstStrategyGuide'
import { SettingsToggles } from '../components/SettingsToggles'
import { Chip, ErrorBanner, Loading } from '../design/primitives'
import type { Theme } from '../hooks/useTheme'
import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import { extractApiErrorDetail, messageForApiErrorCode } from '../lib/errorMessage'

const INSTALL_URL = 'https://alforgelabs.com'

interface StartScreenProps {
  lang: Lang
  theme: Theme
  status: SetupStatusResponse | null
  loading: boolean
  error: string | null
  guideSteps: GuideSteps
  guideDismissed: boolean
  onDismissGuide: () => void
  onRestoreGuide: () => void
  onRetry: () => void
  onSetLang: (lang: Lang) => void
  onSetTheme: (theme: Theme) => void
}

const LINK_STYLE: React.CSSProperties = {
  fontFamily: 'var(--sans)',
  fontSize: 'var(--fs-caption)',
  color: 'var(--accent)',
}

function StatusChip({ status, lang }: { status: SetupCheckStatus; lang: Lang }): ReactElement {
  const L = makeL(lang)
  if (status === 'ok') return <Chip tone="positive">{L('完了', 'Done')}</Chip>
  if (status === 'attention') return <Chip tone="warning">{L('要対応', 'Action needed')}</Chip>
  return <Chip tone="neutral">{L('未確認', 'Unknown')}</Chip>
}

interface CheckRowProps {
  status: SetupCheckStatus
  title: string
  lang: Lang
  children: ReactNode
}

function CheckRow({ status, title, lang, children }: CheckRowProps): ReactElement {
  return (
    <li
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: 'var(--space-4)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 'var(--fs-body)',
            fontWeight: 600,
            color: 'var(--text)',
          }}
        >
          {title}
        </span>
        <StatusChip status={status} lang={lang} />
      </div>
      <div style={{ fontFamily: 'var(--sans)', fontSize: 'var(--fs-caption)', color: 'var(--text2)' }}>
        {children}
      </div>
    </li>
  )
}

/** unknown 共通の説明。前段のチェックが片付くと自動で再判定される。 */
function UnknownBody({ lang }: { lang: Lang }): ReactElement {
  const L = makeL(lang)
  return (
    <p style={{ margin: 0 }}>
      {L(
        '確認できませんでした。前の項目を解決すると自動で再判定されます。',
        'Could not be verified. Resolve the items above and this will be re-checked automatically.',
      )}
    </p>
  )
}

/**
 * 「はじめる」画面（issue #492・Presentational）。
 *
 * 初回起動時に「何が揃っていて、次に何をすべきか」を 1 画面で示す。各
 * チェックの attention には具体的な次の一手（コピー可能なコマンド or GUI 内
 * アクションへのリンク）を必ず添える。EULA・認証・workspace 初期化は GUI に
 * 複製せず、ターミナルでの CLI 実行を案内するに留める（issue #492 の制約）。
 */
export function StartScreen({
  lang,
  theme,
  status,
  loading,
  error,
  guideSteps,
  guideDismissed,
  onDismissGuide,
  onRestoreGuide,
  onRetry,
  onSetLang,
  onSetTheme,
}: StartScreenProps): ReactElement {
  const L = makeL(lang)
  return (
    <div style={{ padding: 'var(--layout-gutter-y) var(--layout-gutter)', background: 'var(--bg)', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h1
          style={{
            margin: '0 0 var(--space-2)',
            fontFamily: 'var(--serif)',
            fontSize: 'var(--browse-fs-h1)',
            fontWeight: 700,
            color: 'var(--text)',
          }}
        >
          {L('はじめる', 'Get Started')}
        </h1>
        <SettingsToggles lang={lang} onSetLang={onSetLang} theme={theme} onSetTheme={onSetTheme} />
      </div>
      <p
        style={{
          margin: '0 0 var(--space-5)',
          fontFamily: 'var(--sans)',
          fontSize: 'var(--fs-caption)',
          color: 'var(--text3)',
          maxWidth: 720,
        }}
      >
        {L(
          'AlphaForge を使い始めるためのチェックリストです。上から順に揃えると、バックテスト・AI 戦略開発・Pine Script 出力が使えるようになります。',
          'A checklist to get AlphaForge up and running. Complete the items from top to bottom to unlock backtesting, AI strategy development, and Pine Script export.',
        )}
      </p>

      {loading && <Loading label={L('読み込み中…', 'Loading…')} />}

      {error != null && (
        <ErrorBanner
          message={messageForApiErrorCode(error, lang) ?? extractApiErrorDetail(error, lang)}
          title={error}
          retryLabel={L('再試行', 'Retry')}
          onRetry={onRetry}
        />
      )}

      {status?.ready === true && (
        <div
          style={{
            padding: 'var(--space-4)',
            border: '1px solid color-mix(in srgb, var(--success) 28%, transparent)',
            borderRadius: 'var(--radius-md)',
            background: 'color-mix(in srgb, var(--success) 10%, transparent)',
            marginBottom: 'var(--space-4)',
            fontFamily: 'var(--sans)',
          }}
        >
          <p style={{ margin: '0 0 var(--space-2)', fontWeight: 700, color: 'var(--text)' }}>
            {L('準備完了！すべて揃っています。', 'All set! Everything is ready.')}
          </p>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Link to="/develop" style={LINK_STYLE}>
              {L('AI で戦略を作ってみる →', 'Create a strategy with AI →')}
            </Link>
            <Link to="/browse" style={LINK_STYLE}>
              {L('バックテスト結果を見る →', 'Browse backtest results →')}
            </Link>
          </div>
        </div>
      )}

      {status != null && (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
            maxWidth: 720,
          }}
        >
          <CheckRow status={status.cli.status} title={L('AlphaForge CLI', 'AlphaForge CLI')} lang={lang}>
            {status.cli.status === 'ok' && (
              <p style={{ margin: 0 }}>
                {status.cli.version != null
                  ? L(`v${status.cli.version} を検出しました。`, `Detected v${status.cli.version}.`)
                  : L('検出しました。', 'Detected.')}
              </p>
            )}
            {status.cli.status === 'attention' && (
              <p style={{ margin: 0 }}>
                {L(
                  'alpha-forge コマンドが見つかりません。インストール後にこのサーバーを起動し直してください。',
                  'The alpha-forge command was not found. Install it and restart this server.',
                )}{' '}
                <a href={INSTALL_URL} target="_blank" rel="noreferrer" style={LINK_STYLE}>
                  {L('インストールガイド →', 'Installation guide →')}
                </a>
              </p>
            )}
            {status.cli.status === 'unknown' && <UnknownBody lang={lang} />}
          </CheckRow>

          <CheckRow
            status={status.eula.status}
            title={L('使用許諾契約（EULA）', 'End User License Agreement (EULA)')}
            lang={lang}
          >
            {status.eula.status === 'ok' && <p style={{ margin: 0 }}>{L('同意済みです。', 'Accepted.')}</p>}
            {status.eula.status === 'attention' && (
              <div>
                <p style={{ margin: 0 }}>
                  {L(
                    'ターミナルで次のコマンドを 1 回実行し、表示される EULA に同意してください。この画面からは同意できません。',
                    'Run the following command once in a terminal and accept the EULA it shows. It cannot be accepted from this screen.',
                  )}
                </p>
                <CommandSnippet command="alpha-forge system doctor" lang={lang} />
              </div>
            )}
            {status.eula.status === 'unknown' && <UnknownBody lang={lang} />}
          </CheckRow>

          <CheckRow
            status={status.workspace.status}
            title={L('ワークスペース（forge.yaml）', 'Workspace (forge.yaml)')}
            lang={lang}
          >
            {status.workspace.status === 'ok' && (
              <p style={{ margin: 0, fontFamily: 'var(--mono)', fontSize: 'var(--fs-mono-sm)' }}>
                {status.workspace.config_path}
              </p>
            )}
            {status.workspace.status === 'attention' && (
              <div>
                <p style={{ margin: 0 }}>
                  {L(
                    'forge.yaml が見つかりません。ワークスペースにしたいディレクトリで次を実行し、そのディレクトリを --forge-dir に指定してサーバーを起動し直してください。',
                    'forge.yaml was not found. Run the following in the directory you want as your workspace, then restart this server with --forge-dir pointing at it.',
                  )}
                </p>
                <CommandSnippet command="alpha-forge system init" lang={lang} />
              </div>
            )}
            {status.workspace.status === 'unknown' && <UnknownBody lang={lang} />}
          </CheckRow>

          <CheckRow status={status.auth.status} title={L('認証（ライセンス）', 'Authentication (license)')} lang={lang}>
            {status.auth.status === 'ok' && (
              <p style={{ margin: 0 }}>
                {status.auth.plan_type != null
                  ? L(`ログイン済み（プラン: ${status.auth.plan_type}）。`, `Logged in (plan: ${status.auth.plan_type}).`)
                  : L('ログイン済みです。', 'Logged in.')}
              </p>
            )}
            {status.auth.status === 'attention' && (
              <div>
                <p style={{ margin: 0 }}>
                  {L(
                    '未ログインです。ターミナルで次を実行してログインしてください（ブラウザ認証は CLI 側で完結します）。',
                    'Not logged in. Run the following in a terminal to log in (the browser flow completes on the CLI side).',
                  )}
                </p>
                <CommandSnippet command="alpha-forge system auth login" lang={lang} />
              </div>
            )}
            {status.auth.status === 'unknown' && <UnknownBody lang={lang} />}
          </CheckRow>

          <CheckRow status={status.data.status} title={L('ヒストリカルデータ', 'Historical data')} lang={lang}>
            {status.data.status === 'ok' && (
              <p style={{ margin: 0 }}>
                {L(`${status.data.count ?? 0} 件のデータがあります。`, `${status.data.count ?? 0} dataset(s) available.`)}
              </p>
            )}
            {status.data.status === 'attention' && (
              <p style={{ margin: 0 }}>
                {L(
                  'まだデータがありません。バックテストに使う銘柄のデータを取得しましょう。',
                  'No historical data yet. Fetch data for the symbols you want to backtest.',
                )}{' '}
                <Link to="/data" style={LINK_STYLE}>
                  {L('データ画面で取得する →', 'Fetch on the Data screen →')}
                </Link>
              </p>
            )}
            {status.data.status === 'unknown' && <UnknownBody lang={lang} />}
          </CheckRow>
        </ul>
      )}

      {/* セットアップの次の成功体験への 5 ステップ（issue #493）。読み込み中・
          エラー中はチェックリスト同様に出さない（判定材料が無い） */}
      {status != null && (
        <FirstStrategyGuide
          lang={lang}
          steps={guideSteps}
          dismissed={guideDismissed}
          onDismiss={onDismissGuide}
          onRestore={onRestoreGuide}
        />
      )}
    </div>
  )
}
