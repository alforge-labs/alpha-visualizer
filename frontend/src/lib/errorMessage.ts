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
