import { useMemo, useState } from 'react'
import { api } from '../../api/client'
import { useJobRunner } from '../../hooks/useJobRunner'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { Button, ConfirmDialog } from '../../design/primitives'

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
  width: 120,
  padding: '4px 8px',
  fontFamily: 'var(--mono)',
  fontSize: 'var(--fs-mono-sm)',
  color: 'var(--text)',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
}

const MONO_SM: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 'var(--fs-mono-sm)',
  letterSpacing: 'var(--tracking-mono)',
}

const LOG_STYLE: React.CSSProperties = {
  margin: 'var(--space-3) 0 0',
  padding: '8px 12px',
  maxHeight: 180,
  overflow: 'auto',
  whiteSpace: 'pre-wrap',
  ...MONO_SM,
  color: 'var(--text2)',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
}

/** チューニング比較に使うベースライン（現行定義での最新ラン）の指標。 */
export interface TuningBaseline {
  sharpe: number | null
  returnPct: number | null
  maxDrawdownPct: number | null
}

interface TuningPanelProps {
  strategyId: string
  symbol: string | null
  /** 現行の戦略パラメータ（strategy JSON の parameters） */
  parameters: Record<string, unknown>
  baseline: TuningBaseline | null
  lang: Lang
  /** 保存成功後に呼ばれる（戦略詳細の再フェッチなど） */
  onSaved?: () => void
}

/** 編集値をパラメータの元の型に合わせて解釈する（解釈不能・空欄は null = 変更なし）。 */
function parseEdit(original: unknown, raw: string): unknown | null {
  if (typeof original === 'number') {
    // Number('') は 0 になるため、空欄は「0 への変更」ではなく「未変更」として扱う
    if (raw.trim() === '') return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  if (typeof original === 'boolean') return raw === 'true'
  return raw
}

function metricCell(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '—'
}

/**
 * パラメータ編集 → 一時戦略でバックテスト → 比較 → 明示保存のチューニングループ。
 * 実行は Wave B のジョブ基盤（kind=backtest + parameters）、保存は
 * forge strategy save への委譲 API を使う。issue #293 (GUI化 Wave C)。
 */
export function TuningPanel({
  strategyId,
  symbol,
  parameters,
  baseline,
  lang,
  onSaved,
}: TuningPanelProps): React.ReactElement | null {
  const L = makeL(lang)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [confirmSave, setConfirmSave] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveDone, setSaveDone] = useState(false)
  const { start, cancel, status, logLines, result, error, running } = useJobRunner()

  // 戦略切替時の状態破棄は親側の key={strategyId} による再マウントで行う
  // （useJobRunner の内部状態まで含めて確実にリセットするため）。

  const editableKeys = useMemo(
    () =>
      Object.keys(parameters).filter((key) => {
        const v = parameters[key]
        return (
          typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string'
        )
      }),
    [parameters],
  )

  // 元の値から実際に変わったキーだけを送信対象にする
  const changed = useMemo(() => {
    const out: Record<string, unknown> = {}
    for (const [key, raw] of Object.entries(edits)) {
      const original = parameters[key]
      const parsed = parseEdit(original, raw)
      if (parsed !== null && parsed !== original) out[key] = parsed
    }
    return out
  }, [edits, parameters])
  const changedCount = Object.keys(changed).length

  if (editableKeys.length === 0) return null

  const handleRun = (): void => {
    if (!symbol || changedCount === 0) return
    setSaveDone(false)
    void start({
      kind: 'backtest',
      strategy_id: strategyId,
      symbol,
      parameters: changed,
    })
  }

  const handleSave = async (): Promise<void> => {
    setConfirmSave(false)
    setSaving(true)
    setSaveError(null)
    try {
      await api.saveStrategyParameters(strategyId, changed)
      setSaving(false)
      setSaveDone(true)
      setEdits({})
      onSaved?.()
    } catch (err) {
      setSaving(false)
      setSaveError(err instanceof Error ? err.message : String(err))
    }
  }

  const tunedMetrics =
    status === 'succeeded' && result && typeof result['metrics'] === 'object'
      ? (result['metrics'] as Record<string, unknown>)
      : null

  const statusLabels: Record<string, string> = {
    queued: L('待機中', 'Queued'),
    running: L('実行中', 'Running'),
    succeeded: L('成功', 'Succeeded'),
    failed: L('失敗', 'Failed'),
    cancelled: L('キャンセル済み', 'Cancelled'),
  }

  return (
    <section style={CARD_STYLE} aria-label={L('パラメータチューニング', 'Parameter tuning')}>
      <div style={LABEL_STYLE}>{L('パラメータチューニング', 'Parameter tuning')}</div>
      <p
        style={{
          margin: 'var(--space-2) 0 0',
          fontFamily: 'var(--sans)',
          fontSize: 'var(--fs-caption)',
          color: 'var(--text3)',
        }}
      >
        {L(
          '編集値は一時コピーで実行され、元の戦略定義は「保存」するまで変更されません。',
          'Edits run on a temporary copy; the strategy definition is unchanged until you save.',
        )}
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto auto',
          justifyContent: 'start',
          gap: '8px 16px',
          marginTop: 'var(--space-3)',
        }}
      >
        {editableKeys.map((key) => {
          const original = parameters[key]
          const rawValue = edits[key] ?? String(original)
          const isChanged = key in changed
          return (
            <label
              key={key}
              style={{
                display: 'contents',
              }}
            >
              <span
                style={{
                  ...MONO_SM,
                  alignSelf: 'center',
                  color: isChanged ? 'var(--accent)' : 'var(--text2)',
                }}
              >
                {key}
              </span>
              {typeof original === 'boolean' ? (
                <input
                  type="checkbox"
                  checked={rawValue === 'true'}
                  onChange={(e) =>
                    setEdits((prev) => ({ ...prev, [key]: String(e.target.checked) }))
                  }
                  disabled={running || saving}
                />
              ) : (
                <input
                  type={typeof original === 'number' ? 'number' : 'text'}
                  value={rawValue}
                  step="any"
                  onChange={(e) =>
                    setEdits((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  disabled={running || saving}
                  style={INPUT_STYLE}
                  aria-label={key}
                />
              )}
            </label>
          )
        })}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          marginTop: 'var(--space-4)',
          flexWrap: 'wrap',
        }}
      >
        <Button
          variant="subtle"
          size="sm"
          onClick={handleRun}
          disabled={running || saving || !symbol || changedCount === 0}
        >
          {running
            ? L('実行中…', 'Running…')
            : L('編集値でバックテスト実行', 'Run backtest with edits')}
        </Button>
        {running && (
          <Button variant="subtle" size="sm" onClick={() => void cancel()}>
            {L('キャンセル', 'Cancel')}
          </Button>
        )}
        <Button
          variant="subtle"
          size="sm"
          onClick={() => setConfirmSave(true)}
          disabled={running || saving || changedCount === 0}
        >
          {saving ? L('保存中…', 'Saving…') : L('この内容で戦略を保存', 'Save to strategy')}
        </Button>
        {status && (
          <span style={{ ...MONO_SM, color: 'var(--text3)' }}>
            {statusLabels[status] ?? status}
          </span>
        )}
        {saveDone && (
          <span style={{ ...MONO_SM, color: 'var(--accent)' }}>
            {L('保存しました', 'Saved')}
          </span>
        )}
      </div>

      {(error || saveError) && (
        <p
          style={{
            margin: 'var(--space-3) 0 0',
            padding: '8px 12px',
            ...MONO_SM,
            color: 'var(--danger)',
            background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--danger) 24%, transparent)',
            borderRadius: 'var(--radius-sm)',
            whiteSpace: 'pre-wrap',
          }}
        >
          {error ?? saveError}
        </p>
      )}

      {logLines.length > 0 && status !== 'succeeded' && (
        <pre style={LOG_STYLE} aria-label={L('チューニングログ', 'Tuning log')}>
          {logLines.join('\n')}
        </pre>
      )}

      {tunedMetrics && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <table style={{ ...MONO_SM, color: 'var(--text2)', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', paddingRight: 16 }} />
                <th style={{ textAlign: 'right', paddingRight: 16, color: 'var(--text3)' }}>
                  {L('現在', 'Current')}
                </th>
                <th style={{ textAlign: 'right', color: 'var(--accent)' }}>
                  {L('編集値', 'Tuned')}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ paddingRight: 16 }}>Sharpe</td>
                <td style={{ textAlign: 'right', paddingRight: 16 }}>
                  {metricCell(baseline?.sharpe)}
                </td>
                <td style={{ textAlign: 'right' }}>{metricCell(tunedMetrics['sharpe_ratio'])}</td>
              </tr>
              <tr>
                <td style={{ paddingRight: 16 }}>{L('リターン%', 'Return %')}</td>
                <td style={{ textAlign: 'right', paddingRight: 16 }}>
                  {metricCell(baseline?.returnPct)}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {metricCell(tunedMetrics['total_return_pct'])}
                </td>
              </tr>
              <tr>
                <td style={{ paddingRight: 16 }}>MaxDD %</td>
                <td style={{ textAlign: 'right', paddingRight: 16 }}>
                  {metricCell(baseline?.maxDrawdownPct)}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {metricCell(tunedMetrics['max_drawdown_pct'])}
                </td>
              </tr>
            </tbody>
          </table>
          <p
            style={{
              margin: 'var(--space-2) 0 0',
              fontFamily: 'var(--sans)',
              fontSize: 'var(--fs-caption)',
              color: 'var(--text3)',
            }}
          >
            {L(
              '試行ランも実行履歴に通常ランとして記録され、最新ラン（Backtest タブの既定表示）に影響します。',
              'Trial runs are recorded as regular runs in Run History and affect the latest run (default view of the Backtest tab).',
            )}
          </p>
        </div>
      )}

      <ConfirmDialog
        open={confirmSave}
        tone="danger"
        title={L('戦略定義を上書き保存', 'Overwrite strategy definition')}
        message={
          <div>
            <p style={{ margin: 0 }}>
              {L(
                '次のパラメータ変更を戦略定義へ書き戻します。この操作は元に戻せません。',
                'The following parameter changes will be written back to the strategy definition. This cannot be undone.',
              )}
            </p>
            <ul style={{ ...MONO_SM, margin: 'var(--space-2) 0 0', paddingLeft: 20 }}>
              {Object.entries(changed).map(([key, value]) => (
                <li key={key}>
                  {key}: {String(parameters[key])} → {String(value)}
                </li>
              ))}
            </ul>
          </div>
        }
        confirmLabel={L('保存する', 'Save')}
        cancelLabel={L('やめる', 'Cancel')}
        onConfirm={() => void handleSave()}
        onCancel={() => setConfirmSave(false)}
      />
    </section>
  )
}
