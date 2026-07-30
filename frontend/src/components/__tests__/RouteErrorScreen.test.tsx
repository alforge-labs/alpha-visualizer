import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RouteErrorScreen } from '../RouteErrorScreen'

/**
 * issue #389: ErrorBoundary / errorElement が皆無で、描画例外が React Router の
 * デフォルトエラー画面（英語・スタックトレース表示示唆）に落ちていた。
 * アプリのデザイン・i18n に沿った共通エラー画面 + 回復導線を保証する。
 */
function Boom(): never {
  throw new Error('boom from render')
}

function renderWithError() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <Boom />,
        errorElement: <RouteErrorScreen />,
      },
    ],
    { initialEntries: ['/'] },
  )
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  // React Router は errorElement 到達時にも console.error を出すためノイズ抑制
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RouteErrorScreen (issue #389)', () => {
  it('描画例外時に日本語メッセージと回復導線を表示する', () => {
    renderWithError()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/問題が発生しました/)).toBeInTheDocument()
    // 回復導線: 再読み込み + 一覧へ戻る
    expect(screen.getByRole('button', { name: /再読み込み/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /戦略一覧/ })).toBeInTheDocument()
    // スタックトレースを UI に露出しない
    expect(screen.queryByText(/boom from render/)).not.toBeInTheDocument()
  })

  it('再読み込みボタンで location.reload を呼ぶ', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    try {
      renderWithError()
      screen.getByRole('button', { name: /再読み込み/ }).click()
      expect(reload).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
