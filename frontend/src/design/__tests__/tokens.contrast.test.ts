import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

/**
 * issue #267: ライトテーマのデザイントークン（--text3 ミュート文字 / --accent テラコッタ）が
 * WCAG AA(4.5:1) を割っていた。tokens.css の実値を読み、コントラスト比で回帰を防ぐ。
 * （axe をデスクトップで実行した際 --text3=#7B7368/#F0EEE6=4.02、--accent=#C25A2A=4.19 を検出）
 */
function srgbToLinear(channel: number): number {
  const c = channel / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function luminance(hex: string): number {
  const m = hex.replace('#', '')
  const r = parseInt(m.slice(0, 2), 16)
  const g = parseInt(m.slice(2, 4), 16)
  const b = parseInt(m.slice(4, 6), 16)
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

// vitest の cwd は frontend パッケージルート
const css = readFileSync('src/design/tokens.css', 'utf8')
// 先頭の :root（= Atelier / ライトテーマ）ブロックだけを対象にする
const lightBlock = css.slice(css.indexOf(':root'), css.indexOf('html[data-theme="dark"]'))

function token(name: string): string {
  const m = lightBlock.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))
  if (!m) throw new Error(`light theme token --${name} not found`)
  return m[1]!
}

describe('light theme token contrast (issue #267, WCAG AA 4.5:1)', () => {
  const bg = token('bg')
  const surface = token('surface')
  const text3 = token('text3')
  const accent = token('accent')

  it('muted text (--text3) meets AA against --bg', () => {
    expect(contrastRatio(text3, bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('accent (--accent) meets AA as text against --bg', () => {
    expect(contrastRatio(accent, bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('accent used as a fill meets AA with --surface text on it', () => {
    expect(contrastRatio(surface, accent)).toBeGreaterThanOrEqual(4.5)
  })
})
