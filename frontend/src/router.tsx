/* eslint-disable react-refresh/only-export-components --
   router 経由で lazy chunk を組み立てるため、本ファイルは const `router` と
   内部ヘルパ関数 (PageFallback) を併存させる。 */
import { lazy, Suspense, type ComponentType, type ReactElement } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RootLayout } from './components/RootLayout'

// 各 Page を React.lazy でコード分割。
// 初期ロードで Browse 画面のみ fetch され、Detail / Compare / Ideas は
// 遷移時に動的 chunk が読み込まれる。
//
// `lazy()` の呼び出しは `lazyRoute` 内に閉じ込めて、router.tsx が
// `router` 以外のものを export しないようにする（ESLint react-refresh ルール）。

type LazyImport<T> = () => Promise<T>

type PageModule = Record<string, ComponentType>

function lazyRoute(
  importer: LazyImport<PageModule>,
  exportName: string,
): ReactElement {
  const Component = lazy(() =>
    importer().then((m) => ({ default: m[exportName]! })),
  )
  return (
    <Suspense fallback={<PageFallback />}>
      <Component />
    </Suspense>
  )
}

/** Page chunk fetch 中の最低限の placeholder。 */
function PageFallback(): ReactElement {
  return (
    <div
      style={{
        padding: 'var(--space-7)',
        fontFamily: 'var(--mono)',
        fontSize: 'var(--fs-mono-md)',
        color: 'var(--text3)',
        letterSpacing: 'var(--tracking-mono)',
        background: 'var(--bg)',
        minHeight: '100vh',
      }}
    >
      Loading…
    </div>
  )
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/', element: <Navigate to="/browse" replace /> },
      {
        path: '/browse',
        element: lazyRoute(() => import('./pages/BrowsePage'), 'BrowsePage'),
      },
      {
        path: '/detail/:strategyId',
        element: lazyRoute(() => import('./pages/DetailPage'), 'DetailPage'),
      },
      {
        path: '/compare',
        element: lazyRoute(() => import('./pages/ComparePage'), 'ComparePage'),
      },
      {
        path: '/ideas',
        element: lazyRoute(() => import('./pages/IdeasPage'), 'IdeasPage'),
      },
    ],
  },
])
