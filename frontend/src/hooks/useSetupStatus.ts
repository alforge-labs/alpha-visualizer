import { useEffect, useSyncExternalStore } from 'react'
import { api } from '../api/client'

/**
 * セットアップ完了状態（`/api/setup/status` の `ready`）の共有ストア
 * （issue #493）。
 *
 * RootLayout（ナビの「はじめる」強調判定）と StartPage が別インスタンスで
 * 参照するため、共有しないと画面遷移のたびにサーバー側で forge CLI の集約
 * 呼び出し（並列 4 サブプロセス）が走る。`useAgentBackends` と同じ発想だが、
 * セットアップ状態は**セッション中に変わる**（ユーザーがコマンドを実行して
 * 進める）ため、StartPage が新鮮な取得結果を `publishSetupReady` で流し込み、
 * ナビの強調が完了と同時に消えるようにする。
 */

type SetupReadyState = boolean | null

let state: SetupReadyState = null
let fetchStarted = false
const listeners = new Set<() => void>()

function subscribe(callback: () => void): () => void {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

function getSnapshot(): SetupReadyState {
  return state
}

/** 最新の ready を全購読者へ反映する（StartPage の再取得と同期させる用）。 */
export function publishSetupReady(ready: boolean): void {
  if (state === ready) return
  state = ready
  for (const listener of listeners) listener()
}

function ensureFetched(): void {
  if (fetchStarted) return
  fetchStarted = true
  api
    .getSetupStatus()
    .then((res) => publishSetupReady(res.ready))
    .catch(() => {
      // 失敗時は null のまま（強調しない縮退）。GUI 全体は巻き込まない
    })
}

/** テスト専用: 共有状態を破棄する（テスト間の持ち越し防止）。 */
export function resetSetupReadyForTest(): void {
  state = null
  fetchStarted = false
}

/**
 * セットアップ完了状態を返す。`null` = 未取得・判定不能（強調しない）。
 * 複数の呼び出し元がマウントしても取得は 1 回に集約される。
 */
export function useSetupReady(): SetupReadyState {
  useEffect(() => {
    ensureFetched()
  }, [])
  return useSyncExternalStore(subscribe, getSnapshot)
}
