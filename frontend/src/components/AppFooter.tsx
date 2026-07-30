import type { CSSProperties, ReactElement } from 'react'
import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import { docsUrl, faqUrl } from '../constants/helpLinks'

/**
 * 全画面共通のフッター（contentinfo ランドマーク）。
 *
 * README・ターミナルバナーに続く第3の AlphaForge 送客導線で、
 * ダッシュボードだけを使う OSS ユーザーに届く唯一の常設 CTA。
 * あわせて、使用中に詰まったユーザーが公式 docs / FAQ に 1 クリックで
 * 到達できるヘルプ導線を常設する（issue #361）。
 */
export function AppFooter({ lang }: { lang: Lang }): ReactElement {
  const L = makeL(lang)
  const helpLinkStyle: CSSProperties = {
    fontFamily: 'var(--mono)',
    fontSize: 'var(--fs-mono-sm)',
    letterSpacing: 'var(--tracking-caption)',
    color: 'var(--text3)',
    textDecoration: 'none',
  }
  return (
    <footer
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 'var(--space-5)',
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
      <a
        href={docsUrl(lang, 'footer-help')}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={L(
          'ヘルプ — 公式ドキュメント（別タブで開く）',
          'Help — official documentation (opens in new tab)',
        )}
        style={helpLinkStyle}
      >
        {L('ヘルプ', 'Help')}
        <span aria-hidden="true"> ↗</span>
      </a>
      <a
        href={faqUrl(lang, 'footer-help')}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={L(
          'FAQ・トラブルシューティング（別タブで開く）',
          'FAQ & troubleshooting (opens in new tab)',
        )}
        style={helpLinkStyle}
      >
        FAQ
        <span aria-hidden="true"> ↗</span>
      </a>
    </footer>
  )
}
