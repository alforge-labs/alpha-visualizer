import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

/**
 * issue #342: 未定義の CSS カスタムプロパティを参照する回帰を防ぐ。
 *
 * 未定義の var() はエラーにならず静かに壊れる。プロパティは「継承値、無ければ
 * 初期値」に落ちるため、意図しない見た目が「たまたま動いているように見える」。
 * 実際に 3 種が長期間放置されていた。
 *
 *   --fs-mono-md   11 ファイルが参照。body の 1rem を継承して 17px で描画され、
 *                  Sharpe 列に個別指定された 1rem + bold の強調が効いていなかった
 *   --border-strong 5 箇所が参照。border-color が初期値の currentColor に落ち、
 *                  設計上のどのトークンより濃い線で描かれていた
 *   --text1        --text の typo。color は継承するため偶然同色で、気付けなかった
 *
 * ハードコード色を締め出す noHardcodedColors.test.ts と対になる関係で、
 * こちらは「トークンを参照しているつもりで参照できていない」側を捕まえる。
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(HERE, '../..')
const TOKENS = resolve(SRC, 'design/tokens.css')

/** tokens.css / a11y.css で定義済みのカスタムプロパティ名を集める。 */
function definedProperties(): Set<string> {
  const names = new Set<string>()
  for (const file of [TOKENS, resolve(SRC, 'design/a11y.css')]) {
    const text = readFileSync(file, 'utf-8')
    for (const m of text.matchAll(/^\s*(--[\w-]+)\s*:/gm)) names.add(m[1]!)
  }
  return names
}

function listSourceFiles(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf-8' })
    .filter((p) => /\.(ts|tsx|css)$/.test(p))
    .filter((p) => !p.includes('__tests__'))
    .map((p) => resolve(SRC, p))
}

/**
 * `var(--x)` の参照を拾う。テンプレートリテラルでの動的組み立て
 * （`var(--cols-${key})`）とコメント中の `var(--cols-*)` のような例示は
 * 静的に解決できないので、識別子が `${` か `*` で終わるものは対象外にする。
 */
function referencedProperties(text: string): string[] {
  return [...text.matchAll(/var\(\s*(--[\w-]+)([^)]*)\)/g)]
    .filter((m) => !m[2]!.trimStart().startsWith('$') && !m[2]!.trimStart().startsWith('*'))
    .map((m) => m[1]!)
}

describe('CSS カスタムプロパティは必ず定義済み (issue #342)', () => {
  it('src 全体の var() 参照がすべて tokens.css / a11y.css で定義されている', () => {
    const defined = definedProperties()
    const offenders: string[] = []
    for (const file of listSourceFiles()) {
      const text = readFileSync(file, 'utf-8')
      for (const name of referencedProperties(text)) {
        // var(--x, fallback) のようにフォールバック付きなら未定義でも意図的とみなす
        if (!defined.has(name)) offenders.push(`${file.replace(SRC, 'src')}: var(${name})`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('放置されていた 3 種が実際に定義されている', () => {
    const defined = definedProperties()
    // 個別に固定しておく。上の網羅テストは「参照が消えた」場合も緑になるため、
    // トークン自体が失われたことを検知できない。
    expect(defined.has('--fs-mono-md')).toBe(true)
    expect(defined.has('--border-strong')).toBe(true)
    expect(defined.has('--text')).toBe(true)
  })

  it('--fs-mono-md は --fs-mono-sm より大きく 1rem 未満', () => {
    // スケールとして機能する位置にあることを固定する。sm と 1px 差では
    // 区別が付かず、1rem 以上では Sharpe 列の強調（1rem + bold）が死ぬ。
    const text = readFileSync(TOKENS, 'utf-8')
    const rem = (name: string): number => {
      const m = text.match(new RegExp(`^\\s*${name}:\\s*([\\d.]+)rem`, 'm'))
      if (!m) throw new Error(`${name} が rem 指定で見つからない`)
      return Number(m[1])
    }
    const sm = rem('--fs-mono-sm')
    const md = rem('--fs-mono-md')
    expect(md).toBeGreaterThan(sm)
    expect(md).toBeLessThan(1)
    // sm との差が 0.0625rem（1px 相当）しかないと実質同じサイズになる
    expect(md - sm).toBeGreaterThan(0.0625)
  })
})
