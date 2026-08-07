import type { ReactElement } from 'react'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import type { JobStatus } from '../../api/types'

/** 進捗パネルに表示するログ末尾の行数（DataPage と同方針）。 */
const LOG_TAIL_LINES = 20

export interface LiveRefreshPanelProps {
  lang: Lang
  running: boolean
  logLines: string[]
  status: JobStatus | null
  error: string | null
  onStart: () => void
}

/**
 * ライブデータ一括更新（forge live refresh）の起動ボタンと進捗表示。
 *
 * sync-events → data update → replay の進捗は forge が stderr に流す行を
 * ジョブ SSE 経由でそのまま表示する。パラメータは forge.yaml の live.replay が
 * SSoT のため入力 UI は無い。
 */
export function LiveRefreshPanel({
  lang,
  running,
  logLines,
  status,
  error,
  onStart,
}: LiveRefreshPanelProps): ReactElement {
  const L = makeL(lang)
  return (
    <div
      style={{
        padding: 'var(--space-4) var(--space-7)',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
      }}
    >
      <button
        type="button"
        onClick={onStart}
        disabled={running}
        style={{
          padding: '6px 12px',
          fontFamily: 'var(--mono)',
          fontSize: '0.85rem',
          color: 'var(--text)',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          cursor: running ? 'default' : 'pointer',
        }}
      >
        {L('ライブデータを更新', 'Refresh live data')}
      </button>
      {running && (
        <pre
          aria-live="polite"
          style={{
            margin: 'var(--space-2) 0 0',
            whiteSpace: 'pre-wrap',
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
            color: 'var(--text3)',
            maxHeight: 160,
            overflowY: 'auto',
            overflowX: 'auto',
          }}
        >
          {logLines.slice(-LOG_TAIL_LINES).join('\n')}
        </pre>
      )}
      {!running && status === 'failed' && error && (
        <div
          style={{
            marginTop: 'var(--space-2)',
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
            color: 'var(--danger)',
          }}
        >
          {error}
        </div>
      )}
    </div>
  )
}
