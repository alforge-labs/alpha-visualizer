import { useEffect } from 'react'
import { useLocation } from 'react-router'

const STORAGE_PREFIX = 'alphaforge.nav:'

/**
 * セクションごとに「最後に見ていた URL params」を覚え、グローバルナビから
 * 戻ったときに同じ状態を復元する。
 *
 * 絞り込み・並べ替え・比較対象といった画面状態は URL params が単一の情報源
 * なので、覚えるのは検索文字列だけでよい。ナビのリンク先を `/browse` から
 * `/browse?q=…` へ差し替えるだけで済み、ディープリンクも戻る/進むも
 * これまで通り効く。
 *
 * 保存先が sessionStorage なのはタブを閉じたら忘れてよい寿命だから
 * （スクロール位置を復元する useScrollRestoration と同じ方針）。
 */

/**
 * sessionStorage は Safari のプライベートモードや容量超過で例外を投げる。
 * 状態の復元は「効けば嬉しい」付加機能なので、読めなければ記憶なし＝素の
 * パスへ遷移する形に倒す。ここで完結させてよい失敗であり、上位に伝播させる
 * 意味のあるエラーではない。
 */
function readSearch(path: string): string {
  try {
    return sessionStorage.getItem(STORAGE_PREFIX + path) ?? ''
  } catch {
    return ''
  }
}

function writeSearch(path: string, search: string): void {
  try {
    if (search === '') sessionStorage.removeItem(STORAGE_PREFIX + path)
    else sessionStorage.setItem(STORAGE_PREFIX + path, search)
  } catch {
    // 記憶できなくても素のパスへは遷移できる（readSearch のコメント参照）
  }
}

/** 記憶済みの URL params を付けたパスを返す。記憶が無ければ素のパス。 */
export function navMemoryPath(path: string): string {
  return path + readSearch(path)
}

/**
 * セクションの記憶を捨てる。記憶が実態と食い違う操作から呼ぶ。
 * 例: 比較対象が空になったとき。残しておくとナビの「比較」が、
 * たった今外した戦略を連れ戻してしまう。
 */
export function clearNavMemory(path: string): void {
  writeSearch(path, '')
}

/**
 * 現在地が `paths` のいずれかなら、その URL params を記憶する。
 * 戻り値は各セクションの復元先パスを返す解決関数。
 */
export function useNavMemory(paths: readonly string[]): (path: string) => string {
  const { pathname, search } = useLocation()

  useEffect(() => {
    if (!paths.includes(pathname)) return
    writeSearch(pathname, search)
  }, [paths, pathname, search])

  // 現在地だけは sessionStorage ではなく location から解決する。書き込みが
  // effect なので、同じ render で読むと 1 手前の値が返ってしまう。
  return (path: string): string =>
    path === pathname ? pathname + search : navMemoryPath(path)
}
