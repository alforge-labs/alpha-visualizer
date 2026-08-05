/* eslint-disable react-refresh/only-export-components --
   router 経由で lazy chunk を組み立てるため、本ファイルは const `router` と
   内部ヘルパ関数 (PageFallback) を併存させる。 */
import { lazy, Suspense, type ComponentType, type ReactElement } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { RootLayout } from './components/RootLayout'
import { RouteErrorScreen } from './components/RouteErrorScreen'
import { Loading } from './design/primitives'

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

/** Page chunk fetch 中の placeholder。スケルトンで CLS を抑える（issue #266）。 */
function PageFallback(): ReactElement {
  return <Loading fullPage label="Loading…" />
}

export const router = createBrowserRouter([
  {
    // 印刷用フルレポート (issue #373)。ナビ・フッター無しの自己完結ビュー
    path: '/detail/:strategyId/report',
    element: lazyRoute(() => import('./pages/ReportPage'), 'ReportPage'),
    errorElement: <RouteErrorScreen />,
  },
  {
    element: <RootLayout />,
    // 子ルートの描画例外はここへバブルする。デフォルトの英語エラー画面に
    // 落とさず、i18n + 回復導線付きの共通画面を出す (issue #389)
    errorElement: <RouteErrorScreen />,
    children: [
      { path: '/', element: <Navigate to="/browse" replace /> },
      {
        path: '/start',
        element: lazyRoute(() => import('./pages/StartPage'), 'StartPage'),
      },
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
        path: '/runs',
        element: lazyRoute(() => import('./pages/RunsPage'), 'RunsPage'),
      },
      {
        path: '/data',
        element: lazyRoute(() => import('./pages/DataPage'), 'DataPage'),
      },
      {
        path: '/ideas',
        element: lazyRoute(() => import('./pages/IdeasPage'), 'IdeasPage'),
      },
      {
        path: '/live',
        element: lazyRoute(() => import('./pages/LivePage'), 'LivePage'),
      },
      {
        path: '/develop',
        element: lazyRoute(() => import('./pages/DevelopPage'), 'DevelopPage'),
      },
      {
        path: '/maintenance',
        element: lazyRoute(() => import('./pages/MaintenancePage'), 'MaintenancePage'),
      },
    ],
  },
])
