import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ErrorBanner } from '../ErrorBanner'

/**
 * issue #265: fetch 失敗時に再試行導線が無く手動リロード頼みだった。
 * エラー帯に再試行ボタンを併設し、押下で onRetry（=該当データの再フェッチ）を呼ぶ。
 */
describe('ErrorBanner (issue #265)', () => {
  it('shows the message and a retry button that calls onRetry', () => {
    const onRetry = vi.fn()
    render(<ErrorBanner message="データが見つかりません" retryLabel="再試行" onRetry={onRetry} />)
    expect(screen.getByText('データが見つかりません')).toBeInTheDocument()
    fireEvent.click(screen.getByText('再試行'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('exposes an alert role for assistive technology', () => {
    render(<ErrorBanner message="m" retryLabel="r" onRetry={() => {}} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('omits the retry button when onRetry is not provided', () => {
    render(<ErrorBanner message="m" retryLabel="再試行" />)
    expect(screen.queryByText('再試行')).toBeNull()
  })
})
