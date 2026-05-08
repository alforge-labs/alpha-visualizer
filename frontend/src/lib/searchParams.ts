/**
 * URL params の単一キーを更新する（空値時は削除）。
 * 各 setter で重複していた `setSearchParams(prev => { const next = new URLSearchParams(prev); ... })` を集約する。
 */
export function updateParam(
  prev: URLSearchParams,
  key: string,
  value: string | null | undefined,
): URLSearchParams {
  const next = new URLSearchParams(prev)
  if (value == null || value === '') {
    next.delete(key)
  } else {
    next.set(key, value)
  }
  return next
}
