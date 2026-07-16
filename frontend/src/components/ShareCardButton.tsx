import type { ReactElement } from 'react'
import type { BacktestDetail } from '../api/types'
import type { ChartTheme } from '../design/useChartTheme'
import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import { downloadShareCard } from '../lib/shareCard'

/**
 * バックテスト結果を SNS シェア用の PNG カード（1200×630）として書き出す
 * ボタン（C5 バイラルループ）。カードのブランド行が AlphaForge の認知経路になる。
 * theme は呼び出し元（useChartTheme 済み）から受け取り、購読を二重化しない。
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
  const L = makeL(lang)
  return (
    <button
      type="button"
      style={{
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
      }}
      onClick={() => downloadShareCard(data, lang, theme)}
    >
      {L('シェアカード', 'Share card')}
    </button>
  )
}
