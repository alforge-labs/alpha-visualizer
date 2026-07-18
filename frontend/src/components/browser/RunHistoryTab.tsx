import type { StrategyRun } from '../../api/types'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { fmtNumber } from '../../lib/format'
import { RUN_SOURCE_STRATEGY_FILE } from '../../constants/runSource'

interface Props {
  runs: StrategyRun[]
  currentRunId: string
  onSelectRun: (runId: string) => void
  lang: Lang
}

export function RunHistoryTab({ runs, currentRunId, onSelectRun, lang }: Props) {
  const L = makeL(lang)
  return (
    <div data-testid="history-tab" style={{ padding: 16 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text3)', fontSize: 10 }}>{L('実行日時', 'Run Date')}</th>
            <th style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text3)', fontSize: 10 }}>Sharpe</th>
            <th style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text3)', fontSize: 10 }}>Return</th>
            <th style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text3)', fontSize: 10 }}>Max DD</th>
            <th style={{ padding: '6px 10px', width: 80 }}></th>
          </tr>
        </thead>
        <tbody>
          {runs.map(r => {
            const isCurrent = r.run_id === currentRunId
            return (
              <tr key={r.run_id} style={{
                borderBottom: '1px solid var(--border)',
                background: isCurrent ? 'var(--accent-bg)' : 'transparent',
              }}>
                <td style={{ padding: '7px 10px', color: 'var(--text2)' }}>
                  {r.run_at.slice(0, 16).replace('T', ' ')}
                  {r.source === RUN_SOURCE_STRATEGY_FILE && (
                    <span
                      data-testid="run-source-badge"
                      title={L(
                        '定義ファイル直接実行のラン（保存していないパラメータでのチューニング試行など）',
                        'Run executed from a definition file (e.g. tuning trial with unsaved parameters)',
                      )}
                      style={{
                        marginLeft: 6,
                        padding: '1px 5px',
                        borderRadius: 3,
                        border: '1px solid var(--warn)',
                        color: 'var(--warn)',
                        fontSize: 9,
                        fontFamily: 'var(--mono)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {L('試行', 'trial')}
                    </span>
                  )}
                </td>
                <td style={{ padding: '7px 10px', textAlign: 'right', color: r.sharpe_ratio !== null && r.sharpe_ratio >= 1 ? 'var(--success)' : 'var(--warn)', fontWeight: 700 }}>
                  {/* issue #266: 数値整形を SSoT（fmtNumber）経由へ統一 */}
                  {fmtNumber(r.sharpe_ratio, { decimals: 2 })}
                </td>
                <td style={{ padding: '7px 10px', textAlign: 'right', color: (r.total_return_pct ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {fmtNumber(r.total_return_pct, { decimals: 1, sign: true, suffix: '%' })}
                </td>
                <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--danger)' }}>
                  {fmtNumber(r.max_drawdown_pct, { decimals: 1, suffix: '%' })}
                </td>
                <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                  {isCurrent ? (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--success)' }}>● {L('表示中', 'Current')}</span>
                  ) : (
                    <button
                      onClick={() => onSelectRun(r.run_id)}
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 3, padding: '2px 8px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', cursor: 'pointer' }}
                    >{L('表示', 'View')}</button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
