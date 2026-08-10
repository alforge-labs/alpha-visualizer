import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'

/** ポーリング間隔。復帰直後に画面を戻したいので短くする。 */
const POLL_INTERVAL_MS = 1000
/** 上限。これを超えたら無限スピナーにせず手動再起動を案内する。 */
export const RESTART_POLL_TIMEOUT_MS = 60_000

export interface UseServerRestartState {
  waiting: boolean
  timedOut: boolean
  begin: () => void
}

/**
 * 自己更新後のサーバー再起動を待つ hook。
 *
 * `/health` が返るまで 1 秒間隔でポーリングし、復帰したら `onRecovered`
 * （既定はページリロード）を 1 度だけ呼ぶ。上限まで復帰しなければ
 * `timedOut` を立てる。ここで諦めないと、再起動に失敗したときスピナーが
 * 永久に回り続け、ユーザーが原因にたどり着けない。
 */
export function useServerRestart(onRecovered?: () => void): UseServerRestartState {
  const [waiting, setWaiting] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const deadlineRef = useRef(0)
  const doneRef = useRef(false)

  const stop = useCallback((): void => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // アンマウント時にタイマーを必ず片付ける
  useEffect(() => stop, [stop])

  const begin = useCallback((): void => {
    if (timerRef.current !== null) return
    doneRef.current = false
    setTimedOut(false)
    setWaiting(true)
    deadlineRef.current = Date.now() + RESTART_POLL_TIMEOUT_MS
    timerRef.current = setInterval(() => {
      if (Date.now() > deadlineRef.current) {
        stop()
        setWaiting(false)
        setTimedOut(true)
        return
      }
      api.getHealth()
        .then(() => {
          if (doneRef.current) return
          doneRef.current = true
          stop()
          setWaiting(false)
          if (onRecovered) {
            onRecovered()
          } else {
            window.location.reload()
          }
        })
        .catch(() => {
          // 再起動中は接続拒否が正常。次の間隔で再試行する
        })
    }, POLL_INTERVAL_MS)
  }, [onRecovered, stop])

  return { waiting, timedOut, begin }
}
