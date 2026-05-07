import { test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  clearViewerSettings,
  gotoBrowse,
  gotoCompare,
  gotoDetail,
  switchLanguage,
  type Lang,
} from '../helpers/locators'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * README / alforge-labs サイト掲載用スクリーンショットを ja/en 両言語で撮影する。
 * 出力先: <repo-root>/docs/screenshots/{ja,en}/<name>.png
 *
 * playwright.config.screenshots.ts から実行することを想定。
 */

const STRATEGY_ID = 'sma_cross'
const COMPARE_IDS = ['sma_cross', 'rsi_reversal', 'momo_breakout'] as const

const SCREENSHOT_DIR = resolve(__dirname, '../../../docs/screenshots')

interface CaptureOptions {
  readonly page: Page
  readonly lang: Lang
  readonly name: string
  readonly fullPage?: boolean
}

async function ensureDir(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
}

async function capture({ page, lang, name, fullPage = false }: CaptureOptions): Promise<void> {
  const filePath = resolve(SCREENSHOT_DIR, lang, `${name}.png`)
  await ensureDir(filePath)
  // 各ページの非同期描画（チャート・データ取得）が落ち着くのを待つ
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: filePath, fullPage })
}

async function setLang(page: Page, lang: Lang): Promise<void> {
  if (lang === 'ja') {
    return
  }
  await switchLanguage(page, lang)
  // 言語切替直後はテキストの再描画があるので少し待つ
  await page.waitForLoadState('networkidle')
}

test.describe.serial('README / docs 用スクリーンショット撮影', () => {
  for (const lang of ['ja', 'en'] as const) {
    test.describe(`lang=${lang}`, () => {
      test.beforeEach(async ({ page }) => {
        await clearViewerSettings(page)
      })

      test('browse', async ({ page }) => {
        await gotoBrowse(page)
        await setLang(page, lang)
        await capture({ page, lang, name: 'browse' })
      })

      test('detail', async ({ page }) => {
        await gotoDetail(page, STRATEGY_ID)
        await setLang(page, lang)
        await capture({ page, lang, name: 'detail' })
      })

      test('detail-strategy', async ({ page }) => {
        await gotoDetail(page, STRATEGY_ID)
        await setLang(page, lang)
        const tabName = lang === 'ja' ? '戦略構成' : 'Strategy'
        const tab = page.getByRole('tab', { name: tabName }).first()
        if (await tab.count()) {
          await tab.click()
          await page.waitForLoadState('networkidle')
        }
        await capture({ page, lang, name: 'strategy' })
      })

      test('detail-optimize', async ({ page }) => {
        await gotoDetail(page, STRATEGY_ID)
        await setLang(page, lang)
        const tabName = lang === 'ja' ? '最適化' : 'Optimize'
        const tab = page.getByRole('tab', { name: tabName }).first()
        if (await tab.count()) {
          await tab.click()
          await page.waitForLoadState('networkidle')
        }
        await capture({ page, lang, name: 'optimize' })
      })

      test('compare', async ({ page }) => {
        await gotoCompare(page, COMPARE_IDS)
        await setLang(page, lang)
        await capture({ page, lang, name: 'compare' })
      })

      test('ideas', async ({ page }) => {
        await page.goto('/ideas')
        await setLang(page, lang)
        await capture({ page, lang, name: 'ideas' })
      })
    })
  }
})
