import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import type { Variation } from '../hooks/useTheme'
import { Button } from '../design/primitives/Button'
import { Chip } from '../design/primitives/Chip'
import { Toolbar } from '../design/primitives/Toolbar'
import { Divider } from '../design/primitives/Divider'
import { SettingsToggles } from './SettingsToggles'

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
          <SettingsToggles
            variation={variation}
            onSetVariation={onSetVariation}
            lang={lang}
            onSetLang={onSetLang}
          />
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
