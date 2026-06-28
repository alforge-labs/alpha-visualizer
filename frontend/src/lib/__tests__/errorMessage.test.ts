import { describe, it, expect } from 'vitest'
import { normalizeErrorMessage } from '../errorMessage'

/**
 * issue #265: バックエンド例外が整形されずに UI へ露出していた。
 * ApiError 由来の "API <status>: <生メッセージ>" をユーザー向け文言へ正規化し、
 * 生のスタックトレースやサーバー内部メッセージを露出しないことを保証する。
 */
describe('normalizeErrorMessage (issue #265)', () => {
  it('maps API 404 to a user-facing "not found" message and hides backend text', () => {
    const result = normalizeErrorMessage('API 404: Traceback ... KeyError: foo', 'ja')
    expect(result).toBe('データが見つかりません')
    expect(result).not.toContain('Traceback')
  })

  it('maps 5xx to a generic server error (en) without leaking the body', () => {
    expect(normalizeErrorMessage('API 500: NullPointer at line 42', 'en')).toBe(
      'A server error occurred',
    )
  })

  it('maps 401/403 to an access-denied message', () => {
    expect(normalizeErrorMessage('API 403: forbidden', 'ja')).toBe('アクセスが許可されていません')
  })

  it('maps network failures to a connectivity message', () => {
    expect(normalizeErrorMessage('Failed to fetch', 'ja')).toContain('接続')
    expect(normalizeErrorMessage('NetworkError when attempting to fetch', 'en')).toBe(
      'Cannot reach the server',
    )
  })

  it('returns a friendly fallback for empty/nullish input', () => {
    expect(normalizeErrorMessage(null, 'en')).toBe('Something went wrong')
    expect(normalizeErrorMessage('', 'ja')).toBe('問題が発生しました')
  })

  it('passes through already user-friendly (non-API) messages', () => {
    expect(normalizeErrorMessage('strategy_id が指定されていません', 'ja')).toBe(
      'strategy_id が指定されていません',
    )
  })
})
