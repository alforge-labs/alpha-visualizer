import type { ReactElement } from 'react'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { jobErrorMessage } from '../../lib/errorMessage'

/** 進捗パネルに表示するログ末尾の行数（DataPage と同方針）。 */
const LOG_TAIL_LINES = 20

const BUTTON_STYLE: React.CSSProperties = {
  padding: '6px 12px',
  fontFamily: 'var(--mono)',
  fontSize: '0.85rem',
  color: 'var(--text)',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
}

export interface LiveRefreshPanelProps {
  lang: Lang
  running: boolean
  logLines: string[]
  error: string | null
  onStart: () => void
  /**
   * 実行中ジョブのキャンセルを要求する。live refresh の step 1（oracle-strike
   * への SSH rsync）はトンネル障害でブロックすると DEFAULT_JOB_TIMEOUT_SEC
   * （既定 1 時間）までボタンが disabled のままになるため、キャンセル手段が
   * 必須（PR #506 最終レビュー指摘）。
   */
  onCancel: () => void
}

/**
 * ライブデータ一括更新（forge live refresh）の起動ボタンと進捗表示。
 *
 * sync-events → data update → replay の進捗は forge が stderr に流す行を
 * ジョブ SSE 経由でそのまま表示する。パラメータは forge.yaml の live.replay が
 * SSoT のため入力 UI は無い。
 *
 * Live 一覧は SQLite 直読みで forge CLI に依存しないため、このボタンが
 * ジョブ作成失敗（403 local_write_disabled / 503 forge_cli_not_found 等）を
 * 利用者に伝える唯一の信号になる。表示条件は `error` の有無のみとする
 * （PR #506 最終レビュー指摘）。表示用の文言写像は `jobErrorMessage` に集約
 * している（issue #508）。
 */
export function LiveRefreshPanel({
  lang,
  running,
  logLines,
  error,
  onStart,
  onCancel,
}: LiveRefreshPanelProps): ReactElement {
  const L = makeL(lang)
  const displayError = jobErrorMessage(error, lang)

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
        style={{ ...BUTTON_STYLE, cursor: running ? 'default' : 'pointer' }}
      >
        {L('ライブデータを更新', 'Refresh live data')}
      </button>
      {running && (
        <>
          <button
            type="button"
            onClick={onCancel}
            style={{ ...BUTTON_STYLE, marginLeft: 'var(--space-2)' }}
          >
            {L('キャンセル', 'Cancel')}
          </button>
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
        </>
      )}
      {!running && displayError && (
        <div
          style={{
            marginTop: 'var(--space-2)',
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
            color: 'var(--danger)',
          }}
        >
          {displayError}
        </div>
      )}
    </div>
  )
}
