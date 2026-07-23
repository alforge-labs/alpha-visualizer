/**
 * TV チャートの可視範囲を双方向に同期する hook（issue #318）。
 *
 * 従来は「プリセット range → チャート」の一方向適用だけで、チャート上の
 * パン/ズームはどこにも記録されなかった。本 hook は
 * `subscribeVisibleTimeRangeChange` を購読して共有状態へ書き戻し、
 * 逆に共有状態が変わったらチャートへ適用する。
 *
 * ループ防止:
 * - 自分で `setVisibleRange` した直後はライブラリからエコーが返る。これを
 *   ユーザー操作と誤認すると「適用 → 書き戻し → 適用」の往復になるため、
 *   適用後 `ECHO_SUPPRESS_MS` の間だけ受信を無視する。
 * - ドラッグ中はイベントが毎フレーム飛ぶので `USER_RANGE_DEBOUNCE_MS` で束ねる。
 */
import { useCallback, useContext, useEffect, useRef } from 'react'
import type { IChartApi, Time } from 'lightweight-charts'

import { DashboardContext, type SyncedTimeRange } from '../contexts/DashboardContext'

/** ドラッグ中の連続イベントを束ねる時間 */
export const USER_RANGE_DEBOUNCE_MS = 150
/** 自分の適用に対するエコーを無視する時間 */
export const ECHO_SUPPRESS_MS = 250

export interface UseSyncedTimeRangeParams {
  /** 対象チャート。生成前は null を渡してよい */
  chart: IChartApi | null
  /** データ全体の範囲。共有範囲が無いときに適用する */
  fullRange: SyncedTimeRange | null
}

function isSameRange(a: SyncedTimeRange | null, b: SyncedTimeRange | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.from === b.from && a.to === b.to
}

export function useSyncedTimeRange({ chart, fullRange }: UseSyncedTimeRangeParams): void {
  // Provider の外（Compare/WFO など単独チャート）でも使えるよう optional に読む
  const ctx = useContext(DashboardContext)
  const syncedTimeRange = ctx?.syncedTimeRange ?? null
  const setSyncedTimeRange = ctx?.setSyncedTimeRange

  const suppressUntilRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 適用済みの範囲。同じ値の再適用を避けて無駄な再描画を減らす
  const appliedRef = useRef<SyncedTimeRange | null>(null)

  // 現在時刻の比較ではなくタイマーで解除する（テストで fake timers を使うため）
  const suppressEcho = useCallback(() => {
    suppressUntilRef.current += 1
    setTimeout(() => {
      suppressUntilRef.current = Math.max(0, suppressUntilRef.current - 1)
    }, ECHO_SUPPRESS_MS)
  }, [])

  // 共有範囲（無ければデータ全体）をチャートへ適用する
  useEffect(() => {
    if (!chart) return
    const target = syncedTimeRange ?? fullRange
    if (!target) return
    if (isSameRange(appliedRef.current, target)) return
    appliedRef.current = target
    suppressEcho()
    chart.timeScale().setVisibleRange(target)
  }, [chart, syncedTimeRange, fullRange, suppressEcho])

  // チャート側のパン/ズームを共有状態へ書き戻す
  useEffect(() => {
    if (!chart || !setSyncedTimeRange) return
    const timeScale = chart.timeScale()

    const handler = (range: { from: Time; to: Time } | null): void => {
      // 自分の適用によるエコーは無視する
      if (suppressUntilRef.current > 0) return
      // 範囲が確定していないイベント（データ未設定など）は捨てる
      if (!range) return

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        const next = { from: range.from, to: range.to }
        if (isSameRange(appliedRef.current, next)) return
        appliedRef.current = next
        setSyncedTimeRange(next)
      }, USER_RANGE_DEBOUNCE_MS)
    }

    timeScale.subscribeVisibleTimeRangeChange(handler)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      timeScale.unsubscribeVisibleTimeRangeChange(handler)
    }
  }, [chart, setSyncedTimeRange])
}
