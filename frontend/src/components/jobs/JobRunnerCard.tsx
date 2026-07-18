import { useState } from 'react'
import type { JobStatus } from '../../api/types'
import { useJobRunner } from '../../hooks/useJobRunner'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { Button } from '../../design/primitives'

const CARD_STYLE: React.CSSProperties = {
  padding: 'var(--space-4)',
  marginTop: 'var(--space-4)',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
}

const LABEL_STYLE: React.CSSProperties = {
  fontFamily: 'var(--sans)',
  fontSize: 'var(--fs-caption)',
  fontWeight: 500,
  color: 'var(--text3)',
  letterSpacing: 'var(--tracking-caption)',
  textTransform: 'uppercase',
}

const INPUT_STYLE: React.CSSProperties = {
  width: 90,
  padding: '4px 8px',
  fontFamily: 'var(--mono)',
  fontSize: 'var(--fs-mono-sm)',
  color: 'var(--text)',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
}

const LOG_STYLE: React.CSSProperties = {
  margin: 'var(--space-3) 0 0',
  padding: '8px 12px',
  maxHeight: 220,
  overflow: 'auto',
  whiteSpace: 'pre-wrap',
  fontFamily: 'var(--mono)',
  fontSize: 'var(--fs-mono-sm)',
  color: 'var(--text2)',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
}

const STATUS_COLOR: Record<string, string> = {
  queued: 'var(--text3)',
  running: 'var(--accent)',
  succeeded: 'var(--success, var(--accent))',
  failed: 'var(--danger)',
  cancelled: 'var(--text3)',
}

interface JobRunnerCardProps {
  kind: 'optimize' | 'wft'
  strategyId: string
  symbol: string
  lang: Lang
  /** ジョブが terminal に到達したときに呼ばれる（succeeded 時のデータ再取得など） */
  onFinished?: (status: JobStatus) => void
}

/**
 * optimize / WFT ジョブの起動・進捗ライブ表示・キャンセルをまとめたカード。
 * issue #292 (GUI化 Wave B)。
 */
export function JobRunnerCard({
  kind,
  strategyId,
  symbol,
  lang,
  onFinished,
}: JobRunnerCardProps): React.ReactElement {
  const L = makeL(lang)
  const { start, cancel, status, logLines, result, error, running } = useJobRunner(onFinished)
  const [optionValue, setOptionValue] = useState('')

  const isOptimize = kind === 'optimize'
  const title = isOptimize
    ? L('最適化を実行', 'Run optimization')
    : L('ウォークフォワードテストを実行', 'Run walk-forward test')
  const optionLabel = isOptimize
    ? L('トライアル数（空欄 = forge 既定）', 'Trials (empty = forge default)')
    : L('ウィンドウ数（空欄 = 既定 5）', 'Windows (empty = default 5)')

  const statusLabels: Record<string, string> = {
    queued: L('待機中', 'Queued'),
    running: L('実行中', 'Running'),
    succeeded: L('成功', 'Succeeded'),
    failed: L('失敗', 'Failed'),
    cancelled: L('キャンセル済み', 'Cancelled'),
  }

  const optionMin = isOptimize ? 1 : 2
  const optionMax = isOptimize ? 1000 : 20

  const handleStart = (): void => {
    const parsed = optionValue.trim() === '' ? undefined : Number(optionValue)
    // <input min/max> は打鍵入力を制限しないため、送信前に API の許容範囲へクランプする
    const numeric =
      parsed !== undefined && Number.isFinite(parsed)
        ? Math.min(optionMax, Math.max(optionMin, Math.round(parsed)))
        : undefined
    void start({
      kind,
      strategy_id: strategyId,
      symbol,
      trials: isOptimize ? numeric : undefined,
      windows: isOptimize ? undefined : numeric,
    })
  }

  // 結果要約はスカラー値と 1 段のスカラー dict のみ（backend で圧縮済み）
  const resultEntries = result
    ? Object.entries(result).filter(([, v]) => v !== null && v !== undefined)
    : []

  return (
    <section style={CARD_STYLE} aria-label={title}>
      <div style={LABEL_STYLE}>{title}</div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          marginTop: 'var(--space-3)',
          flexWrap: 'wrap',
        }}
      >
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
            color: 'var(--text2)',
          }}
        >
          {optionLabel}
          <input
            type="number"
            min={optionMin}
            max={optionMax}
            value={optionValue}
            onChange={(e) => setOptionValue(e.target.value)}
            disabled={running}
            style={INPUT_STYLE}
          />
        </label>
        <Button variant="subtle" size="sm" onClick={handleStart} disabled={running || !symbol}>
          {running ? L('実行中…', 'Running…') : L('実行', 'Start')}
        </Button>
        {running && (
          <Button variant="subtle" size="sm" onClick={() => void cancel()}>
            {L('キャンセル', 'Cancel')}
          </Button>
        )}
        {status && (
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 'var(--fs-mono-sm)',
              color: STATUS_COLOR[status] ?? 'var(--text2)',
              letterSpacing: 'var(--tracking-mono)',
            }}
          >
            {statusLabels[status] ?? status}
          </span>
        )}
      </div>

      {!isOptimize && (
        <p
          style={{
            margin: 'var(--space-2) 0 0',
            fontFamily: 'var(--sans)',
            fontSize: 'var(--fs-caption)',
            color: 'var(--text3)',
          }}
        >
          {L(
            'WFT の結果は DB に記録され、完了時に WFO タブへ自動反映されます。',
            'WFT results are recorded to the DB and reflected in the WFO tab on completion.',
          )}
        </p>
      )}

      {error && (
        <p
          style={{
            margin: 'var(--space-3) 0 0',
            padding: '8px 12px',
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
            color: 'var(--danger)',
            background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--danger) 24%, transparent)',
            borderRadius: 'var(--radius-sm)',
            whiteSpace: 'pre-wrap',
          }}
        >
          {error}
        </p>
      )}

      {logLines.length > 0 && (
        <pre style={LOG_STYLE} aria-label={L('ジョブログ', 'Job log')}>
          {logLines.join('\n')}
        </pre>
      )}

      {status === 'succeeded' && resultEntries.length > 0 && (
        <dl
          style={{
            margin: 'var(--space-3) 0 0',
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '4px 16px',
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
            color: 'var(--text2)',
          }}
        >
          {resultEntries.map(([key, value]) => (
            <div key={key} style={{ display: 'contents' }}>
              <dt style={{ color: 'var(--text3)' }}>{key}</dt>
              <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>
                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
