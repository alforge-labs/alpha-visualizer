import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import type { Theme } from '../hooks/useTheme'
import { Button } from '../design/primitives/Button'
import { Chip } from '../design/primitives/Chip'
import { Toolbar } from '../design/primitives/Toolbar'
import { Divider } from '../design/primitives/Divider'
import { OverflowMenu, type OverflowMenuItem } from '../design/primitives/OverflowMenu'
import { SettingsToggles } from './SettingsToggles'

interface DetailToolbarProps {
  strategyName: string
  symbol: string
  timeframe: string
  lang: Lang
  onSetLang: (l: Lang) => void
  theme: Theme
  onSetTheme: (t: Theme) => void
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
  onSetLang,
  theme,
  onSetTheme,
  onBack,
  onRun,
  onAddToCompare,
  running,
  canRun,
}: DetailToolbarProps) {
  const L = makeL(lang)

  // 768px 以下では trailing が wrap してしまうため、副次アクションをまとめて
  // OverflowMenu に集約する（issue #54）。
  const overflowItems: OverflowMenuItem[] = [
    { label: L('比較に追加', 'Add to compare'), onClick: onAddToCompare },
    {
      label: lang === 'ja' ? 'English に切替' : 'Switch to 日本語',
      onClick: () => onSetLang(lang === 'ja' ? 'en' : 'ja'),
    },
    {
      label: theme === 'dark' ? L('ライトテーマ', 'Light theme') : L('ダークテーマ', 'Dark theme'),
      onClick: () => onSetTheme(theme === 'dark' ? 'light' : 'dark'),
    },
  ]

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
          <span
            className="u-hide-md-down"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}
          >
            <SettingsToggles
              lang={lang}
              onSetLang={onSetLang}
              theme={theme}
              onSetTheme={onSetTheme}
            />
            <Divider orientation="vertical" />
            <Button variant="subtle" onClick={onAddToCompare}>
              {L('比較に追加', 'Add to compare')}
            </Button>
          </span>
          <Button variant="primary" onClick={onRun} disabled={running || !canRun}>
            {running ? L('実行中…', 'Running…') : L('再実行', 'Run')}
          </Button>
          <span className="u-hide-md-up" data-testid="detail-toolbar-overflow">
            <OverflowMenu items={overflowItems} ariaLabel={L('その他の操作', 'More actions')} />
          </span>
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
