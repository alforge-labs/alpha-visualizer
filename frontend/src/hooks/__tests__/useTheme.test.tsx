import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { useViewerSettings } from '../useTheme'

const STORAGE_KEY = 'alphaforge.viewer.settings.v1'

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

let storage: Storage

beforeEach(() => {
  storage = createMemoryStorage()
  vi.stubGlobal('localStorage', storage)
  // テストごとに URL をリセット
  window.history.replaceState({}, '', '/')
  // <html> dataset もリセット
  delete document.documentElement.dataset.theme
  delete document.documentElement.dataset.variation
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState({}, '', '/')
})

describe('useViewerSettings — defaults', () => {
  it('uses defaults when storage and URL are empty', () => {
    const { result } = renderHook(() => useViewerSettings())

    expect(result.current.settings.density).toBe('comfortable')
    expect(result.current.settings.variation).toBe('atelier')
    expect(result.current.settings.lang).toBe('ja')
    // matchMedia は test-setup で matches:false 固定 → system theme は light
    expect(result.current.settings.theme).toBe('light')
  })

  it('syncs theme/variation to <html> data attributes', () => {
    renderHook(() => useViewerSettings())

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.documentElement.dataset.variation).toBe('atelier')
  })
})

describe('useViewerSettings — URL > storage > defaults precedence', () => {
  it('URL params override storage', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'light', lang: 'ja' }))
    window.history.replaceState({}, '', '/?theme=dark&lang=en')

    const { result } = renderHook(() => useViewerSettings())

    expect(result.current.settings.theme).toBe('dark')
    expect(result.current.settings.lang).toBe('en')
  })

  it('storage values are applied when URL has no overrides', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ density: 'compact', variation: 'lab' }))

    const { result } = renderHook(() => useViewerSettings())

    expect(result.current.settings.density).toBe('compact')
    expect(result.current.settings.variation).toBe('lab')
  })

  it('ignores invalid URL values (e.g., theme=neon)', () => {
    window.history.replaceState({}, '', '/?theme=neon&density=tight')

    const { result } = renderHook(() => useViewerSettings())

    expect(result.current.settings.theme).toBe('light')
    expect(result.current.settings.density).toBe('comfortable')
  })

  it('falls back to defaults when storage JSON is corrupted', () => {
    storage.setItem(STORAGE_KEY, 'this is not json')

    const { result } = renderHook(() => useViewerSettings())

    expect(result.current.settings.theme).toBe('light')
    expect(result.current.settings.density).toBe('comfortable')
    expect(result.current.settings.variation).toBe('atelier')
    expect(result.current.settings.lang).toBe('ja')
  })
})

describe('useViewerSettings — update()', () => {
  it('persists updated value to localStorage and updates <html> dataset', () => {
    const { result } = renderHook(() => useViewerSettings())

    act(() => {
      result.current.update('variation', 'lab')
    })

    expect(result.current.settings.variation).toBe('lab')
    expect(document.documentElement.dataset.variation).toBe('lab')

    const raw = storage.getItem(STORAGE_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw as string) as { variation?: string }
    expect(parsed.variation).toBe('lab')
  })

  it('does not throw when localStorage.setItem fails (private mode etc.)', () => {
    const failingStorage: Storage = {
      ...createMemoryStorage(),
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    vi.stubGlobal('localStorage', failingStorage)

    expect(() => {
      const { result } = renderHook(() => useViewerSettings())
      act(() => {
        result.current.update('lang', 'en')
      })
    }).not.toThrow()
  })
})

/**
 * issue #266: OS のカラースキーム変更が起動後に追従しない（初期化時のみ matchMedia を読む）。
 * change イベントを購読し、ユーザーが明示的に theme を選んでいない場合のみ OS に追従する。
 */
describe('useViewerSettings — OS theme change subscription (issue #266)', () => {
  let originalMatchMedia: typeof window.matchMedia
  let emit: (matches: boolean) => void

  function installMatchMedia(initialMatches: boolean): void {
    let matches = initialMatches
    const listeners = new Set<(e: MediaQueryListEvent) => void>()
    const mql = {
      get matches() {
        return matches
      },
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
        listeners.add(cb)
      },
      removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
        listeners.delete(cb)
      },
      addListener: (cb: (e: MediaQueryListEvent) => void) => listeners.add(cb),
      removeListener: (cb: (e: MediaQueryListEvent) => void) => listeners.delete(cb),
      dispatchEvent: () => true,
    }
    window.matchMedia = (() => mql) as unknown as typeof window.matchMedia
    emit = (next: boolean) => {
      matches = next
      for (const cb of listeners) cb({ matches } as MediaQueryListEvent)
    }
  }

  beforeEach(() => {
    originalMatchMedia = window.matchMedia
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('follows OS theme change when the user has no explicit theme', () => {
    installMatchMedia(false) // 初期は light
    const { result } = renderHook(() => useViewerSettings())
    expect(result.current.settings.theme).toBe('light')

    act(() => {
      emit(true) // OS が dark に切替
    })
    expect(result.current.settings.theme).toBe('dark')

    act(() => {
      emit(false) // OS が light に戻す
    })
    expect(result.current.settings.theme).toBe('light')
  })

  it('does NOT follow OS change when the user set a theme via storage', () => {
    installMatchMedia(false)
    storage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'light' }))

    const { result } = renderHook(() => useViewerSettings())
    expect(result.current.settings.theme).toBe('light')

    act(() => {
      emit(true) // OS dark になっても明示設定を尊重
    })
    expect(result.current.settings.theme).toBe('light')
  })

  it('stops following once the user explicitly updates the theme', () => {
    installMatchMedia(false)
    const { result } = renderHook(() => useViewerSettings())

    act(() => {
      result.current.update('theme', 'dark') // 明示選択
    })
    expect(result.current.settings.theme).toBe('dark')

    act(() => {
      emit(false) // OS が light になっても追従しない
    })
    expect(result.current.settings.theme).toBe('dark')
  })

  it('does not persist theme to storage while following the OS (no explicit choice)', () => {
    installMatchMedia(false)
    renderHook(() => useViewerSettings())

    const raw = storage.getItem(STORAGE_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw as string) as { theme?: string }
    // 明示選択していない間は theme を保存しない（再読込時に OS 追従を継続させるため）
    expect(parsed.theme).toBeUndefined()
  })

  it('persists theme to storage once explicitly chosen', () => {
    installMatchMedia(false)
    const { result } = renderHook(() => useViewerSettings())

    act(() => {
      result.current.update('theme', 'dark')
    })

    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) as string) as { theme?: string }
    expect(parsed.theme).toBe('dark')
  })
})
