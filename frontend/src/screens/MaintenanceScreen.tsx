import type { CSSProperties, ReactElement } from 'react'
import type { ComponentVersion, OrphanRunItem } from '../api/types'
import type { PruneResultView } from '../hooks/useOrphanRuns'
import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import type { Theme } from '../hooks/useTheme'
import { SettingsToggles } from '../components/SettingsToggles'
import { fmtNumber, fmtDate } from '../lib/format'
import { Button, ErrorBanner, Loading } from '../design/primitives'
import { ConfirmActionButton } from '../components/ConfirmActionButton'
import { VersionsPanel } from '../components/maintenance/VersionsPanel'

export interface MaintenanceScreenProps {
  versions: ComponentVersion[]
  versionsLoading: boolean
  versionsError: string | null
  /** ツール更新ボタン押下（forge / visualizer のみ）。 */
  onUpdateComponent: (component: 'forge' | 'visualizer') => void
  /** 進行中の更新対象。VersionsPanel のボタン無効化・文言切り替えに使う。 */
  updatingComponentId: 'forge' | 'visualizer' | null
  /** visualizer 更新成功後のサーバー再起動待ち表示。 */
  restarting: boolean
  restartTimedOut: boolean
  /** バージョン一覧取得エラー時の再試行ボタン押下。孤児一覧側の onRetry と役割が
   *  異なるため別名にする。 */
  onVersionsRetry?: () => void
  orphans: OrphanRunItem[]
  totalBytes: number
  loading: boolean
  /** 生のエラーメッセージ（ApiError.message 形式）。真偽判定と ErrorBanner の title に使う。 */
  error: string | null
  /**
   * ユーザー向けに正規化済みのメッセージ（`extractApiErrorDetail` を Page 層で
   * 適用した結果）。ErrorBanner の message に使う。`error` が真のときは常に
   * 非 null で渡される想定だが、念のため未設定時は `error` にフォールバックする。
   */
  errorMessage: string | null
  onRetry: () => void
  selectedIds: string[]
  onToggleId: (strategyId: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onDelete: () => void
  deleting: boolean
  result: PruneResultView | null
  lang: Lang
  theme: Theme
  onSetLang: (lang: Lang) => void
  onSetTheme: (theme: Theme) => void
}

const TH_BASE: CSSProperties = {
  fontFamily: 'var(--sans)',
  fontSize: 'var(--fs-caption)',
  fontWeight: 500,
  letterSpacing: 'var(--tracking-caption)',
  textTransform: 'uppercase',
  padding: '10px 12px',
  background: 'var(--surface)',
  borderBottom: '1px solid var(--border)',
  userSelect: 'none',
  whiteSpace: 'nowrap',
  textAlign: 'right',
  color: 'var(--text3)',
}

// browser ドメイン外のテーブルはローカル定義するのがこのコードベースの流儀
// （components/metrics/CompareTable.tsx / components/live/LivePositionsTable.tsx も同様）。
// components/browser/StrategyRow.tsx の TD_BASE と値は同一だが、Browse 側の都合で
// 変更されて巻き添えを食わないようこの画面専用に持つ。
const TD_BASE: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 'var(--fs-mono-md)',
  padding: '8px 12px',
  textAlign: 'right',
  borderBottom: '1px solid var(--border)',
  letterSpacing: 'var(--tracking-mono)',
}

/** bytes を MB 表示にする。全画面共通の丸め規約（fmtNumber decimals:1）に揃える。 */
function bytesToMb(bytes: number, opts: { suffix?: string } = {}): string {
  return fmtNumber(bytes / 1024 / 1024, { decimals: 1, suffix: opts.suffix })
}

interface RowProps {
  orphan: OrphanRunItem
  selected: boolean
  onToggle: (strategyId: string) => void
  lang: Lang
}

function OrphanRow({ orphan, selected, onToggle, lang }: RowProps): ReactElement {
  const L = makeL(lang)
  return (
    <tr style={{ background: selected ? 'var(--accent-bg)' : 'transparent' }}>
      <td style={{ ...TD_BASE, textAlign: 'left' }}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(orphan.strategy_id)}
          aria-label={L(
            `${orphan.strategy_id} を選択`,
            `Select ${orphan.strategy_id}`,
          )}
        />
      </td>
      <td style={{ ...TD_BASE, textAlign: 'left', fontFamily: 'var(--mono)', color: 'var(--text)' }}>
        {orphan.strategy_id}
      </td>
      <td style={{ ...TD_BASE, color: 'var(--text2)' }}>{orphan.backtest_run_count}</td>
      <td style={{ ...TD_BASE, color: 'var(--text2)' }}>{orphan.optimization_run_count}</td>
      <td style={{ ...TD_BASE, color: 'var(--text2)' }}>{bytesToMb(orphan.bytes, { suffix: ' MB' })}</td>
      <td style={{ ...TD_BASE, color: 'var(--text3)', fontSize: 'var(--fs-mono-sm)' }}>
        {fmtDate(orphan.last_run_at)}
      </td>
    </tr>
  )
}

interface ResultPanelProps {
  result: PruneResultView
  lang: Lang
}

function ResultPanel({ result, lang }: ResultPanelProps): ReactElement {
  const L = makeL(lang)
  const reclaimedMb = bytesToMb(result.reclaimedBytes, { suffix: ' MB' })
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
          `${result.deletedCount} 件の孤児を削除しました（バックテスト ${result.deletedBacktestRows} 行・最適化 ${result.deletedOptimizationRows} 行）。`,
          `Deleted ${result.deletedCount} orphan strategies (backtest rows: ${result.deletedBacktestRows}, optimization rows: ${result.deletedOptimizationRows}).`,
        )}
      </p>
      <p style={{ margin: 0 }}>{L(`回収容量: ${reclaimedMb}`, `Reclaimed disk space: ${reclaimedMb}`)}</p>
      {result.vacuumError && (
        <p style={{ margin: 0, color: 'var(--warn)' }}>
          {L(
            `削除は完了しましたが容量の回収に失敗しました（${result.vacuumError}）。空き容量を確保して \`alpha-forge backtest prune-orphans --vacuum\` を実行してください。`,
            `Deletion succeeded, but reclaiming disk space failed (${result.vacuumError}). Free up disk space and run \`alpha-forge backtest prune-orphans --vacuum\`.`,
          )}
        </p>
      )}
    </div>
  )
}

/**
 * 孤児バックテスト結果の一覧・選択削除画面（Presentational）。
 *
 * 「孤児」= strategies.db に定義が無いのに backtest_runs / optimization_runs に
 * 結果が残っている strategy_id。`alpha-forge strategy delete` を `--with-results`
 * 無しで実行すると意図的に結果を残すため、孤児は必ずしも不要データではない。
 * 削除は forge CLI へ委譲する不可逆な操作なので、確認ダイアログを経由しないと
 * 実行できないようにする（`components/ConfirmActionButton.tsx`）。
 */
export function MaintenanceScreen({
  versions,
  versionsLoading,
  versionsError,
  onUpdateComponent,
  updatingComponentId,
  restarting,
  restartTimedOut,
  onVersionsRetry,
  orphans,
  totalBytes,
  loading,
  error,
  errorMessage,
  onRetry,
  selectedIds,
  onToggleId,
  onSelectAll,
  onClearSelection,
  onDelete,
  deleting,
  result,
  lang,
  theme,
  onSetLang,
  onSetTheme,
}: MaintenanceScreenProps): ReactElement {
  const L = makeL(lang)
  const hasOrphans = orphans.length > 0

  const selectedBytes = orphans
    .filter(o => selectedIds.includes(o.strategy_id))
    .reduce((acc, o) => acc + o.bytes, 0)
  const selectedMb = fmtNumber(selectedBytes / 1024 / 1024, { decimals: 1 })

  return (
    <div
      data-testid="maintenance-screen"
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
          {L('整理', 'Maintenance')}
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
          {/* issue #364: strategies.db 等の内部用語を出さず UI 語彙で説明する */}
          {L(
            '削除・改名された戦略の残りのバックテスト結果（孤児データ）を一覧し、選択して削除します。',
            'List leftover backtest results from deleted or renamed strategies (orphan data), and delete the ones you select.',
          )}
        </p>
        <p
          style={{
            margin: '8px 0 0 0',
            maxWidth: 720,
            fontFamily: 'var(--sans)',
            fontSize: 'var(--fs-caption)',
            color: 'var(--warn)',
            lineHeight: 1.5,
          }}
        >
          {L(
            '削除は元に戻せません。また、残っている結果は意図的に保存されている場合もあります（AlphaForge で戦略を削除しても、結果は既定で残ります）。削除前に内容をよく確認してください。',
            'Deletion cannot be undone. Leftover results may have been kept on purpose (deleting a strategy in AlphaForge keeps its results by default). Review carefully before deleting.',
          )}
        </p>
        <details style={{ margin: '8px 0 0 0', maxWidth: 720 }}>
          <summary
            style={{
              cursor: 'pointer',
              fontFamily: 'var(--sans)',
              fontSize: 'var(--fs-caption)',
              color: 'var(--text3)',
            }}
          >
            {L('CLI での挙動（上級者向け）', 'CLI behavior (advanced)')}
          </summary>
          <p
            style={{
              margin: '6px 0 0 0',
              fontFamily: 'var(--mono)',
              fontSize: 'var(--fs-mono-sm)',
              color: 'var(--text3)',
              lineHeight: 1.6,
            }}
          >
            {L(
              'alpha-forge strategy delete は --with-results を付けない限り結果を残します。この画面の削除は forge backtest prune-orphans に委譲されます。',
              'alpha-forge strategy delete keeps results unless run with --with-results. Deletion here delegates to forge backtest prune-orphans.',
            )}
          </p>
        </details>
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
          flex: 1,
          padding: 'var(--space-6) var(--space-7)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        <VersionsPanel
          components={versions}
          loading={versionsLoading}
          error={versionsError}
          lang={lang}
          onUpdate={onUpdateComponent}
          updatingId={updatingComponentId}
          restarting={restarting}
          restartTimedOut={restartTimedOut}
          onRetry={onVersionsRetry}
        />

        {loading && <Loading label={L('読み込み中…', 'Loading…')} />}

        {error && (
          <ErrorBanner
            message={errorMessage ?? error}
            title={error}
            retryLabel={L('再試行', 'Retry')}
            onRetry={onRetry}
          />
        )}

        {!loading && hasOrphans && (
          <>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--space-3)',
              }}
            >
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
                  `${orphans.length} 件 · ${bytesToMb(totalBytes, { suffix: ' MB' })}`,
                  `${orphans.length} entries · ${bytesToMb(totalBytes, { suffix: ' MB' })}`,
                )}
              </span>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <Button variant="ghost" size="sm" onClick={onSelectAll}>
                  {L('すべて選択', 'Select all')}
                </Button>
                <Button variant="ghost" size="sm" onClick={onClearSelection}>
                  {L('選択を解除', 'Clear')}
                </Button>
              </div>
            </div>

            <div className="u-scroll-x">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th scope="col" style={{ ...TH_BASE, textAlign: 'left' }}>
                      {L('選択', 'Select')}
                    </th>
                    <th scope="col" style={{ ...TH_BASE, textAlign: 'left' }}>
                      {L('戦略 ID', 'Strategy ID')}
                    </th>
                    <th scope="col" style={TH_BASE}>{L('バックテスト', 'Backtest')}</th>
                    <th scope="col" style={TH_BASE}>{L('最適化', 'Optimize')}</th>
                    <th scope="col" style={TH_BASE}>{L('容量', 'Size')}</th>
                    <th scope="col" style={TH_BASE}>{L('最終実行', 'Last run')}</th>
                  </tr>
                </thead>
                <tbody>
                  {orphans.map(o => (
                    <OrphanRow
                      key={o.strategy_id}
                      orphan={o}
                      selected={selectedIds.includes(o.strategy_id)}
                      onToggle={onToggleId}
                      lang={lang}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <ConfirmActionButton
                triggerLabel={
                  // 削除は最長 900 秒（forge 起動 + VACUUM）かかりうる。disabled に
                  // なるだけでは「効いていない」と誤認され再操作・リロードを
                  // 誘発するため、進行中は文言でも明示する。
                  deleting
                    ? L('削除中…', 'Deleting…')
                    : L(
                        `選択した ${selectedIds.length} 件（${selectedMb} MB）を削除`,
                        `Delete ${selectedIds.length} selected (${selectedMb} MB)`,
                      )
                }
                triggerDisabled={selectedIds.length === 0 || deleting}
                title={L('孤児の実行結果を削除します', 'Delete orphan runs')}
                body={L(
                  `${selectedIds.length} 件（${selectedMb} MB）を削除します。元に戻せません。`,
                  `Deleting ${selectedIds.length} entries (${selectedMb} MB). This cannot be undone.`,
                )}
                confirmLabel={L('削除する', 'Delete')}
                cancelLabel={L('キャンセル', 'Cancel')}
                onConfirm={onDelete}
                lang={lang}
              />
            </div>
          </>
        )}

        {!loading && !error && !hasOrphans && (
          <p
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 'var(--fs-body)',
              color: 'var(--text3)',
            }}
          >
            {L('孤児の実行結果はありません', 'No orphan runs')}
          </p>
        )}

        {result && <ResultPanel result={result} lang={lang} />}
      </div>
    </div>
  )
}
