import type { Lang } from '../i18n/strings'
import { L } from '../i18n/strings'
import { fmtPercent, fmtSharpe } from './format'
import type { LiveShareInput, ShareCardInput } from './shareCard'

/**
 * X 共有インテント（Wave 4〜5）。
 *
 * シェアカード PNG の保存と同時に X の投稿画面を開き、シェアの摩擦を
 * 最小化する（画像はユーザーが投稿画面で手動添付する。X の intent API は
 * 画像の事前添付をサポートしない）。本文末尾の URL に UTM を付け、
 * シェア経由の流入を計測可能にする。
 */

export const FUNNEL_URL = 'https://alforgelabs.com/?utm_source=x&utm_medium=share_card'

/** X の投稿上限（加重文字数換算）。 */
export const TWEET_WEIGHTED_LIMIT = 280

/** X は URL を長さによらず一律 23 文字換算（t.co 短縮）する。 */
const URL_WEIGHT = 23

const BRAND_LINE = 'Backtested with AlphaForge'

/**
 * X の加重文字数換算の近似: CJK 系ブロック（漢字・かな・ハングル・全角）は
 * 2、それ以外は 1 として数える。
 */
export function weightedTweetLength(text: string): number {
  let total = 0
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    const isWide =
      (cp >= 0x1100 && cp <= 0x11ff) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe4f) ||
      (cp >= 0xff00 && cp <= 0xffe6)
    total += isWide ? 2 : 1
  }
  return total
}

/** 加重文字数が maxWeighted に収まるまで末尾を削って「…」を付ける。 */
function truncateToWeighted(text: string, maxWeighted: number): string {
  if (weightedTweetLength(text) <= maxWeighted) return text
  let t = text
  while (t.length > 0 && weightedTweetLength(`${t}…`) > maxWeighted) {
    t = t.slice(0, -1)
  }
  return `${t}…`
}

/**
 * ヘッドラインを本文予算（280 − URL 23 − ブランド行 − 改行 2）に収めて
 * ブランド行・UTM 付き URL と連結する。
 */
function finalizeTweet(headline: string): string {
  const budget =
    TWEET_WEIGHTED_LIMIT - URL_WEIGHT - weightedTweetLength(BRAND_LINE) - 2
  return `${truncateToWeighted(headline, budget)}\n${BRAND_LINE}\n${FUNNEL_URL}`
}

/** Detail（バックテスト結果）用のツイート本文。 */
export function buildShareTweetText(
  input: Pick<ShareCardInput, 'strategy_id' | 'symbol' | 'timeframe' | 'metrics'>,
  lang: Lang,
): string {
  const m = input.metrics
  const ret = fmtPercent(m.total_return_pct, { decimals: 2, sign: true })
  const sharpe = fmtSharpe(m.sharpe_ratio)
  const headline = L(
    lang,
    `${input.strategy_id} — ${input.symbol} ${input.timeframe} バックテスト: リターン ${ret} / シャープ ${sharpe}`,
    `${input.strategy_id} — ${input.symbol} ${input.timeframe} backtest: Return ${ret} / Sharpe ${sharpe}`,
  )
  return finalizeTweet(headline)
}

/** Compare（複数戦略比較）用のツイート本文。ベストは CompareScreen と同じ最高シャープ。 */
export function buildCompareShareTweetText(
  strategies: ReadonlyArray<{
    name: string
    total_return_pct?: number | null
    sharpe_ratio?: number | null
  }>,
  symbol: string,
  lang: Lang,
): string {
  const winner = strategies.reduce(
    (best, s) =>
      (s.sharpe_ratio ?? -Infinity) > (best?.sharpe_ratio ?? -Infinity) ? s : best,
    strategies[0],
  )
  const ret = fmtPercent(winner?.total_return_pct, { decimals: 2, sign: true })
  const sharpe = fmtSharpe(winner?.sharpe_ratio)
  const headline = L(
    lang,
    `${symbol} で ${strategies.length} 戦略をバックテスト比較 — ベスト: ${winner?.name ?? '—'}（リターン ${ret} / シャープ ${sharpe}）`,
    `Compared ${strategies.length} strategies on ${symbol} — best: ${winner?.name ?? '—'} (Return ${ret} / Sharpe ${sharpe})`,
  )
  return finalizeTweet(headline)
}

/** Live（ペーパートレード実績）用のツイート本文。 */
export function buildLiveShareTweetText(
  input: Pick<LiveShareInput, 'strategy_id' | 'metrics'>,
  lang: Lang,
): string {
  const m = input.metrics ?? {}
  const ret = fmtPercent(m.total_return_pct, { decimals: 2, sign: true })
  const sharpe = fmtSharpe(m.sharpe_ratio)
  const headline = L(
    lang,
    `${input.strategy_id} ペーパートレード実績（ライブ）: リターン ${ret} / シャープ ${sharpe}`,
    `${input.strategy_id} paper trading live record: Return ${ret} / Sharpe ${sharpe}`,
  )
  return finalizeTweet(headline)
}

/** 本文をエンコードして x.com の投稿インテント URL を組み立てる。 */
export function xIntentUrl(text: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`
}

/** 投稿インテントを新規タブで開く（tab-nabbing 防止付き）。 */
export function openXIntent(text: string): void {
  window.open(xIntentUrl(text), '_blank', 'noopener,noreferrer')
}
