export type Lang = 'ja' | 'en'

export function L(lang: Lang, ja: string, en: string): string {
  return lang === 'ja' ? ja : en
}

export function makeL(lang: Lang) {
  return (ja: string, en: string): string => L(lang, ja, en)
}
