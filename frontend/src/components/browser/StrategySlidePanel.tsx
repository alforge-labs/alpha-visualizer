import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { StrategyListItem } from '../../api/types'
import { useRunBacktest, useStrategyRuns } from '../../hooks/useBacktestData'
import { useSparklineCache } from '../../hooks/useSparklineCache'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { Button, Chip, ConfirmDialog, Divider } from '../../design/primitives'
import { Sparkline } from '../../charts/visx/Sparkline'

interface Props {
  strategy: StrategyListItem
  onClose: () => void
  lang: Lang
}

const SECTION_LABEL: React.CSSProperties = {
  fontFamily: 'var(--sans)',
  fontSize: 'var(--fs-caption)',
  fontWeight: 500,
  color: 'var(--text3)',
  letterSpacing: 'var(--tracking-caption)',
  textTransform: 'uppercase',
}

export function StrategySlidePanel({ strategy: s, onClose, lang }: Props): React.ReactElement {
  const L = makeL(lang)
  // issue #265: 再実行後の更新を全画面リロードでなく実行履歴の再フェッチで行う。
  const [reloadToken, setReloadToken] = useState(0)
  const [confirmRun, setConfirmRun] = useState(false)
  const runs = useStrategyRuns(s.strategy_id, reloadToken)
  const recentRuns = runs.status === 'ready' ? runs.data.slice(0, 5) : []
  const { run, running, error: runError, logTail } = useRunBacktest()
  const sparkline = useSparklineCache()
  const sparkValues = sparkline.entries[s.strategy_id]

  useEffect(() => {
    sparkline.prefetch(s.strategy_id)
  }, [s.strategy_id, sparkline])

  const requestRun = (): void => {
    if (!s.symbol) return
    // 既存結果がある場合のみ上書き確認する（初回実行は確認不要）。
    if (s.last_run_at !== null) {
      setConfirmRun(true)
      return
    }
    void doRun()
  }

  const doRun = async (): Promise<void> => {
    setConfirmRun(false)
    if (!s.symbol) return
    // timeframe は戦略定義由来のため API へは渡さない（issue #291）。
    const success = await run(s.strategy_id, s.symbol)
    // パネルは開いたまま（状態保持）、実行履歴だけを再フェッチして最新化する。
    if (success) setReloadToken((t) => t + 1)
  }

  return (
    <aside
      className="u-drawer-md-down"
      data-open="true"
      data-testid="strategy-slide-panel"
      style={{
        width: 'var(--slidepanel-width)',
        flexShrink: 0,
        alignSelf: 'flex-start',
        position: 'sticky',
        top: 0,
        maxHeight: '100vh',
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      {/* ヘッダー: 戦略名 + 操作 */}
      <header
        style={{
          padding: 'var(--space-5) var(--space-5) var(--space-4)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 'var(--space-3)',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--serif)',
              fontSize: '1.375rem',
              fontWeight: 700,
              color: 'var(--text)',
              letterSpacing: '-0.01em',
              lineHeight: 1.15,
            }}
          >
            {s.name}
          </h2>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {s.symbol ? <Chip>{s.symbol}</Chip> : null}
            {s.timeframe ? <Chip>{s.timeframe}</Chip> : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={L('閉じる', 'Close')}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text3)',
            fontSize: 18,
            lineHeight: 1,
            padding: 4,
          }}
        >
          ✕
        </button>
      </header>

      <div
        style={{
          padding: '0 var(--space-5) var(--space-4)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          flexWrap: 'wrap',
        }}
      >
        <Link
          to={`/detail/${s.strategy_id}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            background: 'var(--accent)',
            color: 'var(--surface)',
            border: '1px solid var(--accent-strong, var(--accent))',
            borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
            fontWeight: 600,
            letterSpacing: 'var(--tracking-mono)',
            textTransform: 'uppercase',
            textDecoration: 'none',
            transition: 'background var(--motion-fast)',
          }}
        >
          {L('フル詳細を開く', 'Open full detail')} →
        </Link>
        <Button
          variant="subtle"
          size="sm"
          onClick={requestRun}
          disabled={running || !s.symbol}
        >
          {running ? L('実行中…', 'Running…') : L('バックテスト再実行', 'Re-run backtest')}
        </Button>
        {runError && (
          <p
            style={{
              marginTop: 12,
              fontFamily: 'var(--mono)',
              fontSize: 'var(--fs-mono-sm)',
              color: 'var(--danger)',
              padding: '8px 12px',
              background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--danger) 24%, transparent)',
              borderRadius: 'var(--radius-sm)',
              letterSpacing: 'var(--tracking-mono)',
            }}
          >
            {runError}
          </p>
        )}
        {logTail && (
          <details style={{ width: '100%', marginTop: 8 }}>
            <summary
              style={{
                cursor: 'pointer',
                fontFamily: 'var(--mono)',
                fontSize: 'var(--fs-mono-sm)',
                color: 'var(--text3)',
                letterSpacing: 'var(--tracking-mono)',
              }}
            >
              {L('実行ログ', 'Run log')}
            </summary>
            <pre
              style={{
                margin: '8px 0 0',
                padding: '8px 12px',
                maxHeight: 180,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                fontFamily: 'var(--mono)',
                fontSize: 'var(--fs-mono-sm)',
                color: 'var(--text2)',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {logTail}
            </pre>
          </details>
        )}
      </div>

      <Divider />

      {/* エクイティ推移（テーブルのミニ Sparkline より大きく表示） */}
      <section style={{ padding: 'var(--space-4) var(--space-5)' }}>
        <div style={SECTION_LABEL}>{L('エクイティ推移', 'Equity curve')}</div>
        <div
          style={{
            marginTop: 'var(--space-3)',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: 'var(--space-3)',
            minHeight: 132,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {Array.isArray(sparkValues) && sparkValues.length >= 2 ? (
            <Sparkline values={sparkValues} width={300} height={108} strokeWidth={1.5} />
          ) : sparkValues === 'loading' ? (
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 'var(--fs-mono-sm)',
                color: 'var(--text3)',
                letterSpacing: 'var(--tracking-mono)',
              }}
            >
              {L('読み込み中…', 'Loading…')}
            </span>
          ) : (
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 'var(--fs-mono-sm)',
                color: 'var(--text3)',
                letterSpacing: 'var(--tracking-mono)',
                textTransform: 'uppercase',
              }}
            >
              {L('データなし', 'No data')}
            </span>
          )}
        </div>
      </section>

      <Divider />

      {/* 実行履歴 */}
      <section style={{ padding: 'var(--space-4) var(--space-5)' }}>
        <div style={SECTION_LABEL}>{L('実行履歴', 'Run history')}</div>
        <div style={{ marginTop: 'var(--space-3)' }}>
          {recentRuns.map((r, idx) => (
            <div
              key={r.run_id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                padding: '10px 0',
                borderTop: idx === 0 ? 'none' : '1px solid var(--border)',
                fontFamily: 'var(--mono)',
                fontSize: 'var(--fs-mono-md)',
                letterSpacing: 'var(--tracking-mono)',
              }}
            >
              <span style={{ color: 'var(--text3)' }}>{r.run_at.slice(0, 10)}</span>
              <span
                style={{
                  color:
                    r.sharpe_ratio !== null && r.sharpe_ratio >= 1
                      ? 'var(--success)'
                      : r.sharpe_ratio !== null
                        ? 'var(--warn)'
                        : 'var(--text3)',
                  fontWeight: 600,
                }}
              >
                {r.sharpe_ratio !== null ? `Sharpe ${r.sharpe_ratio.toFixed(2)}` : '—'}
              </span>
              <span
                style={{
                  color: 'var(--text2)',
                  minWidth: 60,
                  textAlign: 'right',
                }}
              >
                {r.total_return_pct !== null ? `${r.total_return_pct.toFixed(1)}%` : '—'}
              </span>
            </div>
          ))}
          {recentRuns.length === 0 && runs.status === 'ready' && (
            <p
              style={{
                margin: 0,
                fontFamily: 'var(--mono)',
                fontSize: 'var(--fs-mono-sm)',
                color: 'var(--text3)',
                letterSpacing: 'var(--tracking-mono)',
                padding: '8px 0',
              }}
            >
              {L('履歴はありません', 'No runs yet')}
            </p>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={confirmRun}
        title={L('バックテスト再実行', 'Re-run backtest')}
        message={L(
          '再実行すると最新結果が上書きされます。続けますか？',
          'Re-running will overwrite the latest result. Continue?',
        )}
        confirmLabel={running ? L('実行中…', 'Running…') : L('実行', 'Run')}
        cancelLabel={L('やめる', 'Cancel')}
        onConfirm={doRun}
        onCancel={() => setConfirmRun(false)}
        tone="danger"
      />
    </aside>
  )
}
