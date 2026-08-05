import type { Lang } from '../i18n/strings'

/**
 * ゴールビルダー（issue #489）の文言 SSoT。
 *
 * 自由文でゴールを書けない初中級者向けに、選択式（戦略タイプ + 指標）から
 * エージェントへ渡すゴール文を組み立てる。銘柄はゴール文に含めない —
 * `POST /api/agent/jobs` の `symbol` パラメータとしてプロンプトに別途渡る
 * ため、文とパラメータの二重管理（と食い違い）を避ける。
 */

export type GoalTypeId = 'trend_following' | 'mean_reversion' | 'breakout'

export interface GoalTypeOption {
  id: GoalTypeId
  ja: string
  en: string
}

export const GOAL_TYPES: readonly GoalTypeOption[] = [
  { id: 'trend_following', ja: 'トレンドフォロー（順張り）', en: 'trend-following' },
  { id: 'mean_reversion', ja: '平均回帰（逆張り）', en: 'mean-reversion' },
  { id: 'breakout', ja: 'ブレイクアウト', en: 'breakout' },
]

/**
 * ビルダーで選べる指標。Pine 対応（`analyze indicator list` で ✓）の主要
 * どころに絞る — ここで非対応指標を勧めると、生成した戦略が TradingView へ
 * 持ち出せなくなる（#488 の警告対象になる）。
 */
export const BUILDER_INDICATORS: readonly string[] = [
  'SMA',
  'EMA',
  'RSI',
  'MACD',
  'BBANDS',
  'ATR',
  'ADX',
  'DONCHIAN',
]

/**
 * 選択内容からゴール文を組み立てる。何も選ばれていなければ空文字を返す
 * （呼び出し側はユーザーの自由記述を上書きしないこと）。
 */
export function buildGoalText(
  lang: Lang,
  typeId: GoalTypeId | '',
  indicators: readonly string[],
): string {
  if (typeId === '' && indicators.length === 0) return ''

  const type = GOAL_TYPES.find((t) => t.id === typeId)
  if (lang === 'ja') {
    const parts: string[] = []
    parts.push(
      type != null
        ? `${type.ja}型の投資戦略を新しく作成してください。`
        : '投資戦略を新しく作成してください。',
    )
    if (indicators.length > 0) {
      parts.push(`指標は ${indicators.join('、')} を中心に使ってください。`)
    }
    parts.push(
      'バックテストを実行し、Sharpe レシオができるだけ高くなるようパラメータを調整してください。',
    )
    return parts.join('')
  }

  const parts: string[] = []
  parts.push(
    type != null
      ? `Create a new ${type.en} trading strategy.`
      : 'Create a new trading strategy.',
  )
  if (indicators.length > 0) {
    parts.push(`Focus on these indicators: ${indicators.join(', ')}.`)
  }
  parts.push('Run backtests and tune the parameters to maximize the Sharpe ratio.')
  return parts.join(' ')
}
