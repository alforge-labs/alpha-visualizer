import { useEffect } from 'react'

const SUFFIX = 'AlphaForge Viewer'

/**
 * ルート/戦略に応じて document.title を更新する（issue #263）。
 * 固定タイトルだとマルチタブ・履歴・共有で画面を識別できないため、各ページが
 * 自分の文脈タイトルを渡す。title 未指定時はアプリ名のみ。
 */
export function useDocumentTitle(title?: string): void {
  useEffect(() => {
    document.title = title ? `${title} — ${SUFFIX}` : SUFFIX
  }, [title])
}
