import { makeL } from '../i18n/strings'
import type { Lang } from '../i18n/strings'

/**
 * 生のエラーメッセージをユーザー向け文言へ正規化する（issue #265）。
 *
 * - ApiError は "API <status>: <body>" 形式。既知の HTTP ステータスを定型文へ写像し、
 *   サーバー内部メッセージやスタックトレースを UI に露出しない。
 * - fetch の失敗（ネットワーク断）は接続不可の文言にする。
 * - それ以外（既にユーザー向けの JS Error メッセージ等）はそのまま返す。
 */
export function normalizeErrorMessage(raw: string | null | undefined, lang: Lang): string {
  const L = makeL(lang)
  if (!raw) return L('問題が発生しました', 'Something went wrong')

  const apiMatch = raw.match(/API\s+(\d{3})/)
  if (apiMatch) {
    const status = Number(apiMatch[1])
    if (status === 404) return L('データが見つかりません', 'Data not found')
    if (status === 401 || status === 403) return L('アクセスが許可されていません', 'Access denied')
    if (status >= 500) return L('サーバーでエラーが発生しました', 'A server error occurred')
    return L('リクエストを処理できませんでした', 'The request could not be completed')
  }

  if (/Failed to fetch|NetworkError|Load failed|network/i.test(raw)) {
    return L('サーバーに接続できません', 'Cannot reach the server')
  }

  return raw
}

/**
 * ApiError の生メッセージ（"API <status>: <body>"）からサーバーの `detail`
 * （ユーザー向け bilingual 文言）を抽出する。抽出できなければ
 * `normalizeErrorMessage` へフォールバックする。
 *
 * 409（ID 衝突）のようにサーバー側 detail がそのままユーザー向け説明に
 * なっているエンドポイント（戦略複製など）で、生 JSON の露出と定型文への
 * 潰れ込みの両方を避けるために使う。
 */
/**
 * ApiError の生メッセージから機械可読 `code` を抽出する（無ければ null）。
 *
 * サーバーは想定内のエラー状態（forge CLI 未導入等）に安定した code を
 * 付与する（issue #358）。文字列 detail のパターンマッチに頼らず、この
 * code で UI 側の言語別メッセージへ写像する。
 */
export function extractApiErrorCode(raw: string | null | undefined): string | null {
  if (!raw) return null
  const jsonStart = raw.indexOf('{')
  if (jsonStart < 0) return null
  try {
    const code = (JSON.parse(raw.slice(jsonStart)) as { code?: unknown }).code
    return typeof code === 'string' && code !== '' ? code : null
  } catch {
    return null
  }
}

/**
 * 機械可読 code を表示言語のみのメッセージへ写像する（issue #358）。
 *
 * サーバーの detail は curl 利用者向けに日英連結だが、UI では表示言語の
 * 文言だけを出す。対応する code が無ければ null を返し、呼び出し側は
 * `extractApiErrorDetail` へフォールバックする。
 */
export function messageForApiErrorCode(
  raw: string | null | undefined,
  lang: Lang,
): string | null {
  const L = makeL(lang)
  const code = extractApiErrorCode(raw)
  if (code === 'forge_cli_not_found') {
    return L(
      'alpha-forge コマンドが見つかりません。AlphaForge を導入してください — https://alforgelabs.com',
      'alpha-forge command not found in PATH. Install AlphaForge — https://alforgelabs.com',
    )
  }
  return null
}

export function extractApiErrorDetail(
  raw: string | null | undefined,
  lang: Lang,
): string {
  if (raw) {
    const jsonStart = raw.indexOf('{')
    if (jsonStart >= 0) {
      try {
        const detail = (JSON.parse(raw.slice(jsonStart)) as { detail?: unknown })
          .detail
        if (typeof detail === 'string' && detail) return detail
      } catch {
        // JSON でないボディは normalizeErrorMessage に委ねる
      }
    }
  }
  return normalizeErrorMessage(raw, lang)
}
