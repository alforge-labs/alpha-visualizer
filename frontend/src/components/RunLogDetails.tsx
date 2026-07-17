import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'

const SUMMARY_STYLE: React.CSSProperties = {
  cursor: 'pointer',
  fontFamily: 'var(--mono)',
  fontSize: 'var(--fs-mono-sm)',
  color: 'var(--text3)',
  letterSpacing: 'var(--tracking-mono)',
}

const PRE_STYLE: React.CSSProperties = {
  margin: '8px 0 0',
  padding: '8px 12px',
  maxHeight: 180,
  overflow: 'auto',
  whiteSpace: 'pre-wrap',
  fontFamily: 'var(--mono)',
  fontSize: 'var(--fs-mono-sm)',
  color: 'var(--text2)',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
}

interface RunLogDetailsProps {
  log: string
  lang: Lang
}

/** 折りたたみ式の実行ログ表示（/api/run 再実行とジョブ実行 UI で共用）。 */
export function RunLogDetails({ log, lang }: RunLogDetailsProps): React.ReactElement {
  const L = makeL(lang)
  return (
    <details>
      <summary style={SUMMARY_STYLE}>{L('実行ログ', 'Run log')}</summary>
      <pre style={PRE_STYLE}>{log}</pre>
    </details>
  )
}
