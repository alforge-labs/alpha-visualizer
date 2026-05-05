import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import type { Variation } from '../hooks/useTheme'
import { Button } from '../design/primitives/Button'
import { Chip } from '../design/primitives/Chip'
import { Toolbar } from '../design/primitives/Toolbar'
import { Divider } from '../design/primitives/Divider'

interface DetailToolbarProps {
  strategyName: string
  symbol: string
  timeframe: string
  lang: Lang
  variation: Variation
  onSetVariation: (v: Variation) => void
  onSetLang: (l: Lang) => void
  onBack: () => void
  onRun: () => void
  onAddToCompare: () => void
  running: boolean
  canRun: boolean
}

export function DetailToolbar({
  strategyName,
  symbol,
  timeframe,
  lang,
  variation,
  onSetVariation,
  onSetLang,
  onBack,
  onRun,
  onAddToCompare,
  running,
  canRun,
}: DetailToolbarProps) {
  const L = makeL(lang)

  return (
    <Toolbar
      sticky
      leading={
        <Button onClick={onBack} variant="link" title={L('一覧に戻る', 'Back to list')}>
          ← {L('一覧', 'Back')}
        </Button>
      }
      trailing={
        <>
          <VariationToggle variation={variation} onChange={onSetVariation} />
          <LangToggle lang={lang} onChange={onSetLang} />
          <Divider orientation="vertical" />
          <Button variant="subtle" onClick={onAddToCompare}>
            {L('比較に追加', 'Add to compare')}
          </Button>
          <Button variant="primary" onClick={onRun} disabled={running || !canRun}>
            {running ? L('実行中…', 'Running…') : L('再実行', 'Run')}
          </Button>
        </>
      }
    >
      <span
        style={{
          fontFamily: 'var(--serif)',
          fontSize: 'var(--fs-h2)',
          fontWeight: 600,
          color: 'var(--text)',
          letterSpacing: 'var(--tracking-display)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={strategyName}
      >
        {strategyName || '—'}
      </span>
      {(symbol || timeframe) && (
        <Chip tone="neutral">{[symbol, timeframe].filter(Boolean).join(' · ')}</Chip>
      )}
    </Toolbar>
  )
}

function VariationToggle({
  variation,
  onChange,
}: {
  variation: Variation
  onChange: (v: Variation) => void
}) {
  const L = makeL('en')
  return (
    <div
      role="radiogroup"
      aria-label={L('テーマ', 'Theme variation')}
      style={{
        display: 'inline-flex',
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-pill)',
        padding: 2,
        gap: 2,
      }}
    >
      {(['atelier', 'lab'] as const).map((v) => {
        const active = v === variation
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${L('テーマ', 'Theme')}: ${v}`}
            onClick={() => onChange(v)}
            style={{
              padding: '4px 12px',
              borderRadius: 'var(--radius-pill)',
              border: 'none',
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'var(--surface)' : 'var(--text2)',
              fontFamily: 'var(--mono)',
              fontSize: 'var(--fs-mono-sm)',
              fontWeight: 600,
              letterSpacing: 'var(--tracking-mono)',
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'background var(--motion-fast), color var(--motion-fast)',
            }}
          >
            {v}
          </button>
        )
      })}
    </div>
  )
}

function LangToggle({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  const L = makeL(lang)
  return (
    <div
      role="radiogroup"
      aria-label={L('言語', 'Language')}
      style={{
        display: 'inline-flex',
        gap: 2,
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-pill)',
        padding: 2,
      }}
    >
      {(['ja', 'en'] as const).map((l) => {
        const active = l === lang
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={l === 'ja' ? '日本語' : 'English'}
            onClick={() => onChange(l)}
            style={{
              padding: '4px 10px',
              borderRadius: 'var(--radius-pill)',
              border: 'none',
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'var(--surface)' : 'var(--text2)',
              fontFamily: 'var(--mono)',
              fontSize: 'var(--fs-mono-sm)',
              fontWeight: 600,
              letterSpacing: 'var(--tracking-mono)',
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'background var(--motion-fast), color var(--motion-fast)',
            }}
          >
            {l}
          </button>
        )
      })}
    </div>
  )
}
