/**
 * i18n ヘルパ。
 *
 * 2 つの API を並走させて段階的に移行する（Issue #117 / #151）。
 *
 * 1. **既存形式**: `makeL(lang)('日本語', 'English')` または
 *    `L(lang, '日本語', 'English')`
 *    - その場で両言語を見られて key 名を考えずに済む
 *    - 多くの既存コードはこちら
 *
 * 2. **STRINGS map ベース**: `makeT(lang)('common.loading')` または
 *    `t(lang, 'common.loading')`
 *    - 翻訳作業を中央集約できる
 *    - 第三言語追加が楽
 *    - 同じ意味の文字列で訳がブレない
 *    - 重複出現する短い文字列（「読み込み中…」「キャンセル」等）から
 *      段階的に移行する
 */

export type Lang = 'ja' | 'en'

// ===== 既存形式（保持） =====

export function L(lang: Lang, ja: string, en: string): string {
  return lang === 'ja' ? ja : en
}

export function makeL(lang: Lang) {
  return (ja: string, en: string): string => L(lang, ja, en)
}

// ===== STRINGS map ベース（新規） =====

/**
 * 共通文字列辞書。**重複利用が多い・訳のブレが起きやすい** ものを
 * ここに集約する。
 *
 * key の命名規約: `<scope>.<term>` (lowerCamel)。
 *  - scope: `common` / `detail` / `compare` / `ideas` 等
 *  - term: `loading` / `noData` / `cancel` 等
 */
export const STRINGS = {
  // --- common ---
  'common.loading': { ja: '読み込み中…', en: 'Loading…' },
  'common.cancel': { ja: 'キャンセル', en: 'Cancel' },
  'common.save': { ja: '保存', en: 'Save' },
  'common.close': { ja: '閉じる', en: 'Close' },
  'common.noData': { ja: 'データがありません', en: 'No data' },
  'common.error': { ja: 'エラー', en: 'Error' },
  'common.retry': { ja: '再試行', en: 'Retry' },
  'common.delete': { ja: '削除', en: 'Delete' },

  // --- detail tabs (DetailPage の no-data 表示) ---
  'detail.noBacktest': {
    ja: 'バックテスト結果が見つかりません',
    en: 'No backtest result found',
  },
  'detail.noWfo': {
    ja: 'この戦略にはウォークフォワード（WFO）データがありません',
    en: 'No walk-forward (WFO) data for this strategy',
  },
  'detail.noOptimize': {
    ja: 'この戦略には最適化（Optimize）データがありません',
    en: 'No optimization data for this strategy',
  },
  'detail.noHistory': { ja: '実行履歴がありません', en: 'No run history' },
  'detail.noStrategy': {
    ja: '戦略定義が見つかりません',
    en: 'No strategy definition found',
  },
} as const satisfies Record<string, { ja: string; en: string }>

export type StringKey = keyof typeof STRINGS

/**
 * STRINGS map から key を解決して翻訳済み文字列を返す。
 *
 * @example
 * <Note>{t(lang, 'common.loading')}</Note>
 */
export function t(lang: Lang, key: StringKey): string {
  return STRINGS[key][lang]
}

/**
 * lang を束縛した翻訳 helper を返す（コンポーネント内で使用）。
 *
 * @example
 * const T = makeT(lang)
 * return <Note>{T('common.loading')}</Note>
 */
export function makeT(lang: Lang) {
  return (key: StringKey): string => t(lang, key)
}
