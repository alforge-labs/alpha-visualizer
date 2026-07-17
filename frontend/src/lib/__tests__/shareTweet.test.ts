import { describe, expect, it } from 'vitest'
import { FUNNEL_URL, buildShareTweetText, xIntentUrl } from '../shareTweet'

/**
 * X 共有インテント（Wave 4 その2）: シェアカード保存と同時に投稿画面を
 * 開き、シェアの摩擦を最小化してバイラルループを実際に回す。
 * ツイート本文の URL には UTM を付け、流入元を計測可能にする。
 */

const INPUT = {
  strategy_id: 'sma_cross_v1',
  symbol: 'SPY',
  timeframe: '1d',
  metrics: {
    total_return_pct: 42.5,
    cagr_pct: 9.31,
    sharpe_ratio: 1.234,
    max_drawdown_pct: -12.7,
    win_rate_pct: 61.5,
  },
  equity: { dates: [], values: [] },
}

describe('buildShareTweetText', () => {
  it('includes strategy, symbol/timeframe, headline metrics and the UTM-tagged funnel URL', () => {
    const text = buildShareTweetText(INPUT, 'ja')
    expect(text).toContain('sma_cross_v1')
    expect(text).toContain('SPY 1d')
    expect(text).toContain('+42.50%')
    expect(text).toContain('1.23')
    expect(text).toContain('Backtested with AlphaForge')
    // 計測用 UTM 付き URL（本文の末尾）
    expect(text.split('\n').at(-1)).toBe(FUNNEL_URL)
    expect(FUNNEL_URL).toBe(
      'https://alforgelabs.com/?utm_source=x&utm_medium=share_card',
    )
  })

  it('renders english copy for lang=en', () => {
    const text = buildShareTweetText(INPUT, 'en')
    expect(text).toContain('Return +42.50%')
    expect(text).toContain('Sharpe 1.23')
  })
})

describe('xIntentUrl', () => {
  it('builds the x.com post intent with the text URL-encoded', () => {
    const url = xIntentUrl('hello #world\nhttps://a.b')
    expect(url.startsWith('https://x.com/intent/post?text=')).toBe(true)
    expect(url).toContain(encodeURIComponent('#world'))
    expect(url).not.toContain('\n')
  })
})
