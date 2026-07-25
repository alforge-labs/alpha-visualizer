import type { CSSProperties, ReactElement } from 'react'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import type { LivePosition } from '../../api/types'
import { Card } from '../../design/primitives'
import { fmtDiff, fmtNumber, fmtPercent } from '../../lib/format'
import { diffTone, toneColor } from './format'

interface Props {
  /** 建玉スナップショット（0 件 = ノーポジション）。 */
  positions: LivePosition[]
  /** 現金残高。 */
  cash: number
  /** 建玉評価額 + 現金の合計（呼び出し側で算出済みの値をそのまま表示する）。 */
  totalValue: number
  lang: Lang
}

const TH_BASE: CSSProperties = {
  fontFamily: 'var(--serif)',
  fontSize: '0.875rem',
  fontWeight: 600,
  color: 'var(--text2)',
  letterSpacing: '-0.005em',
  textAlign: 'right',
  padding: '10px 14px',
  borderBottom: '1px solid var(--border-strong)',
  whiteSpace: 'nowrap',
}

const TD_BASE: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 'var(--fs-mono-md)',
  letterSpacing: 'var(--tracking-mono)',
  textAlign: 'right',
  padding: '10px 14px',
  borderBottom: '1px solid var(--border)',
}

const TD_LABEL: CSSProperties = {
  ...TD_BASE,
  textAlign: 'left',
  paddingLeft: 20,
}

/** 建玉を持たない合計行向けのプレースホルダ（0 と紛れないよう em dash）。 */
const DASH = '—'

/**
 * Live ページの現在建玉テーブル（issue: Live equity リッチ化 Task 12）。
 *
 * `unrealized_pnl` / `unrealized_pnl_pct` は cost basis が解決できないポジションで
 * backend が `null` を返す（意図的な設計）。`fmtNumber` / `fmtDiff` の既定
 * fallback（em dash）にそのまま委ね、`?? 0` 等で 0 に丸めないこと。
 *
 * これらの数値はブローカー口座の直接照会ではなく、イベントログの再構築値
 * （replay）であるため、`positions-caveat` で必ずその旨を明示する。
 */
export function LivePositionsTable({
  positions,
  cash,
  totalValue,
  lang,
}: Props): ReactElement {
  const L = makeL(lang)
  const positionsSubtotal = positions.reduce((sum, p) => sum + p.market_value, 0)
  // 現金の構成比 = 現金 / 合計。design doc の「現状は資産の約 90% が現金」を
  // 可視化する目的の列なので、現金行だけ dash のままにしない。
  // totalValue が 0（または未初期化）のときは fmtPercent が
  // Number.isFinite チェックで自動的に dash にフォールバックするが、
  // 意図を明示するためガードも明示的に書く。
  const cashWeightPct = totalValue > 0 ? (cash / totalValue) * 100 : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Card pad={false} style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead style={{ background: 'var(--surface-2)' }}>
              <tr>
                <th style={{ ...TH_BASE, textAlign: 'left', paddingLeft: 20, fontFamily: 'var(--serif)' }}>
                  {L('銘柄', 'Ticker')}
                </th>
                <th style={TH_BASE}>{L('数量', 'Qty')}</th>
                <th style={TH_BASE}>{L('平均取得', 'Avg Cost')}</th>
                <th style={TH_BASE}>{L('現在値', 'Last')}</th>
                <th style={TH_BASE}>{L('評価額', 'Value')}</th>
                <th style={TH_BASE}>{L('構成比', 'Weight')}</th>
                <th style={TH_BASE}>{L('含み損益（額・%）', 'Unrealized P&L (amt / %)')}</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p, i) => {
                const tone = toneColor(diffTone(p.unrealized_pnl))
                const zebra = i % 2 === 1 ? 'var(--surface-2)' : 'var(--surface)'
                return (
                  <tr key={`${p.ticker}-${p.sub_strategy_id ?? ''}-${i}`} style={{ background: zebra }}>
                    <td style={{ ...TD_LABEL, fontFamily: 'var(--sans)' }}>{p.ticker}</td>
                    <td style={TD_BASE}>{fmtNumber(p.qty)}</td>
                    <td style={TD_BASE}>{fmtNumber(p.avg_cost)}</td>
                    <td style={TD_BASE}>{fmtNumber(p.last_price)}</td>
                    <td style={TD_BASE}>{fmtNumber(p.market_value)}</td>
                    <td style={TD_BASE}>{fmtPercent(p.weight_pct)}</td>
                    <td
                      data-testid={`pnl-cell-${p.ticker}`}
                      style={{ ...TD_BASE, color: tone }}
                    >
                      <div>{fmtDiff(p.unrealized_pnl)}</div>
                      <div style={{ fontSize: 'var(--fs-mono-sm)' }}>
                        {fmtDiff(p.unrealized_pnl_pct, '%')}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--surface-2)' }}>
                <td style={{ ...TD_LABEL, fontWeight: 600 }}>
                  {L('建玉合計', 'Positions Subtotal')}
                </td>
                <td style={TD_BASE}>{DASH}</td>
                <td style={TD_BASE}>{DASH}</td>
                <td style={TD_BASE}>{DASH}</td>
                <td data-testid="positions-subtotal-value" style={{ ...TD_BASE, fontWeight: 600 }}>
                  {fmtNumber(positionsSubtotal)}
                </td>
                <td style={TD_BASE}>{DASH}</td>
                <td style={TD_BASE}>{DASH}</td>
              </tr>
              <tr style={{ background: 'var(--surface-2)' }}>
                <td style={{ ...TD_LABEL, fontWeight: 600 }}>{L('現金', 'Cash')}</td>
                <td style={TD_BASE}>{DASH}</td>
                <td style={TD_BASE}>{DASH}</td>
                <td style={TD_BASE}>{DASH}</td>
                <td data-testid="cash-value" style={{ ...TD_BASE, fontWeight: 600 }}>
                  {fmtNumber(cash)}
                </td>
                <td style={TD_BASE}>{fmtPercent(cashWeightPct)}</td>
                <td style={TD_BASE}>{DASH}</td>
              </tr>
              <tr style={{ background: 'var(--surface-2)', borderTop: '2px solid var(--border-strong)' }}>
                <td style={{ ...TD_LABEL, fontWeight: 700 }}>{L('合計', 'Total')}</td>
                <td style={TD_BASE}>{DASH}</td>
                <td style={TD_BASE}>{DASH}</td>
                <td style={TD_BASE}>{DASH}</td>
                <td data-testid="total-value" style={{ ...TD_BASE, fontWeight: 700 }}>
                  {fmtNumber(totalValue)}
                </td>
                <td style={TD_BASE}>{DASH}</td>
                <td style={TD_BASE}>{DASH}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
      <p
        data-testid="positions-caveat"
        style={{
          fontFamily: 'var(--sans)',
          fontSize: 'var(--fs-caption)',
          color: 'var(--text3)',
          margin: 0,
        }}
      >
        {L(
          'イベントからの再構築値です。ブローカーの実口座残高とは差異が生じることがあります。',
          'Reconstructed from event logs; may differ from the broker account.',
        )}
      </p>
    </div>
  )
}
