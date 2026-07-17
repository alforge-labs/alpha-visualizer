import type { ReactElement } from 'react'
import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'

/**
 * 全画面共通のフッター（contentinfo ランドマーク）。
 *
 * README・ターミナルバナーに続く第3の AlphaForge 送客導線で、
 * ダッシュボードだけを使う OSS ユーザーに届く唯一の常設 CTA。
 */
export function AppFooter({ lang }: { lang: Lang }): ReactElement {
  const L = makeL(lang)
  return (
    <footer
      style={{
        display: 'flex',
        justifyContent: 'center',
        padding: '10px var(--space-7)',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg)',
      }}
    >
      <a
        href="https://alforgelabs.com/?utm_source=alpha-visualizer&utm_medium=footer"
        target="_blank"
        rel="noopener noreferrer"
        aria-label={L(
          'Powered by AlphaForge — バックテスト・最適化エンジン本体を無料で試す（別タブで開く）',
          'Powered by AlphaForge — Try the full backtest & optimization engine free (opens in new tab)',
        )}
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 'var(--fs-mono-sm)',
          letterSpacing: 'var(--tracking-caption)',
          color: 'var(--text2)',
          textDecoration: 'none',
        }}
      >
        {L(
          'Powered by AlphaForge — バックテスト・最適化エンジン本体を無料で試す',
          'Powered by AlphaForge — Try the full backtest & optimization engine free',
        )}
        <span aria-hidden="true"> ↗</span>
      </a>
    </footer>
  )
}
