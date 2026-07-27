import type { Recipe } from './recipes'
import { ASSET_CLASS_ORDER, classifySymbol, type AssetClass } from './assetClass'

/**
 * 銘柄ごとのカバレッジ集計。単位は戦略ではなく**レシピ**。
 *
 * 表本体が SP1 でレシピ単位になったため、ここも揃えないと同じ画面で
 * 同じ銘柄が違う数で出る（例: SPY が「87 件」と「51 レシピ」）。
 */
export interface SymbolStat {
  /** 実効銘柄。null = 未割当（定義にも実行結果にも銘柄が無い） */
  symbol: string | null
  assetClass: AssetClass
  /** その銘柄のレシピ数。常に runRecipeCount + unrunRecipeCount と一致する */
  recipeCount: number
  /** 1 件以上の variant がバックテスト済みのレシピ数 */
  runRecipeCount: number
  /** 全 variant が未実行のレシピ数。「次に何を回すか」を答える主指標 */
  unrunRecipeCount: number
  /** 各レシピの best の Sharpe の最大値。実行済みが無ければ null */
  bestSharpe: number | null
  /** 各レシピの best の Return の平均。実行済みが無ければ null */
  avgReturnPct: number | null
  /** 全 variant の最終実行日時の最大値。実行済みが無ければ null */
  lastRunAt: string | null
}

export type SymbolSortKey =
  | 'symbol'
  | 'assetClass'
  | 'recipeCount'
  | 'runRecipeCount'
  | 'unrunRecipeCount'
  | 'bestSharpe'
  | 'avgReturnPct'
  | 'lastRunAt'

export type SymbolSortDir = 'asc' | 'desc'

export const DEFAULT_SYMBOL_SORT_KEY: SymbolSortKey = 'unrunRecipeCount'
export const DEFAULT_SYMBOL_SORT_DIR: SymbolSortDir = 'desc'

/**
 * 並びが決まらないときに順に適用する軸。主キーと重複するものは飛ばす。
 * 方向は主キーの dir に関わらずここで固定する（銘柄名だけ昇順が自然）。
 */
const TIEBREAKS: readonly { key: SymbolSortKey; dir: SymbolSortDir }[] = [
  { key: 'unrunRecipeCount', dir: 'desc' },
  { key: 'recipeCount', dir: 'desc' },
  { key: 'bestSharpe', dir: 'desc' },
  { key: 'symbol', dir: 'asc' },
]

/** 比較用に取り出す値。null は降順で末尾へ沈むよう -Infinity / 空文字にする。 */
function fieldValue(stat: SymbolStat, key: SymbolSortKey): number | string {
  switch (key) {
    case 'symbol':
      return stat.symbol ?? ''
    case 'assetClass':
      // アルファベット順ではなく ASSET_CLASS_ORDER（指数→ETF→個別銘柄→FX→
      // コモディティ→その他）で並べる。表示ラベルは日英で変わるので、
      // 文字列比較にすると言語によって並びが変わってしまう。
      return ASSET_CLASS_ORDER.indexOf(stat.assetClass)
    case 'lastRunAt':
      return stat.lastRunAt ?? ''
    case 'bestSharpe':
      return stat.bestSharpe ?? -Infinity
    case 'avgReturnPct':
      return stat.avgReturnPct ?? -Infinity
    case 'recipeCount':
      return stat.recipeCount
    case 'runRecipeCount':
      return stat.runRecipeCount
    case 'unrunRecipeCount':
      return stat.unrunRecipeCount
  }
}

function compareBy(a: SymbolStat, b: SymbolStat, key: SymbolSortKey, dir: SymbolSortDir): number {
  const va = fieldValue(a, key)
  const vb = fieldValue(b, key)
  let cmp: number
  if (typeof va === 'string' && typeof vb === 'string') {
    cmp = va.localeCompare(vb)
  } else if (typeof va === 'number' && typeof vb === 'number') {
    cmp = va < vb ? -1 : va > vb ? 1 : 0
  } else {
    cmp = 0
  }
  return dir === 'asc' ? cmp : -cmp
}

/**
 * 銘柄別集計を並べ替える。入力は破壊しない。
 *
 * 未割当はどの並べ替えでも末尾に固定する。銘柄が不明な行は「次に回す候補」にも
 * 「成績の比較対象」にもならないため、並べ替えの対象から外す。
 */
export function sortSymbolStats(
  stats: SymbolStat[],
  key: SymbolSortKey,
  dir: SymbolSortDir,
): SymbolStat[] {
  return [...stats].sort((a, b) => {
    if (a.symbol === null && b.symbol !== null) return 1
    if (b.symbol === null && a.symbol !== null) return -1

    const primary = compareBy(a, b, key, dir)
    if (primary !== 0) return primary

    for (const tiebreak of TIEBREAKS) {
      if (tiebreak.key === key) continue
      const cmp = compareBy(a, b, tiebreak.key, tiebreak.dir)
      if (cmp !== 0) return cmp
    }
    return 0
  })
}

/** 1 銘柄分の集計を作る。 */
function buildStat(symbol: string | null, group: Recipe[]): SymbolStat {
  let bestSharpe: number | null = null
  let returnSum = 0
  let returnCount = 0
  let lastRunAt: string | null = null
  let runRecipeCount = 0

  for (const recipe of group) {
    if (recipe.runCount > 0) runRecipeCount += 1

    // 成績指標は best 1 件から。レシピごとに別 variant の最良値を混ぜると、
    // 実在しない戦略の成績を合成表示することになる。
    const best = recipe.best
    if (best != null) {
      if (best.latest_sharpe != null) {
        bestSharpe = bestSharpe == null ? best.latest_sharpe : Math.max(bestSharpe, best.latest_sharpe)
      }
      if (best.latest_return_pct != null) {
        returnSum += best.latest_return_pct
        returnCount += 1
      }
    }

    // 最終実行は「この銘柄を最後にいつ触ったか」なので全 variant から取る。
    // best に絞ると実際より古い日付が出て活動状況を誤って伝える。
    for (const variant of recipe.variants) {
      const runAt = variant.last_run_at
      if (runAt && (lastRunAt == null || runAt > lastRunAt)) lastRunAt = runAt
    }
  }

  return {
    symbol,
    assetClass: symbol == null ? 'other' : classifySymbol(symbol),
    recipeCount: group.length,
    runRecipeCount,
    unrunRecipeCount: group.length - runRecipeCount,
    bestSharpe,
    avgReturnPct: returnCount > 0 ? returnSum / returnCount : null,
    lastRunAt,
  }
}

/**
 * レシピ一覧を銘柄別に集計する。返り値の順序は入力の初出順(未割当のみ末尾)。
 * 並べ替えは `sortSymbolStats` の責務。
 */
export function buildSymbolStats(recipes: Recipe[]): SymbolStat[] {
  const buckets = new Map<string, Recipe[]>()
  const unassigned: Recipe[] = []

  for (const recipe of recipes) {
    // recipe.symbol は buildRecipes が effectiveSymbol で決めた実効銘柄。
    // ここで再度 item.symbol を見てはならない（定義側にしか銘柄が無い戦略が漏れる）。
    const symbol = recipe.symbol
    if (symbol == null) {
      unassigned.push(recipe)
      continue
    }
    const arr = buckets.get(symbol)
    if (arr) arr.push(recipe)
    else buckets.set(symbol, [recipe])
  }

  const out: SymbolStat[] = []
  for (const [symbol, group] of buckets.entries()) out.push(buildStat(symbol, group))
  if (unassigned.length > 0) out.push(buildStat(null, unassigned))
  return out
}
