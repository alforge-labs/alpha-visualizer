import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

/**
 * issue #267 / #269: デザイントークンの文字色が WCAG AA(4.5:1) を満たすことを
 * tokens.css の実値から検証して回帰を防ぐ。
 * - #267: --text3 ミュート文字 / --accent テラコッタ（主背景）
 * - #269: --success / --warn / --danger セマンティック色、および accent-bg ティント上の accent
 */
function srgbToLinear(channel: number): number {
  const c = channel / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function rgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '')
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)]
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex)
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

/** fg を alpha でアルファ合成した実効背景色（CSS の単純な over 合成） */
function blend(fg: string, bg: string, alpha: number): string {
  const [fr, fg2, fb] = rgb(fg)
  const [br, bg2, bb] = rgb(bg)
  const mix = (a: number, b: number) => Math.round(a * alpha + b * (1 - alpha))
  const to2 = (n: number) => n.toString(16).padStart(2, '0')
  return `#${to2(mix(fr, br))}${to2(mix(fg2, bg2))}${to2(mix(fb, bb))}`
}

// vitest の cwd は frontend パッケージルート
const css = readFileSync('src/design/tokens.css', 'utf8')
const lightBlock = css.slice(css.indexOf(':root'), css.indexOf('html[data-theme="dark"]'))
const darkBlock = css.slice(css.indexOf('html[data-theme="dark"]'), css.indexOf('/* Global resets */'))

function pick(block: string, label: string, name: string): string {
  const m = block.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))
  if (!m) throw new Error(`${label} token --${name} not found`)
  return m[1]!
}

describe('light theme token contrast (issue #267/#269, WCAG AA 4.5:1)', () => {
  const t = (name: string) => pick(lightBlock, 'light', name)
  const bg = t('bg')
  const surface = t('surface')

  it.each(['text3', 'accent', 'success', 'warn', 'danger'])(
    '--%s meets AA as text against --bg',
    (name) => {
      expect(contrastRatio(t(name), bg)).toBeGreaterThanOrEqual(4.5)
    },
  )

  it('accent used as a fill meets AA with --surface text on it', () => {
    expect(contrastRatio(surface, t('accent'))).toBeGreaterThanOrEqual(4.5)
  })

  it('accent text meets AA on the accent-bg tint (active chips)', () => {
    const tint = blend(t('accent'), bg, 0.08)
    expect(contrastRatio(t('accent'), tint)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('dark theme semantic color contrast (issue #269, WCAG AA 4.5:1)', () => {
  const d = (name: string) => pick(darkBlock, 'dark', name)
  const bg = d('bg')

  it.each(['text3', 'accent', 'success', 'warn', 'danger'])(
    'dark --%s meets AA as text against dark --bg',
    (name) => {
      expect(contrastRatio(d(name), bg)).toBeGreaterThanOrEqual(4.5)
    },
  )
})
