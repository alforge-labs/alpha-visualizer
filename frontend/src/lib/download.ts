/**
 * テキストファイルのダウンロード（issue #487）。
 *
 * CSV は BOM 付与の規約があるため `lib/csv.ts` の `downloadCsv` を使うこと。
 * こちらは Pine Script などプレーンテキスト汎用。
 */
export function downloadTextFile(
  filename: string,
  content: string,
  mimeType = 'text/plain;charset=utf-8',
): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
