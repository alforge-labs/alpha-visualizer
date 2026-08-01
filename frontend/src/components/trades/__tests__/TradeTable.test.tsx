import { fireEvent, render, screen } from '@testing-library/react'
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

/**
 * issue #266: 数値整形を SSoT（lib/format.fmtNumber）経由へ統一し、桁区切りを効かせる。
 * 直書き toFixed では 1000 以上の P&L が "1250.0" と区切り無しで読みにくかった。
 */
describe('TradeTable number formatting via SSoT (issue #266)', () => {
  const bigTrade = [
    { id: 1, direction: 'long', entry_date: '2025-01-01', exit_date: '2025-01-05', holding_days: 4, return_pct: 2.5, pnl: 1250, mae_pct: -1, mfe_pct: 3 },
  ] as unknown as Trade[]

  it('groups thousands in P&L and keeps the explicit + sign', () => {
    render(<TradeTable trades={bigTrade} lang="ja" />)
    // 桁区切り + 正の符号（color 列なので '+'）。issue #359: 整数は小数なし
    expect(screen.getByText('+1,250')).toBeInTheDocument()
  })
})

/**
 * issue #362: P&L 列が裸の数値で、通貨の前提が UI のどこにも無かった。
 * 金額列が口座通貨建てであることをテーブルの注記で示す。
 */
describe('TradeTable currency note (issue #362)', () => {
  const one = [
    { id: 1, direction: 'long', entry_date: '2025-01-01', exit_date: '2025-01-05', holding_days: 4, return_pct: 2.5, pnl: 100, mae_pct: -1, mfe_pct: 3 },
  ] as unknown as Trade[]

  it('金額列が口座通貨建てである注記を表示する', () => {
    render(<TradeTable trades={one} lang="ja" />)
    expect(screen.getByText(/口座通貨/)).toBeInTheDocument()
  })
})


/**
 * issue #371: 取引一覧にフィルタ・検索が無く、ページサイズ 15 固定のため
 * 2,000 取引超の run では 100 ページ以上を手送りするしかなかった。
 * 方向・勝敗チップ、期間範囲、ページサイズ選択、ページャの aria-label を追加。
 */
describe('TradeTable filters & paging (issue #371)', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({
    id: i + 1,
    direction: i % 2 === 0 ? 'long' : 'short',
    entry_date: `2025-01-${String((i % 28) + 1).padStart(2, '0')}`,
    exit_date: '2025-02-01',
    holding_days: 5,
    return_pct: i % 4 === 0 ? -2 : 1.5,
    pnl: i % 4 === 0 ? -20 : 15,
    mae_pct: -1,
    mfe_pct: 2,
  })) as unknown as Trade[]

  it('方向チップでショートだけに絞り込める', () => {
    render(<TradeTable trades={many} lang="ja" />)
    fireEvent.click(screen.getByRole('button', { name: 'ショート' }))
    expect(screen.queryAllByText('long').length).toBe(0)
    expect(screen.getAllByText('short').length).toBeGreaterThan(0)
  })

  it('勝敗チップで負けだけに絞り込め、絞り込み件数が見える', () => {
    render(<TradeTable trades={many} lang="ja" />)
    fireEvent.click(screen.getByRole('button', { name: '負け' }))
    expect(screen.getByText(/5 \/ 20 件/)).toBeInTheDocument()
  })

  it('期間（エントリー日）で絞り込める', () => {
    render(<TradeTable trades={many} lang="ja" />)
    fireEvent.change(screen.getByLabelText('開始日'), { target: { value: '2025-01-10' } })
    fireEvent.change(screen.getByLabelText('終了日'), { target: { value: '2025-01-12' } })
    expect(screen.getByText(/3 \/ 20 件/)).toBeInTheDocument()
  })

  it('ページサイズを変更でき、ページャに aria-label がある', () => {
    render(<TradeTable trades={many} lang="ja" />)
    expect(screen.getByRole('button', { name: '前のページ' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '次のページ' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: /ページサイズ/ }), {
      target: { value: '50' },
    })
    // 20 件が 1 ページに収まりページャが消える
    expect(screen.queryByRole('button', { name: '次のページ' })).not.toBeInTheDocument()
  })
})
