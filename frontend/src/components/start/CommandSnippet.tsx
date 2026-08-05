import { useState } from 'react'
import type { ReactElement } from 'react'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { Button } from '../../design/primitives'

interface Props {
  command: string
  lang: Lang
}

/**
 * ターミナルで実行してもらうコマンドの提示 + コピー（issue #492）。
 *
 * セットアップの一部（EULA 同意・認証ログイン・workspace 初期化）は意図的に
 * GUI へ複製せず CLI に委ねるため、「はじめる」画面はコマンドを正確に
 * 手渡すことに徹する。
 */
export function CommandSnippet({ command, lang }: Props): ReactElement {
  const L = makeL(lang)
  const [copied, setCopied] = useState(false)
  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
    } catch {
      // clipboard API が使えない環境（非 HTTPS 等）は表示から手動コピー
      setCopied(false)
    }
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 'var(--space-2)' }}>
      <code
        style={{
          padding: '6px 10px',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          fontFamily: 'var(--mono)',
          fontSize: 'var(--fs-mono-sm)',
          color: 'var(--text)',
        }}
      >
        {command}
      </code>
      <Button size="sm" variant="ghost" onClick={() => void handleCopy()}>
        {copied ? L('コピーしました', 'Copied') : L('コピー', 'Copy')}
      </Button>
    </div>
  )
}
