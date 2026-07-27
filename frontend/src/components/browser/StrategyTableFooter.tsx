import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'

export interface StrategyTableFooterProps {
  /** いま表の中に描画されているレシピ数 */
  visibleRecipeCount: number
  /** 全戦略から作ったレシピ数（フィルタ非依存の分母） */
  recipeTotal: number
  /** 未実行トグルで隠れているレシピ数。0 なら文言を出さない */
  hiddenUnrunRecipeCount: number
  strategyTotal: number
  lang: Lang
}

/**
 * 表示件数と、既定で除外している未実行レシピ数を開示する。
 *
 * 既定では未実行のみのレシピを表から外す（実データでは 275 レシピ中 139）。
 * 黙って切ると「全部見えている」と誤読されるため、隠した件数を常に出す。
 */
export function StrategyTableFooter({
  visibleRecipeCount,
  recipeTotal,
  hiddenUnrunRecipeCount,
  strategyTotal,
  lang,
}: StrategyTableFooterProps): React.ReactElement {
  const L = makeL(lang)
  const hidden =
    hiddenUnrunRecipeCount > 0
      ? L(
          `（未実行のみ ${hiddenUnrunRecipeCount} レシピを非表示）`,
          ` (${hiddenUnrunRecipeCount} unrun-only recipes hidden)`,
        )
      : ''
  return (
    <div
      data-testid="strategy-table-footer"
      style={{
        padding: '12px 24px',
        fontFamily: 'var(--mono)',
        fontSize: 'var(--fs-mono-sm)',
        color: 'var(--text3)',
        letterSpacing: 'var(--tracking-mono)',
        borderTop: '1px solid var(--border)',
      }}
    >
      {L(
        `${visibleRecipeCount} レシピ表示 / 全 ${recipeTotal} レシピ${hidden} · ${strategyTotal} 戦略`,
        `${visibleRecipeCount} of ${recipeTotal} recipes${hidden} · ${strategyTotal} strategies`,
      )}
    </div>
  )
}
