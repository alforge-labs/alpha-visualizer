import type { Lang } from '../i18n/strings'
import { L } from '../i18n/strings'
import { fmtPercent, fmtSharpe } from './format'
import type { ShareCardInput } from './shareCard'

/**
 * X 共有インテント（Wave 4）。
 *
 * シェアカード PNG の保存と同時に X の投稿画面を開き、シェアの摩擦を
 * 最小化する（画像はユーザーが投稿画面で手動添付する。X の intent API は
 * 画像の事前添付をサポートしない）。本文末尾の URL に UTM を付け、
 * シェア経由の流入を計測可能にする。
 */

export const FUNNEL_URL = 'https://alforgelabs.com/?utm_source=x&utm_medium=share_card'

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
  return `${headline}\nBacktested with AlphaForge\n${FUNNEL_URL}`
}

/** 本文をエンコードして x.com の投稿インテント URL を組み立てる。 */
export function xIntentUrl(text: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`
}
