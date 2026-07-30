import { api } from '../../api/client'
import type { BacktestDetail, BacktestMetrics } from '../../api/types'
import { useFetchByKey } from '../../hooks/useFetchByKey'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { fmtNumber } from '../../lib/format'
import { CompareEquityTV } from '../../charts/tv/CompareEquityTV'
import { useChartTheme } from '../../design/useChartTheme'

interface Props {
  /** 比較の基準（選択順で 1 つ目・equity 重ね描きの baseline） */
  runIdA: string
  runIdB: string
  lang: Lang
  onClear: () => void
}

interface DiffRow {
  key: keyof BacktestMetrics
  label: string
  labelEn: string
  decimals: number
  suffix: string
  /** 改善方向。'lower' は絶対値の減少を改善とみなす（Max DD） */
  betterWhen: 'higher' | 'lower'
}

// チューニング前後の効果検証で見る主要指標（Run History の 3 指標 + 標準セット）
const DIFF_ROWS: DiffRow[] = [
  { key: 'sharpe_ratio', label: 'Sharpe', labelEn: 'Sharpe', decimals: 2, suffix: '', betterWhen: 'higher' },
  { key: 'total_return_pct', label: '総リターン', labelEn: 'Total Return', decimals: 1, suffix: '%', betterWhen: 'higher' },
  { key: 'cagr_pct', label: 'CAGR', labelEn: 'CAGR', decimals: 1, suffix: '%', betterWhen: 'higher' },
  { key: 'max_drawdown_pct', label: '最大DD', labelEn: 'Max DD', decimals: 1, suffix: '%', betterWhen: 'lower' },
  { key: 'win_rate_pct', label: '勝率', labelEn: 'Win%', decimals: 1, suffix: '%', betterWhen: 'higher' },
  { key: 'profit_factor', label: 'PF', labelEn: 'PF', decimals: 2, suffix: '', betterWhen: 'higher' },
  { key: 'sortino_ratio', label: 'ソルティノ', labelEn: 'Sortino', decimals: 2, suffix: '', betterWhen: 'higher' },
  { key: 'calmar_ratio', label: 'カルマー', labelEn: 'Calmar', decimals: 2, suffix: '', betterWhen: 'higher' },
  { key: 'total_trades', label: '取引数', labelEn: 'Trades', decimals: 0, suffix: '', betterWhen: 'higher' },
]

// useFetchByKey の key 形式は useBacktestData と同じ `${a}::${b}` 連結
function fetchComparePair(
  key: string,
): Promise<readonly [BacktestDetail, BacktestDetail]> {
  const [a, b] = key.split('::') as [string, string]
  return Promise.all([api.getBacktest(a), api.getBacktest(b)])
}

function metricValue(m: BacktestMetrics, key: keyof BacktestMetrics): number | null {
  const v = m[key]
  return typeof v === 'number' ? v : null
}

/** Δ の改善/悪化トーン。Max DD は絶対値の減少を改善として扱う */
function deltaTone(row: DiffRow, a: number, b: number): string {
  const delta = row.betterWhen === 'lower' ? Math.abs(a) - Math.abs(b) : b - a
  if (delta > 0) return 'var(--success)'
  if (delta < 0) return 'var(--danger)'
  return 'var(--text3)'
}

/**
 * 同一戦略の 2 run を並べる比較ビュー（issue #369）。
 *
 * チューニングループ（パラメータ変更 → 再実行）の前後で「どの指標が
 * どれだけ動いたか」を metrics 差分テーブル + equity 重ね描きで示す。
 * `GET /api/results/{run_id}` を 2 回取得するだけのフロント完結実装。
 */
export function RunCompareView({ runIdA, runIdB, lang, onClear }: Props) {
  const L = makeL(lang)
  const theme = useChartTheme()
  const state = useFetchByKey(`${runIdA}::${runIdB}`, fetchComparePair)

  const headCellStyle = {
    padding: '6px 10px',
    textAlign: 'right',
    color: 'var(--text3)',
    fontSize: 10,
  } as const

  return (
    <div
      data-testid="run-compare-view"
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface)',
        padding: 16,
        marginBottom: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 'var(--fs-caption)',
            fontWeight: 600,
            color: 'var(--text3)',
            letterSpacing: 'var(--tracking-caption)',
            textTransform: 'uppercase',
          }}
        >
          {L('Run 比較（B − A の差分）', 'Compare runs (Δ = B − A)')}
        </span>
        <button
          onClick={onClear}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 3,
            padding: '2px 8px',
            fontFamily: 'var(--mono)',
            fontSize: 10,
            color: 'var(--text2)',
            cursor: 'pointer',
          }}
        >
          {L('選択を解除', 'Clear selection')}
        </button>
      </div>

      {state.status === 'loading' && (
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)' }}>
          {L('読み込み中…', 'Loading…')}
        </span>
      )}
      {(state.status === 'error' || state.status === 'no_data') && (
        <span role="alert" style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--danger)' }}>
          {L(
            '比較データの取得に失敗しました。再度お試しください。',
            'Failed to load comparison data. Please try again.',
          )}
        </span>
      )}
      {state.status === 'ready' && (() => {
        const [a, b] = state.data
        return (
        <>
          <table
            data-testid="run-compare-table"
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontFamily: 'var(--mono)',
              fontSize: 13,
            }}
          >
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ ...headCellStyle, textAlign: 'left' }}>{L('指標', 'Metric')}</th>
                <th style={headCellStyle}>A: {a.run_at.slice(0, 16).replace('T', ' ')}</th>
                <th style={headCellStyle}>B: {b.run_at.slice(0, 16).replace('T', ' ')}</th>
                <th style={headCellStyle}>Δ</th>
              </tr>
            </thead>
            <tbody>
              {DIFF_ROWS.map((row) => {
                const va = metricValue(a.metrics, row.key)
                const vb = metricValue(b.metrics, row.key)
                const delta = va !== null && vb !== null ? vb - va : null
                return (
                  <tr key={row.key} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 10px', color: 'var(--text2)' }}>
                      {L(row.label, row.labelEn)}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text)' }}>
                      {fmtNumber(va, { decimals: row.decimals, suffix: row.suffix })}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text)' }}>
                      {fmtNumber(vb, { decimals: row.decimals, suffix: row.suffix })}
                    </td>
                    <td
                      data-testid={`delta-${row.key}`}
                      style={{
                        padding: '6px 10px',
                        textAlign: 'right',
                        fontWeight: 700,
                        color:
                          va !== null && vb !== null
                            ? deltaTone(row, va, vb)
                            : 'var(--text3)',
                      }}
                    >
                      {delta !== null
                        ? fmtNumber(delta, {
                            decimals: row.decimals,
                            sign: true,
                            suffix: row.suffix,
                          })
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <CompareEquityTV
            lang={lang}
            height={280}
            series={[
              {
                id: a.run_id,
                label: `A: ${a.run_at.slice(0, 10)}`,
                values: a.equity.values,
                dates: a.equity.dates,
                color: theme.series[0] ?? 'var(--text2)',
                isBaseline: true,
              },
              {
                id: b.run_id,
                label: `B: ${b.run_at.slice(0, 10)}`,
                values: b.equity.values,
                dates: b.equity.dates,
                color: theme.series[1] ?? 'var(--text2)',
                isBaseline: false,
              },
            ]}
          />
        </>
        )
      })()}
    </div>
  )
}
