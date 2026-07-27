import type { CSSProperties, ReactElement } from 'react'
import type { OrphanRunItem } from '../api/types'
import type { PruneResultView } from '../hooks/useOrphanRuns'
import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import { fmtNumber, fmtDate } from '../lib/format'
import { Button, ErrorBanner, Loading } from '../design/primitives'
import { ConfirmActionButton } from '../components/ConfirmActionButton'
import { TD_BASE } from '../components/browser/StrategyRow'

export interface MaintenanceScreenProps {
  orphans: OrphanRunItem[]
  totalBytes: number
  loading: boolean
  error: string | null
  onRetry: () => void
  selectedIds: string[]
  onToggleId: (strategyId: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onDelete: () => void
  deleting: boolean
  result: PruneResultView | null
  lang: Lang
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
  orphans,
  totalBytes,
  loading,
  error,
  onRetry,
  selectedIds,
  onToggleId,
  onSelectAll,
  onClearSelection,
  onDelete,
  deleting,
  result,
  lang,
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
        }}
      >
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
          {L(
            'strategies.db に定義が無い孤児バックテスト結果（過去に削除・改名した戦略の残骸）を一覧し、選択して削除します。',
            'List orphan backtest results (leftovers from deleted or renamed strategies) that have no matching strategy definition, and delete the ones you select.',
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
            '削除は元に戻せません。また、孤児は必ずしも不要なデータではありません（strategy delete は --with-results を付けない限り結果を意図的に残します）。削除前に内容をよく確認してください。',
            'Deletion cannot be undone. Orphans are not necessarily unwanted data — strategy delete intentionally keeps results unless run with --with-results. Review carefully before deleting.',
          )}
        </p>
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
        {loading && <Loading label={L('読み込み中…', 'Loading…')} />}

        {error && (
          <ErrorBanner message={error} retryLabel={L('再試行', 'Retry')} onRetry={onRetry} />
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
                triggerLabel={L(
                  `選択した ${selectedIds.length} 件（${selectedMb} MB）を削除`,
                  `Delete ${selectedIds.length} selected (${selectedMb} MB)`,
                )}
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
