import { SR_ONLY_STYLE } from './srOnly'

interface ChartDataTableProps {
  /** <summary> に出すラベル（例: "データ表を表示"） */
  label: string
  /** SR 用のテーブル説明（<caption>、視覚的には非表示） */
  caption: string
  columns: readonly string[]
  rows: ReadonlyArray<ReadonlyArray<string | number>>
  /** 行数上限（巨大データのコンテキスト肥大を防ぐ） */
  maxRows?: number
}

/**
 * チャートのテキスト/データ代替（issue #262）。
 * 折りたたみ可能な <details> 内に、scope 付きの簡潔なデータテーブルを描画し、
 * キーボード/スクリーンリーダー利用者が数値を逐次取得できるようにする。
 */
export function ChartDataTable({ label, caption, columns, rows, maxRows = 250 }: ChartDataTableProps) {
  const shown = rows.slice(0, maxRows)
  const truncated = rows.length - shown.length
  return (
    <details style={{ marginTop: 'var(--space-2)' }}>
      <summary
        style={{
          cursor: 'pointer',
          fontFamily: 'var(--mono)',
          fontSize: 'var(--fs-mono-sm)',
          letterSpacing: 'var(--tracking-mono)',
          color: 'var(--text3)',
        }}
      >
        {label}
      </summary>
      <div style={{ maxHeight: 320, overflow: 'auto', marginTop: 'var(--space-2)' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
          }}
        >
          <caption style={SR_ONLY_STYLE}>{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c}
                  scope="col"
                  style={{
                    textAlign: 'right',
                    padding: '4px 8px',
                    color: 'var(--text3)',
                    borderBottom: '1px solid var(--border)',
                    position: 'sticky',
                    top: 0,
                    background: 'var(--surface)',
                  }}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => (
              <tr key={`row-${i}`}>
                {row.map((cell, j) => (
                  <td
                    key={`cell-${i}-${j}`}
                    style={{ textAlign: 'right', padding: '3px 8px', color: 'var(--text2)' }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
            {truncated > 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{ padding: '3px 8px', color: 'var(--text3)', textAlign: 'left' }}
                >
                  … +{truncated}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </details>
  )
}
