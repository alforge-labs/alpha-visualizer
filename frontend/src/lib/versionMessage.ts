import { makeL } from '../i18n/strings'
import type { Lang } from '../i18n/strings'

/**
 * `ComponentVersion.code` を表示言語のみのメッセージへ写像する。
 *
 * サーバーの `message` は curl 利用者向けに日英連結だが、UI では表示言語の
 * 文言だけを出す（`messageForApiErrorCode` と同じ方針・issue #358）。
 * そのまま出すと英語表示のユーザーに日本語が先に見えてしまう。
 *
 * 対応する code が無ければ null を返し、呼び出し側は `message` へ
 * フォールバックする（新しい code をサーバーが先に返し始めても、
 * 日英併記のまま出るだけで表示が消えない）。
 */
export function messageForVersionCode(
  code: string | null | undefined,
  lang: Lang,
): string | null {
  const L = makeL(lang)
  if (code === 'forge_version_unknown') {
    return L(
      'alpha-forge のバージョンを取得できませんでした（未導入または実行に失敗）',
      'Could not read the alpha-forge version (not installed, or the command failed)',
    )
  }
  if (code === 'forge_eula_not_accepted') {
    return L(
      'AlphaForge の使用許諾契約（EULA）に同意していないため実行できません。ターミナルで `alpha-forge system doctor` を実行し、EULA に同意してください',
      'AlphaForge EULA has not been accepted. Run `alpha-forge system doctor` in a terminal and accept the EULA',
    )
  }
  if (code === 'strike_not_synced') {
    return L(
      '`alpha-forge live sync-events` を実行すると alpha-strike のバージョンが表示されます',
      'Run `alpha-forge live sync-events` to show the alpha-strike version',
    )
  }
  if (code === 'windows_manual_update') {
    return L(
      'Windows では実行中のプロセスを置き換えられないため、`pip install -U alpha-visualizer` を実行してから再起動してください',
      'On Windows the running process cannot be replaced. Run `pip install -U alpha-visualizer`, then restart.',
    )
  }
  return null
}
