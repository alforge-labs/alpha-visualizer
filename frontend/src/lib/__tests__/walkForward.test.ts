import { describe, expect, it } from 'vitest'
import type { WFOWindow } from '../../api/types'
import { parseMonth, parseMonthEnd, summarizeWfoWindows } from '../walkForward'

const W = (overrides: Partial<WFOWindow> = {}): WFOWindow => ({
  id: 1,
  label: 'W1',
  is_start: '2024-01',
  is_end: '2024-06',
  oos_start: '2024-07',
  oos_end: '2024-12',
  is_sharpe: 1.0,
  oos_sharpe: 0.5,
  is_return: 5.0,
  oos_return: 2.0,
  oos_is_ratio: 0.5,
  pass: true,
  params: {},
  ...overrides,
})

describe('summarizeWfoWindows', () => {
  it('handles empty windows safely (no NaN)', () => {
    const s = summarizeWfoWindows([])
    expect(s.passCount).toBe(0)
    expect(s.total).toBe(1)  // divide-by-zero 回避のため最低 1
    expect(s.avgRatio).toBe('0.00')
    expect(s.avgIS).toBe('0.00')
    expect(s.avgOOS).toBe('0.00')
  })

  it('counts passes', () => {
    const ws = [W({ pass: true }), W({ pass: false }), W({ pass: true })]
    const s = summarizeWfoWindows(ws)
    expect(s.passCount).toBe(2)
    expect(s.total).toBe(3)
  })

  it('averages metrics with 2-digit fixed string', () => {
    const ws = [
      W({ is_sharpe: 1.0, oos_sharpe: 0.6, oos_is_ratio: 0.6 }),
      W({ is_sharpe: 1.4, oos_sharpe: 0.8, oos_is_ratio: 0.57 }),
    ]
    const s = summarizeWfoWindows(ws)
    expect(s.avgIS).toBe('1.20')
    expect(s.avgOOS).toBe('0.70')
    expect(s.avgRatio).toBe('0.58')  // (0.6 + 0.57) / 2 = 0.585 → toFixed(2) = '0.58' (banker's rounding)
  })
})

describe('parseMonth / parseMonthEnd', () => {
  it('parseMonth returns first day of month', () => {
    const d = parseMonth('2024-03')
    expect(d.getFullYear()).toBe(2024)
    expect(d.getMonth()).toBe(2)  // March = 2
    expect(d.getDate()).toBe(1)
  })

  it('parseMonthEnd returns first day of next month', () => {
    const d = parseMonthEnd('2024-03')
    expect(d.getFullYear()).toBe(2024)
    expect(d.getMonth()).toBe(3)  // April = 3
    expect(d.getDate()).toBe(1)
  })

  it('parseMonthEnd handles December correctly', () => {
    const d = parseMonthEnd('2024-12')
    expect(d.getFullYear()).toBe(2025)
    expect(d.getMonth()).toBe(0)  // January
  })
})
