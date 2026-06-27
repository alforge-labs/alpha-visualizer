import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import type { BacktestMetrics } from '../../../api/types'
import { SignalQualityBadge } from '../SignalQualityBadge'

/** issue #260: 自作プログレスバーに role/aria-value* が無く値が AT に伝わらない。 */
const metrics = {
  statistical_validity: { signal_quality_score: 0.8, is_valid: true },
} as unknown as BacktestMetrics

describe('SignalQualityBadge progress bar (issue #260)', () => {
  it('exposes a progressbar role with aria value range', () => {
    render(<SignalQualityBadge metrics={metrics} lang="ja" />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '80')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
  })
})
