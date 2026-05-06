import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import type { Theme, Variation } from '../hooks/useTheme'

interface VariationToggleProps {
  variation: Variation
  onChange: (v: Variation) => void
  lang?: Lang
}

export function VariationToggle({
  variation,
  onChange,
  lang = 'en',
}: VariationToggleProps) {
  const L = makeL(lang)
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

interface LangToggleProps {
  lang: Lang
  onChange: (l: Lang) => void
}

export function LangToggle({ lang, onChange }: LangToggleProps) {
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

interface ThemeToggleProps {
  theme: Theme
  onChange: (t: Theme) => void
  lang?: Lang
}

export function ThemeToggle({ theme, onChange, lang = 'en' }: ThemeToggleProps) {
  const L = makeL(lang)
  return (
    <div
      role="radiogroup"
      aria-label={L('カラーモード', 'Color mode')}
      style={{
        display: 'inline-flex',
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-pill)',
        padding: 2,
        gap: 2,
      }}
    >
      {(['light', 'dark'] as const).map((t) => {
        const active = t === theme
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={t === 'light' ? L('ライトモード', 'Light mode') : L('ダークモード', 'Dark mode')}
            onClick={() => onChange(t)}
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
              cursor: 'pointer',
              transition: 'background var(--motion-fast), color var(--motion-fast)',
            }}
          >
            {t === 'light' ? '☀' : '☾'}
          </button>
        )
      })}
    </div>
  )
}

interface SettingsTogglesProps {
  lang: Lang
  onSetLang: (l: Lang) => void
  theme: Theme
  onSetTheme: (t: Theme) => void
}

export function SettingsToggles({ lang, onSetLang, theme, onSetTheme }: SettingsTogglesProps) {
  return (
    <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      <ThemeToggle theme={theme} onChange={onSetTheme} lang={lang} />
      <LangToggle lang={lang} onChange={onSetLang} />
    </div>
  )
}
