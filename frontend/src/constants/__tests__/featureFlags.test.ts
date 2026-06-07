import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  resolveLightweightChartsFlag,
  setLightweightChartsFlag,
} from '../featureFlags'

const LS_KEY = 'alpha.flags.lightweightCharts'

/** jsdom の location.search をテストごとに設定する */
function setSearch(search: string): void {
  window.history.replaceState(null, '', search === '' ? '/' : `/?${search}`)
}

// jsdom の localStorage が無効なため、useTheme.test.tsx と同じ in-memory Storage を stub する
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
  setSearch('')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  window.history.replaceState({}, '', '/')
})

describe('resolveLightweightChartsFlag', () => {
  // issue #231: TV チャートは既定 ON。docs/README は TV を主要機能として
  // 提示しており（v0.3.0/v0.4.0 で移行済みと記載）、既定 OFF のままでは
  // 公開 wheel の実挙動が docs と乖離する。
  it('クエリ・localStorage・env が無いとき既定で true（TV レンダラ）を返す', () => {
    expect(resolveLightweightChartsFlag()).toBe(true)
  })

  it('?tv=0 で false（visx fallback）になり localStorage に persist される', () => {
    setSearch('tv=0')
    expect(resolveLightweightChartsFlag()).toBe(false)
    expect(storage.getItem(LS_KEY)).toBe('0')
  })

  it('?tv=1 で true になり localStorage に persist される', () => {
    setSearch('tv=1')
    expect(resolveLightweightChartsFlag()).toBe(true)
    expect(storage.getItem(LS_KEY)).toBe('1')
  })

  it('localStorage の "0" で false を返す（クエリ無し）', () => {
    storage.setItem(LS_KEY, '0')
    expect(resolveLightweightChartsFlag()).toBe(false)
  })

  it('localStorage の "1" で true を返す', () => {
    storage.setItem(LS_KEY, '1')
    expect(resolveLightweightChartsFlag()).toBe(true)
  })

  // 既定 ON 化後も env で明示 OFF できること（CI やビルド時の退避経路）
  it.each(['0', 'false'])('env VITE_USE_LIGHTWEIGHT_CHARTS=%s で false を返す', (raw) => {
    vi.stubEnv('VITE_USE_LIGHTWEIGHT_CHARTS', raw)
    expect(resolveLightweightChartsFlag()).toBe(false)
  })

  it.each(['1', 'true'])('env VITE_USE_LIGHTWEIGHT_CHARTS=%s で true を返す', (raw) => {
    vi.stubEnv('VITE_USE_LIGHTWEIGHT_CHARTS', raw)
    expect(resolveLightweightChartsFlag()).toBe(true)
  })

  it('認識できない env 値（typo 等）は無視して既定 true にフォールバックする', () => {
    vi.stubEnv('VITE_USE_LIGHTWEIGHT_CHARTS', 'off')
    expect(resolveLightweightChartsFlag()).toBe(true)
  })

  it('優先順位: クエリ ?tv=1 は localStorage の "0" に勝つ', () => {
    storage.setItem(LS_KEY, '0')
    setSearch('tv=1')
    expect(resolveLightweightChartsFlag()).toBe(true)
  })

  it('優先順位: localStorage の "1" は env の "0" に勝つ', () => {
    vi.stubEnv('VITE_USE_LIGHTWEIGHT_CHARTS', '0')
    storage.setItem(LS_KEY, '1')
    expect(resolveLightweightChartsFlag()).toBe(true)
  })

  it('優先順位: env の "0" は既定 true に勝つ（クエリ・storage 無し）', () => {
    vi.stubEnv('VITE_USE_LIGHTWEIGHT_CHARTS', '0')
    expect(resolveLightweightChartsFlag()).toBe(false)
  })
})

describe('setLightweightChartsFlag', () => {
  it('false を保存すると次回解決時に visx fallback になる', () => {
    setLightweightChartsFlag(false)
    expect(storage.getItem(LS_KEY)).toBe('0')
    expect(resolveLightweightChartsFlag()).toBe(false)
  })
})
