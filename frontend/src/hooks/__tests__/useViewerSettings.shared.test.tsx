import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { resetViewerSettingsStoreForTest, useViewerSettings } from '../useTheme'

/**
 * issue #315: useViewerSettings がコンポーネントごとに独立した useState を持つため、
 * Page 側の LangToggle で lang を切り替えても RootLayout（AppNav）側のインスタンスに
 * 反映されず、ナビゲーションが旧言語のまま残る。
 * settings はモジュールレベルの共有ストアで全呼び出し元に同期されなければならない。
 */
function LangReader() {
  const { settings } = useViewerSettings()
  return <span data-testid="reader-lang">{settings.lang}</span>
}

function LangWriter() {
  const { update } = useViewerSettings()
  return (
    <div>
      <button onClick={() => update('lang', 'en')}>writer-set-en</button>
      <button onClick={() => update('lang', 'ja')}>writer-set-ja</button>
    </div>
  )
}

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v)
    },
    removeItem: (k: string) => {
      store.delete(k)
    },
    clear: () => {
      store.clear()
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size
    },
  }
}

beforeEach(() => {
  window.history.replaceState({}, '', '/')
  vi.stubGlobal('localStorage', createMemoryStorage())
  resetViewerSettingsStoreForTest()
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState({}, '', '/')
})

describe('useViewerSettings — cross-component sync (issue #315)', () => {
  it('update() in one component is reflected in another component instance', () => {
    render(
      <div>
        <LangReader />
        <LangWriter />
      </div>,
    )

    expect(screen.getByTestId('reader-lang').textContent).toBe('ja')

    fireEvent.click(screen.getByText('writer-set-en'))
    expect(screen.getByTestId('reader-lang').textContent).toBe('en')

    fireEvent.click(screen.getByText('writer-set-ja'))
    expect(screen.getByTestId('reader-lang').textContent).toBe('ja')
  })

  it('a component mounted after update() sees the current shared state', () => {
    const { rerender } = render(<LangWriter />)
    fireEvent.click(screen.getByText('writer-set-en'))

    rerender(
      <div>
        <LangWriter />
        <LangReader />
      </div>,
    )
    expect(screen.getByTestId('reader-lang').textContent).toBe('en')
  })
})
