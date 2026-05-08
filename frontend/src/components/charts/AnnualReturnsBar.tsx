import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import {
  AnnualReturnsBarV,
  type AnnualReturnsPoint,
} from '../../charts/visx/AnnualReturnsBarV'

interface Props {
  annualReturns: Record<string, number>
  benchmarkReturns?: Record<string, number>
  lang: Lang
  compact?: boolean
}

/**
 * 年次リターン棒グラフ (Container)。
 *
 * 役割:
 * - annualReturns / benchmarkReturns dict をソート済み年別ポイント列に変換
 * - i18n ラベル（戦略 / Buy & Hold / B&H）を解決
 *
 * 描画は ``AnnualReturnsBarV`` (charts/visx/) に委譲する（ADR-0002）。
 */
export function AnnualReturnsBar({
  annualReturns,
  benchmarkReturns,
  lang,
  compact = false,
}: Props): React.ReactElement {
  const L = makeL(lang)

  const years = Object.keys(annualReturns).sort()
  const points: AnnualReturnsPoint[] = years.map((year) => ({
    year,
    strategy: annualReturns[year] ?? 0,
    benchmark:
      benchmarkReturns && benchmarkReturns[year] != null
        ? benchmarkReturns[year]!
        : null,
  }))

  return (
    <AnnualReturnsBarV
      points={points}
      labels={{ strategy: L('戦略', 'Strategy'), benchmark: L('B&H', 'Buy & Hold') }}
      tooltipLabels={{ strategy: L('戦略', 'Strategy'), benchmark: L('B&H', 'B&H') }}
      compact={compact}
    />
  )
}
