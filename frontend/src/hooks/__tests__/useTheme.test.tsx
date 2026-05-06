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
