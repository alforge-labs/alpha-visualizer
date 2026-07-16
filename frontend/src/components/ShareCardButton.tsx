import type { ReactElement } from 'react'
import type { BacktestDetail } from '../api/types'
import type { ChartTheme } from '../design/useChartTheme'
import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import { downloadShareCard } from '../lib/shareCard'

const BTN_STYLE: React.CSSProperties = {
  height: 26,
  padding: '0 9px',
  borderRadius: 4,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  cursor: 'pointer',
  fontFamily: 'var(--mono)',
  fontSize: 12,
  color: 'var(--text2)',
  letterSpacing: '0.05em',
}

/**
 * シェアカード書き出しの共通ボタン（Detail / Compare / Live で再利用）。
 * カードのブランド行が AlphaForge の認知経路になる（C5 バイラルループ）。
 */
export function ShareButton({
  lang,
  onClick,
}: {
  lang: Lang
  onClick: () => void
}): ReactElement {
  const L = makeL(lang)
  return (
    <button type="button" style={BTN_STYLE} onClick={onClick}>
      {L('シェアカード', 'Share card')}
    </button>
  )
}

/**
 * Detail（Backtest）画面用: バックテスト結果を PNG カード（1200×630）として
 * 書き出す。theme は呼び出し元（useChartTheme 済み）から受け取り、購読を
 * 二重化しない。
 */
export function ShareCardButton({
  data,
  lang,
  theme,
}: {
  data: BacktestDetail
  lang: Lang
  theme: ChartTheme
}): ReactElement {
  return <ShareButton lang={lang} onClick={() => downloadShareCard(data, lang, theme)} />
}
