import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

/**
 * issue #264: テーマトークンを迂回したハードコード色の回帰を防ぐ。
 * tokens.css を経由しない白/黒/緑/琥珀アルファ直書きは、ライト/ダーク切替で
 * 不可視化・パレット不調和を生むため、ソース全体から締め出す。
 *
 * tokens.css（色の定義元）・__tests__（本テスト）・useChartTheme の SERIES_*
 * パレット（チャート系列色の定義元）は意図的なハードコードのため対象外とする。
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(HERE, '../..')

/** どのファイルにも現れてはならない、トークン化対象の色リテラル。 */
const FORBIDDEN = [
  'rgba(255,255,255', // TradeTable ゼブラ/罫線の白アルファ
  'rgba(0,228,154', // 緑（success と不調和）方向バッジ / 現在行
  'rgba(245,166,35', // 琥珀の方向バッジ
  'rgba(127,127,127', // LiveTab ゼブラのグレー
  'rgba(0,0,0,0.18)', // チャートツールチップの黒影
  "'#888'", // CompareScreen 系列色フォールバック
]

function listSourceFiles(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf-8' })
    .filter((p) => /\.(ts|tsx)$/.test(p))
    .filter((p) => !p.includes('__tests__'))
    .map((p) => resolve(SRC, p))
}

describe('no hardcoded (non-token) colors (issue #264)', () => {
  it('does not contain any forbidden color literal across src', () => {
    const offenders: string[] = []
    for (const file of listSourceFiles()) {
      const text = readFileSync(file, 'utf-8')
      for (const needle of FORBIDDEN) {
        if (text.includes(needle)) offenders.push(`${file}: ${needle}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('VaRChart / MonteCarloChart use token fallbacks, not hardcoded hex', () => {
    const varChart = readFileSync(resolve(SRC, 'components/charts/VaRChart.tsx'), 'utf-8')
    expect(varChart).not.toContain("'#B33A2F'")
    expect(varChart).not.toContain("'#B27A1F'")
    const monteCarlo = readFileSync(resolve(SRC, 'components/charts/MonteCarloChart.tsx'), 'utf-8')
    expect(monteCarlo).not.toContain("'#4F7A3F'")
  })
})
