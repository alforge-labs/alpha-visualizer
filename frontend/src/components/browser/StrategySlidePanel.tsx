import { Link } from 'react-router-dom'
import type { StrategyListItem } from '../../api/types'
import { useRunBacktest, useStrategyRuns } from '../../hooks/useBacktestData'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { Button, Chip, Divider, Stat } from '../../design/primitives'

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

function returnTone(v: number | null | undefined): 'positive' | 'negative' | 'neutral' {
  if (v == null) return 'neutral'
  return v >= 0 ? 'positive' : 'negative'
}

function sharpeTone(v: number | null | undefined): 'positive' | 'warning' | 'negative' | 'neutral' {
  if (v == null) return 'neutral'
  if (v >= 1.5) return 'positive'
  if (v >= 1.0) return 'warning'
  return 'negative'
}

export function StrategySlidePanel({ strategy: s, onClose, lang }: Props): React.ReactElement {
  const L = makeL(lang)
  const runs = useStrategyRuns(s.strategy_id)
  const recentRuns = runs.status === 'ready' ? runs.data.slice(0, 3) : []
  const { run, running, error: runError } = useRunBacktest()

  const handleRun = async (): Promise<void> => {
    if (!s.symbol || !s.timeframe) return
    if (s.last_run_at !== null) {
      const ok = window.confirm(
        lang === 'ja'
          ? '再実行すると最新結果が上書きされます。続けますか？'
          : 'Re-running will overwrite the latest result. Continue?',
      )
      if (!ok) return
    }
    const success = await run(s.strategy_id, s.symbol, s.timeframe)
    if (success) window.location.reload()
  }

  return (
    <aside
      style={{
        width: 380,
        flexShrink: 0,
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

      <div style={{ padding: '0 var(--space-5) var(--space-4)' }}>
        <Button
          variant="primary"
          size="sm"
          onClick={handleRun}
          disabled={running || !s.symbol || !s.timeframe}
        >
          {running ? L('実行中…', 'Running…') : L('バックテスト実行', 'Run backtest')}
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
      </div>

      <Divider />

      {/* メトリクス 4 セル */}
      <section
        style={{
          padding: 'var(--space-5)',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--space-4)',
        }}
      >
        <Stat
          label="Sharpe"
          value={s.latest_sharpe != null ? s.latest_sharpe.toFixed(2) : '—'}
          tone={sharpeTone(s.latest_sharpe)}
          size="lg"
        />
        <Stat
          label={L('リターン', 'Return')}
          value={s.latest_return_pct != null ? `${s.latest_return_pct.toFixed(1)}%` : '—'}
          tone={returnTone(s.latest_return_pct)}
          size="lg"
        />
        <Stat
          label="Max DD"
          value={s.latest_max_drawdown_pct != null ? `${s.latest_max_drawdown_pct.toFixed(1)}%` : '—'}
          tone={s.latest_max_drawdown_pct != null ? 'negative' : 'neutral'}
          size="lg"
        />
        <Stat
          label="Win %"
          value={s.latest_win_rate_pct != null ? `${s.latest_win_rate_pct.toFixed(1)}%` : '—'}
          tone="neutral"
          size="lg"
        />
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

      <div style={{ marginTop: 'auto' }}>
        <Divider />
        <div style={{ padding: 'var(--space-4) var(--space-5)' }}>
          <Link
            to={`/detail/${s.strategy_id}`}
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 'var(--fs-body)',
              fontWeight: 600,
              color: 'var(--accent)',
              textDecoration: 'none',
            }}
          >
            {L('フル詳細を開く →', 'Open full detail →')}
          </Link>
        </div>
      </div>
    </aside>
  )
}
