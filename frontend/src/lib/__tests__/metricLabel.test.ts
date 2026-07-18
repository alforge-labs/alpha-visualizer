import { describe, expect, it } from 'vitest'
import { metricShortLabel } from '../metricLabel'

/**
 * vis#303: 非 sharpe 指標の WFT 結果を「Sharpe」固定ラベルのまま表示すると
 * 誤ラベルになる。既知指標は短縮名・未知指標は生名・欠損は従来の Sharpe。
 */
describe('metricShortLabel', () => {
  it('maps known metrics to short labels', () => {
    expect(metricShortLabel('sharpe_ratio')).toBe('Sharpe')
    expect(metricShortLabel('calmar_ratio')).toBe('Calmar')
    expect(metricShortLabel('sortino_ratio')).toBe('Sortino')
    expect(metricShortLabel('cagr_pct')).toBe('CAGR')
  })

  it('returns the raw name for unknown metrics (accuracy over prettiness)', () => {
    expect(metricShortLabel('omega_ratio')).toBe('omega_ratio')
  })

  it('falls back to Sharpe when missing (legacy responses)', () => {
    expect(metricShortLabel(undefined)).toBe('Sharpe')
    expect(metricShortLabel(null)).toBe('Sharpe')
    expect(metricShortLabel('')).toBe('Sharpe')
  })
})
