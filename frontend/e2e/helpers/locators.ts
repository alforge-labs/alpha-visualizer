import type { Page } from '@playwright/test'

export type Lang = 'ja' | 'en'

/**
 * 各テストの実行前に viewer-settings localStorage をクリアする。
 * テスト間で言語・テーマ等が漏れないようにするため。
 */
export async function clearViewerSettings(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.clear()
    } catch {
      /* SSR or denied storage – ignore */
    }
  })
}

export async function gotoBrowse(page: Page): Promise<void> {
  await page.goto('/browse')
}

export async function gotoDetail(
  page: Page,
  strategyId: string,
  runId?: string,
): Promise<void> {
  const suffix = runId ? `?run_id=${encodeURIComponent(runId)}` : ''
  await page.goto(`/detail/${strategyId}${suffix}`)
}

export async function gotoCompare(page: Page, ids: readonly string[]): Promise<void> {
  await page.goto(`/compare?ids=${ids.join(',')}`)
}

/**
 * 言語切替ボタンをクリックする。LangToggle の各ボタンは role="radio" で
 * aria-label に「日本語」「English」が付与されている。
 */
export async function switchLanguage(page: Page, to: Lang): Promise<void> {
  const buttonName = to === 'ja' ? '日本語' : 'English'
  await page.getByRole('radio', { name: buttonName }).first().click()
}
