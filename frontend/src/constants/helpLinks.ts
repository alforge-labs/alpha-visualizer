import type { Lang } from '../i18n/strings'

// アプリ内ヘルプ導線の URL（issue #361）。
// UTM は既存フッター CTA の命名（utm_source=alpha-visualizer）に合わせる。
const DOCS_BASE = 'https://alforgelabs.com'

export function docsUrl(lang: Lang, medium: string): string {
  return `${DOCS_BASE}/${lang}/docs/alpha-visualizer/?utm_source=alpha-visualizer&utm_medium=${medium}`
}

export function faqUrl(lang: Lang, medium: string): string {
  return `${DOCS_BASE}/${lang}/docs/alpha-visualizer/faq/?utm_source=alpha-visualizer&utm_medium=${medium}`
}
