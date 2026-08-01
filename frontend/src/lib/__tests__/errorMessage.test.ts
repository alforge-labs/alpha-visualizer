import { describe, it, expect } from 'vitest'
import {
  extractApiErrorDetail,
  messageForApiErrorCode,
  normalizeErrorMessage,
} from '../errorMessage'

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

describe('extractApiErrorDetail (issue #301)', () => {
  it('extracts the server detail from an ApiError body', () => {
    const raw =
      'API 409: {"detail":"strategy_id \'x_v2\' は既に存在します / strategy_id \'x_v2\' already exists"}'
    expect(extractApiErrorDetail(raw, 'ja')).toBe(
      "strategy_id 'x_v2' は既に存在します / strategy_id 'x_v2' already exists",
    )
  })

  it('falls back to normalizeErrorMessage for non-JSON bodies', () => {
    expect(extractApiErrorDetail('API 500: oops', 'ja')).toBe(
      'サーバーでエラーが発生しました',
    )
    expect(extractApiErrorDetail('Failed to fetch', 'ja')).toBe(
      'サーバーに接続できません',
    )
    expect(extractApiErrorDetail(null, 'ja')).toBe('問題が発生しました')
  })
})

describe('messageForApiErrorCode (issue #358)', () => {
  const raw =
    'API 503: {"detail":"alpha-forge コマンドが見つかりません。AlphaForge を導入してください / alpha-forge command not found in PATH. Install AlphaForge — https://alforgelabs.com","code":"forge_cli_not_found"}'

  it('maps forge_cli_not_found to a single-language message (ja)', () => {
    const msg = messageForApiErrorCode(raw, 'ja')
    // PATH 上の実行ファイル名は `alpha-forge`（v0.5.0 で `forge` から改名）。
    // 存在しない `forge` を名指しすると、ユーザーが誤った名前で PATH を確認する。
    expect(msg).toContain('alpha-forge コマンドが見つかりません')
    expect(msg).not.toContain('not found in PATH')
    expect(msg).toContain('https://alforgelabs.com')
  })

  it('maps forge_cli_not_found to a single-language message (en)', () => {
    const msg = messageForApiErrorCode(raw, 'en')
    expect(msg).toContain('not found in PATH')
    expect(msg).not.toContain('見つかりません')
    expect(msg).toContain('https://alforgelabs.com')
  })

  it('returns null when the body has no known code', () => {
    expect(messageForApiErrorCode('API 500: {"detail":"boom"}', 'ja')).toBeNull()
    expect(messageForApiErrorCode('API 503: {"detail":"x","code":"unknown_code"}', 'ja')).toBeNull()
    expect(messageForApiErrorCode('Failed to fetch', 'ja')).toBeNull()
    expect(messageForApiErrorCode(null, 'ja')).toBeNull()
  })
})
