import type { StrategyRun } from '../../api/types'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'

interface Props {
  runs: StrategyRun[]
  currentRunId: string
  onSelectRun: (runId: string) => void
  lang: Lang
}

export function RunHistoryTab({ runs, currentRunId, onSelectRun, lang }: Props) {
  const L = makeL(lang)
  return (
    <div style={{ padding: 16 }}>
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
                background: isCurrent ? 'rgba(0,228,154,0.06)' : 'transparent',
              }}>
                <td style={{ padding: '7px 10px', color: 'var(--text2)' }}>{r.run_at.slice(0, 16).replace('T', ' ')}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', color: r.sharpe_ratio !== null && r.sharpe_ratio >= 1 ? 'var(--success)' : 'var(--warn)', fontWeight: 700 }}>
                  {r.sharpe_ratio?.toFixed(2) ?? '—'}
                </td>
                <td style={{ padding: '7px 10px', textAlign: 'right', color: (r.total_return_pct ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {r.total_return_pct !== null ? `${r.total_return_pct.toFixed(1)}%` : '—'}
                </td>
                <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--danger)' }}>
                  {r.max_drawdown_pct !== null ? `${r.max_drawdown_pct.toFixed(1)}%` : '—'}
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
