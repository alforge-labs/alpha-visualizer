import { useEffect } from 'react'
import type { ReactElement } from 'react'
import { useRouteError } from 'react-router'
import { makeL } from '../i18n/strings'
import { useViewerSettings } from '../hooks/useTheme'
import { Button } from '../design/primitives'

/**
 * ルート共通のエラー画面（issue #389）。
 *
 * 描画例外・loader 例外が React Router のデフォルトエラー画面（英語・
 * スタックトレース表示示唆）に落ちないよう、アプリのデザイン・i18n に
 * 沿ったメッセージと回復導線（再読み込み / 一覧へ戻る）を提供する。
 * スタックトレースは UI に露出せず console にのみ出す。
 */
export function RouteErrorScreen(): ReactElement {
  const error = useRouteError()
  const { settings } = useViewerSettings()
  const L = makeL(settings.lang)

  useEffect(() => {
    // 開発者向けの手がかりは console へ（UI には出さない）
    console.error('route error:', error)
  }, [error])

  return (
    <div
      role="alert"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-4)',
        padding: 'var(--space-7)',
        background: 'var(--bg)',
        textAlign: 'center',
      }}
    >
      <h1
        style={{
          margin: 0,
          fontFamily: 'var(--serif)',
          fontSize: 'var(--fs-h2)',
          fontWeight: 700,
          color: 'var(--text)',
        }}
      >
        {L('問題が発生しました', 'Something went wrong')}
      </h1>
      <p
        style={{
          margin: 0,
          maxWidth: 480,
          fontFamily: 'var(--sans)',
          fontSize: 'var(--fs-body)',
          color: 'var(--text2)',
          lineHeight: 'var(--lh-base)',
        }}
      >
        {L(
          '画面の描画中に予期しないエラーが発生しました。再読み込みで復帰する場合があります。解決しない場合はデータや URL をご確認ください。',
          'An unexpected error occurred while rendering this page. Reloading may fix it. If the problem persists, check your data or the URL.',
        )}
      </p>
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
        <Button variant="primary" size="sm" onClick={() => window.location.reload()}>
          {L('再読み込み', 'Reload')}
        </Button>
        {/* 描画例外後は React ツリーが壊れている可能性があるため、
            SPA 遷移でなくフルナビゲーションで復帰する */}
        <a
          href="/browse"
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 'var(--fs-caption)',
            fontWeight: 600,
            color: 'var(--accent)',
            textDecoration: 'none',
            letterSpacing: 'var(--tracking-caption)',
            textTransform: 'uppercase',
          }}
        >
          {L('戦略一覧へ戻る', 'Back to strategies')}
        </a>
      </div>
    </div>
  )
}
