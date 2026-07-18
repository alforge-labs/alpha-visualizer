import { useState } from 'react'
import { api } from '../../api/client'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { Button } from '../../design/primitives'

/** バックエンド（DuplicateStrategyRequest.new_strategy_id）と同じ ID 規約 */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

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
  width: 220,
  padding: '4px 8px',
  fontFamily: 'var(--mono)',
  fontSize: 'var(--fs-mono-sm)',
  color: 'var(--text)',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
}

interface Props {
  strategyId: string
  lang: Lang
  /** 複製成功時に新しい strategy_id で呼ばれる（遷移は Page 側の責務） */
  onDuplicated: (newStrategyId: string) => void
}

/**
 * 既存戦略を別 ID で複製して新規戦略として登録するカード（vis#301）。
 *
 * 登録は `forge strategy save`（--force なし）への委譲で、ID 衝突は
 * 409 で拒否される（既存戦略が上書きされることはない）。複製後は
 * チューニングループ（TuningPanel）でパラメータを調整して育てる想定。
 */
export function DuplicateStrategyCard({ strategyId, lang, onDuplicated }: Props) {
  const L = makeL(lang)
  const [newId, setNewId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = newId.trim()
  const patternOk = ID_PATTERN.test(trimmed)
  const valid = patternOk && trimmed !== strategyId

  const handleDuplicate = async (): Promise<void> => {
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await api.duplicateStrategy(strategyId, trimmed)
      onDuplicated(result.strategy_id)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      style={CARD_STYLE}
      aria-label={L('複製して新規作成', 'Duplicate as new strategy')}
    >
      <p style={{ ...LABEL_STYLE, margin: 0 }}>
        {L('複製して新規作成', 'Duplicate as new strategy')}
      </p>
      <p
        style={{
          margin: 'var(--space-2) 0',
          fontFamily: 'var(--sans)',
          fontSize: 'var(--fs-caption)',
          color: 'var(--text3)',
        }}
      >
        {L(
          'この戦略の定義をコピーして別 ID で登録します（元の戦略は変更されません）。複製後にパラメータを調整して新しい戦略として育てられます。',
          'Copies this strategy definition under a new ID (the original is unchanged). Tune the parameters afterwards to grow it into a new strategy.',
        )}
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          value={newId}
          onChange={(e) => setNewId(e.target.value)}
          placeholder={`${strategyId}_v2`}
          aria-label={L('新しい戦略 ID', 'New strategy ID')}
          style={INPUT_STYLE}
          disabled={busy}
        />
        <Button
          onClick={() => void handleDuplicate()}
          disabled={!valid || busy}
        >
          {busy ? L('複製中…', 'Duplicating…') : L('複製', 'Duplicate')}
        </Button>
        {trimmed !== '' && !patternOk && (
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 'var(--fs-mono-sm)',
              color: 'var(--warn)',
            }}
          >
            {L(
              '英数字・ハイフン・アンダースコアのみ（先頭は英数字）',
              'Letters, digits, hyphen, underscore only (must start alphanumeric)',
            )}
          </span>
        )}
      </div>
      {error && (
        <p
          role="alert"
          style={{
            margin: 'var(--space-2) 0 0',
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
            color: 'var(--danger)',
            whiteSpace: 'pre-wrap',
          }}
        >
          {error}
        </p>
      )}
    </section>
  )
}
