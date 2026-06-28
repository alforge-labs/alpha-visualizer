import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Loading, Skeleton } from '../Loading'

/**
 * issue #266: 一律「Loading…」テキストを共有スケルトンへ置換し、
 * 描画前にレイアウト領域を確保して CLS（レイアウトシフト）を抑える。
 */
describe('Skeleton (issue #266)', () => {
  it('renders an aria-hidden placeholder that reserves the requested box', () => {
    render(<Skeleton width={120} height={26} />)
    const el = screen.getByTestId('skeleton')
    expect(el).toHaveAttribute('aria-hidden', 'true')
    expect(el.style.width).toBe('120px')
    expect(el.style.height).toBe('26px')
  })
})

describe('Loading (issue #266)', () => {
  it('exposes an accessible live status region with the provided label', () => {
    render(<Loading label="読み込み中…" />)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
    // ラベルは SR 向けに読み上げ可能であること
    expect(status).toHaveTextContent('読み込み中…')
  })

  it('renders skeleton placeholders (not bare text) to reserve layout', () => {
    render(<Loading label="Loading…" rows={4} />)
    expect(screen.getAllByTestId('skeleton')).toHaveLength(4)
  })

  it('reserves full viewport height when fullPage (route fallback CLS)', () => {
    render(<Loading label="Loading…" fullPage />)
    expect(screen.getByRole('status').style.minHeight).toBe('100vh')
  })
})
