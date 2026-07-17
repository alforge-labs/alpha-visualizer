/**
 * 「最高シャープの戦略をベストとする」選定規約の SSoT。
 * CompareScreen の Winner バナーと共有ツイート文言の両方が参照する
 * （片方だけ改修されて基準がずれるサイレントドリフトを防ぐ）。
 * tie・全 null は先着優先。空配列は undefined。
 */
export function selectBestSharpe<T extends { sharpe_ratio?: number | null }>(
  items: ReadonlyArray<T>,
): T | undefined {
  return items.reduce<T | undefined>(
    (best, s) =>
      (s.sharpe_ratio ?? -Infinity) > (best?.sharpe_ratio ?? -Infinity) ? s : best,
    items[0],
  )
}
