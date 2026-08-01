import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStarredStrategies } from '../useStarredStrategies'

/**
 * issue #379: 運用中の数戦略へフィルタ操作なしで到達するためのお気に入り。
 * localStorage 永続と toggle の冪等性を固定する。
 * この実行環境の jsdom は localStorage を持たないため、useTheme.test と
 * 同じく in-memory ストレージを stub する。
 */
const KEY = 'alphaforge.starred_recipes.v1'

function makeStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size
    },
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', makeStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useStarredStrategies (issue #379)', () => {
  it('toggle で追加・再 toggle で解除し localStorage に永続する', () => {
    const { result } = renderHook(() => useStarredStrategies())
    act(() => result.current.toggleStar('r1'))
    expect(result.current.starredKeys.has('r1')).toBe(true)
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual(['r1'])

    act(() => result.current.toggleStar('r1'))
    expect(result.current.starredKeys.has('r1')).toBe(false)
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual([])
  })

  it('保存済みのスターを初期状態として読み込む', () => {
    vi.stubGlobal('localStorage', makeStorage({ [KEY]: JSON.stringify(['a', 'b']) }))
    const { result } = renderHook(() => useStarredStrategies())
    expect(result.current.starredKeys.has('a')).toBe(true)
    expect(result.current.starredKeys.has('b')).toBe(true)
  })

  it('壊れた保存値は空として扱う', () => {
    vi.stubGlobal('localStorage', makeStorage({ [KEY]: '{not json' }))
    const { result } = renderHook(() => useStarredStrategies())
    expect(result.current.starredKeys.size).toBe(0)
  })
})
