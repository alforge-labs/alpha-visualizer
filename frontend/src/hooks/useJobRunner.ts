import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { CreateJobParams, JobStatus } from '../api/types'

const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['succeeded', 'failed', 'cancelled'])

/** SSE 切断時のポーリングフォールバック間隔（ms） */
const POLL_FALLBACK_INTERVAL_MS = 3000

interface SseEvent {
  type: 'snapshot' | 'log' | 'status'
  status?: string
  lines?: string[]
  seq?: number
  result?: Record<string, unknown> | null
  error?: string | null
}

export interface UseJobRunnerResult {
  /** ジョブを起動して SSE 購読を開始する。作成 API が失敗したら false */
  start: (params: CreateJobParams) => Promise<boolean>
  /** 実行中ジョブのキャンセルを要求する */
  cancel: () => Promise<void>
  jobId: string | null
  status: JobStatus | null
  logLines: string[]
  result: Record<string, unknown> | null
  error: string | null
  /** 起動要求〜terminal 到達までの間 true */
  running: boolean
}

/**
 * 非同期ジョブ（optimize / WFT / backtest）の起動・進捗購読・キャンセルを担うフック。
 *
 * 進捗は SSE（/api/jobs/{id}/events）で受け、切断時は getJob ポーリングに
 * フォールバックする（ジョブ自体はサーバー側で継続しているため）。
 * issue #292 (GUI化 Wave B)。
 */
export function useJobRunner(onFinished?: (status: JobStatus) => void): UseJobRunnerResult {
  const [jobId, setJobId] = useState<string | null>(null)
  const [status, setStatus] = useState<JobStatus | null>(null)
  const [logLines, setLogLines] = useState<string[]>([])
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  const esRef = useRef<EventSource | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // onFinished をインライン関数で渡されても購読を張り直さないよう ref 経由にする
  const onFinishedRef = useRef(onFinished)
  useEffect(() => {
    onFinishedRef.current = onFinished
  }, [onFinished])

  const closeStream = useCallback(() => {
    esRef.current?.close()
    esRef.current = null
    if (pollRef.current !== null) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => closeStream, [closeStream])

  const finish = useCallback(
    (
      finalStatus: JobStatus,
      finalResult: Record<string, unknown> | null,
      finalError: string | null,
    ) => {
      closeStream()
      setStatus(finalStatus)
      setResult(finalResult)
      setError(finalError)
      setRunning(false)
      onFinishedRef.current?.(finalStatus)
    },
    [closeStream],
  )

  const pollUntilTerminal = useCallback(
    (id: string) => {
      pollRef.current = setInterval(() => {
        void (async () => {
          try {
            const detail = await api.getJob(id)
            if (detail.log_tail) setLogLines(detail.log_tail.split('\n'))
            if (TERMINAL_STATUSES.has(detail.status)) {
              // finish() が closeStream 経由で interval を止める
              finish(detail.status as JobStatus, detail.result, detail.error)
              return
            }
            setStatus(detail.status as JobStatus)
          } catch {
            // 一時的な取得失敗はリトライで対処する（次のポーリングへ続行）
          }
        })()
      }, POLL_FALLBACK_INTERVAL_MS)
    },
    [finish],
  )

  const start = useCallback(
    async (params: CreateJobParams): Promise<boolean> => {
      closeStream()
      setJobId(null)
      setStatus(null)
      setLogLines([])
      setResult(null)
      setError(null)
      setRunning(true)
      try {
        const job = await api.createJob(params)
        setJobId(job.job_id)
        setStatus(job.status as JobStatus)

        const es = new EventSource(`/api/jobs/${encodeURIComponent(job.job_id)}/events`)
        esRef.current = es
        es.onmessage = (ev: MessageEvent<string>) => {
          const data = JSON.parse(ev.data) as SseEvent
          if (data.type === 'snapshot') {
            setLogLines(data.lines ?? [])
            if (data.status) setStatus(data.status as JobStatus)
          } else if (data.type === 'log') {
            setLogLines((prev) => [...prev, ...(data.lines ?? [])])
          } else if (data.type === 'status' && data.status) {
            finish(data.status as JobStatus, data.result ?? null, data.error ?? null)
          }
        }
        es.onerror = () => {
          // SSE 切断（プロキシ・ネットワーク要因）。ジョブはサーバー側で
          // 継続しているため、ポーリングにフォールバックして追跡を続ける。
          if (esRef.current === es) {
            es.close()
            esRef.current = null
            pollUntilTerminal(job.job_id)
          }
        }
        return true
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setRunning(false)
        return false
      }
    },
    [closeStream, finish, pollUntilTerminal],
  )

  const cancel = useCallback(async (): Promise<void> => {
    if (!jobId) return
    try {
      await api.cancelJob(jobId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [jobId])

  return { start, cancel, jobId, status, logLines, result, error, running }
}
