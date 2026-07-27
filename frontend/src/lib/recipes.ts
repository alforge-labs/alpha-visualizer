import type { StrategyListItem } from '../api/types'

/**
 * レシピ = 同一の (name, 実効銘柄, timeframe) を持つ戦略群。
 *
 * `/explore-strategies` の反復ランは同じレシピのパラメータ違いを何件も生む
 * （実データでは最大 15 件が完全同名）。1 件ずつ行にすると同じものが並ぶだけ
 * なので、レシピを表示単位にして展開で個別戦略を見せる。
 */
export interface Recipe {
  /** グループ化キー。React の key と展開状態の識別に使う。 */
  key: string
  name: string
  /** 実効銘柄。variants は全員これと一致する。 */
  symbol: string | null
  timeframe: string | null
  /** 属する戦略。latest_sharpe 降順（null は末尾）。 */
  variants: StrategyListItem[]
  /**
   * レシピを代表する 1 件。行に出す指標はすべてこれから取る。
   * `runCount === 0` のときだけ null（不変条件）。
   */
  best: StrategyListItem | null
  variantCount: number
  runCount: number
}

/**
 * 表示・グループ化・絞り込みに使う銘柄を決める。
 *
 * `symbol` は最新バックテストが実際に回した銘柄、`target_symbols[0]` は戦略
 * 定義上の対象銘柄。実行済みなら実際に回した銘柄が真なので、この優先順を
 * 逆にしてはならない。
 *
 * `??` ではなく `||` を使う。API は `None` を返すため通常は `null` だが、空
 * 文字列が来た場合も定義側へ流したい（`??` は空文字列を通してしまう）。
 * `target_symbols` が空配列なら `[0]` は `undefined` になるので最後に
 * `|| null` で正規化する。
 */
export function effectiveSymbol(item: StrategyListItem): string | null {
  return item.symbol || item.target_symbols[0] || null
}

/** バックテストを 1 度でも実行したか。 */
function hasRun(item: StrategyListItem): boolean {
  return item.last_run_at != null && item.last_run_at !== ''
}

/** last_run_at の比較用。null / 空は最も古いものとして扱う。 */
function runStamp(item: StrategyListItem): string {
  return item.last_run_at ?? ''
}

/**
 * レシピを代表する 1 件を選ぶ。
 *
 * 1. `latest_sharpe` が非 null のうち最大。同値なら `last_run_at` が新しい方
 * 2. 全て null なら、実行済みのうち `last_run_at` が最も新しいもの
 * 3. 実行済みが無ければ null
 *
 * 2 段目があるので `best === null` は `runCount === 0` と等価になる。これを
 * 崩すと「実行済みなのに行が未実行に見える」状態が生まれる。
 */
export function pickBestVariant(variants: StrategyListItem[]): StrategyListItem | null {
  let bySharpe: StrategyListItem | null = null
  for (const v of variants) {
    if (v.latest_sharpe == null) continue
    if (bySharpe == null) {
      bySharpe = v
      continue
    }
    const currentSharpe = bySharpe.latest_sharpe as number
    if (v.latest_sharpe > currentSharpe) bySharpe = v
    else if (v.latest_sharpe === currentSharpe && runStamp(v) > runStamp(bySharpe)) bySharpe = v
  }
  if (bySharpe != null) return bySharpe

  let byRun: StrategyListItem | null = null
  for (const v of variants) {
    if (!hasRun(v)) continue
    if (byRun == null || runStamp(v) > runStamp(byRun)) byRun = v
  }
  return byRun
}

/**
 * ロールアップキー。
 *
 * 区切りに `\u0000` を使う。銘柄名・レシピ名・時間軸のいずれにも現れないため
 * ("A|B", 銘柄なし) と ("A", "B") のような衝突が起きない。
 */
function recipeKey(name: string, symbol: string | null, timeframe: string | null): string {
  return `${name}\u0000${symbol ?? ''}\u0000${timeframe ?? ''}`
}

/** latest_sharpe 降順。null は末尾。同値は last_run_at が新しい方を先に。 */
function compareVariants(a: StrategyListItem, b: StrategyListItem): number {
  const sa = a.latest_sharpe
  const sb = b.latest_sharpe
  if (sa == null && sb == null) return runStamp(b).localeCompare(runStamp(a))
  if (sa == null) return 1
  if (sb == null) return -1
  if (sa !== sb) return sb - sa
  return runStamp(b).localeCompare(runStamp(a))
}

interface Bucket {
  name: string
  symbol: string | null
  timeframe: string | null
  items: StrategyListItem[]
}

/**
 * 戦略一覧をレシピへ畳む。返り値の順序は入力の初出順(並べ替えは呼び出し側)。
 */
export function buildRecipes(items: StrategyListItem[]): Recipe[] {
  const buckets = new Map<string, Bucket>()
  for (const item of items) {
    const symbol = effectiveSymbol(item)
    const timeframe = item.timeframe ?? null
    const key = recipeKey(item.name, symbol, timeframe)
    const existing = buckets.get(key)
    if (existing) {
      existing.items.push(item)
    } else {
      buckets.set(key, { name: item.name, symbol, timeframe, items: [item] })
    }
  }

  const out: Recipe[] = []
  for (const [key, bucket] of buckets) {
    const variants = [...bucket.items].sort(compareVariants)
    out.push({
      key,
      name: bucket.name,
      symbol: bucket.symbol,
      timeframe: bucket.timeframe,
      variants,
      best: pickBestVariant(variants),
      variantCount: variants.length,
      runCount: variants.filter(hasRun).length,
    })
  }
  return out
}
