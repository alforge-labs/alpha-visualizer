import { describe, expect, it } from 'vitest'
import {
  FUNNEL_URL,
  TWEET_WEIGHTED_LIMIT,
  buildCompareShareTweetText,
  buildLiveShareTweetText,
  buildShareTweetText,
  weightedTweetLength,
  xIntentUrl,
} from '../shareTweet'

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

describe('weightedTweetLength', () => {
  it('counts ASCII as 1 and CJK as 2 (X の加重文字数換算)', () => {
    expect(weightedTweetLength('abc')).toBe(3)
    expect(weightedTweetLength('あいう')).toBe(6)
    expect(weightedTweetLength('aあ')).toBe(3)
  })
})

describe('tweet length guard (280 weighted)', () => {
  it('truncates an over-long headline so the whole tweet stays within the limit', () => {
    // 生成系の長尺 strategy_id でも投稿画面がプリフィル超過にならないことを保証。
    // URL は X 側で一律 23 文字換算されるため、実文字数でなく加重で検証する。
    const long = {
      strategy_id: '長い戦略名'.repeat(40), // 加重 400 相当
      symbol: 'GBPUSD',
      timeframe: '1h',
      metrics: {
        total_return_pct: 1.2,
        cagr_pct: 1,
        sharpe_ratio: 0.5,
        max_drawdown_pct: -2,
        win_rate_pct: 50,
      },
      equity: { dates: [], values: [] },
    }
    const text = buildShareTweetText(long, 'ja')
    const lines = text.split('\n')
    expect(lines.at(-1)).toBe(FUNNEL_URL)
    expect(lines[0]?.endsWith('…')).toBe(true)
    const withoutUrl = lines.slice(0, -1).join('\n')
    // URL(23) + 改行(1) を除いた残り予算に収まっている
    expect(weightedTweetLength(withoutUrl)).toBeLessThanOrEqual(
      TWEET_WEIGHTED_LIMIT - 23 - 1,
    )
  })

  it('leaves a short headline untouched', () => {
    const text = buildShareTweetText(INPUT, 'ja')
    expect(text).not.toContain('…')
  })

  it('truncates at code-point boundaries (no lone surrogates from emoji)', () => {
    // サロゲートペアを UTF-16 単位で分断すると encodeURIComponent が
    // throw して X 共有ボタンごとクラッシュする。コードポイント単位の
    // 切り詰めであることを絵文字連打の全境界相当で固定化する。
    const emoji = { ...INPUT, strategy_id: '📈'.repeat(300) }
    const text = buildShareTweetText(emoji, 'ja')
    expect(text).toContain('…')
    // 孤立サロゲートが無い（= URL エンコードが成功する）
    expect(() => xIntentUrl(text)).not.toThrow()
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text)).toBe(false)
  })
})

describe('buildCompareShareTweetText', () => {
  const STRATS = [
    { name: 'sma_v1', total_return_pct: 12.3, sharpe_ratio: 0.8 },
    { name: 'rsi_v1', total_return_pct: 8.0, sharpe_ratio: 1.9 },
    { name: 'macd_v1', total_return_pct: -4.2, sharpe_ratio: null },
  ]

  it('highlights the best-sharpe strategy (CompareScreen の Winner と同じ規約)', () => {
    const text = buildCompareShareTweetText(STRATS, 'SPY', 'ja')
    expect(text).toContain('SPY')
    expect(text).toContain('3 戦略')
    expect(text).toContain('rsi_v1')
    expect(text).toContain('+8.00%')
    expect(text).toContain('1.90')
    expect(text.split('\n').at(-1)).toBe(FUNNEL_URL)
  })

  it('renders english copy for lang=en', () => {
    const text = buildCompareShareTweetText(STRATS, 'SPY', 'en')
    expect(text).toContain('Compared 3 strategies on SPY')
    expect(text).toContain('rsi_v1')
  })
})

describe('buildLiveShareTweetText', () => {
  it('builds paper-trading copy with live metrics', () => {
    const text = buildLiveShareTweetText(
      {
        strategy_id: 'beat_qqq_hedged_v1',
        metrics: { total_return_pct: 5.4, sharpe_ratio: 1.31 },
      },
      'ja',
    )
    expect(text).toContain('beat_qqq_hedged_v1')
    expect(text).toContain('ペーパートレード実績')
    expect(text).toContain('+5.40%')
    expect(text).toContain('1.31')
    expect(text.split('\n').at(-1)).toBe(FUNNEL_URL)
  })

  it('tolerates missing metrics (— placeholders)', () => {
    const text = buildLiveShareTweetText({ strategy_id: 's1', metrics: null }, 'en')
    expect(text).toContain('paper trading live record')
    expect(text).toContain('—')
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
