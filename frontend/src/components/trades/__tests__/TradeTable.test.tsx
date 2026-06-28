import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import type { Trade } from '../../../api/types'
import { TradeTable } from '../TradeTable'

/**
 * issue #264: テーマトークン非依存のハードコード色（白アルファのゼブラ/罫線、
 * 緑/琥珀の方向バッジ）を一掃し、ライト/ダーク両テーマで可視・パレット調和を保つ。
 * 白アルファは特にライト（クリーム）テーマでほぼ不可視になるため、トークン参照を強制する。
 */
const trades = [
  { id: 1, direction: 'long', entry_date: '2025-01-01', exit_date: '2025-01-05', holding_days: 4, return_pct: 2.5, pnl: 250, mae_pct: -1, mfe_pct: 3 },
  { id: 2, direction: 'short', entry_date: '2025-01-06', exit_date: '2025-01-09', holding_days: 3, return_pct: -1.2, pnl: -120, mae_pct: -2, mfe_pct: 1 },
] as unknown as Trade[]

describe('TradeTable tokenized colors (issue #264)', () => {
  it('uses design tokens for zebra/border instead of white-alpha rgba', () => {
    const { container } = render(<TradeTable trades={trades} lang="ja" />)
    const html = container.innerHTML
    // ライトテーマで不可視になる白アルファ直書きが残っていないこと
    expect(html).not.toContain('rgba(255,255,255')
    // ゼブラ（奇数行）と罫線がトークンを参照していること
    expect(html).toContain('var(--surface-2)')
    expect(html).toContain('var(--border)')
  })

  it('uses success/warn tokens for direction badges instead of hardcoded green/amber', () => {
    const { container } = render(<TradeTable trades={trades} lang="ja" />)
    const html = container.innerHTML
    expect(html).not.toContain('rgba(0,228,154')
    expect(html).not.toContain('rgba(245,166,35')
    // getAttribute('style') は jsdom CSSOM を経由しないため color-mix を保持する
    expect(screen.getByText('long').getAttribute('style')).toContain('var(--success)')
    expect(screen.getByText('short').getAttribute('style')).toContain('var(--warn)')
  })
})
