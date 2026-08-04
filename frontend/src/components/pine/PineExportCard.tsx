import { useState } from 'react'
import { api } from '../../api/client'
import type { PineScriptResponse } from '../../api/types'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { downloadTextFile } from '../../lib/download'
import { extractApiErrorDetail } from '../../lib/errorMessage'
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

const SCRIPT_STYLE: React.CSSProperties = {
  margin: 'var(--space-3) 0 0',
  padding: 'var(--space-3)',
  maxHeight: 320,
  overflow: 'auto',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  fontFamily: 'var(--mono)',
  fontSize: 'var(--fs-mono-sm)',
  color: 'var(--text2)',
  whiteSpace: 'pre',
}

interface Props {
  strategyId: string
  lang: Lang
}

/**
 * Pine Script エクスポートカード（issue #487）。
 *
 * 「TradingView へ出力」— `POST /api/pine/{id}`（`pine preview` 委譲）で
 * Pine v6 本文を取得し、プレビュー・コピー・`.pine` ダウンロードを提供する。
 * Trial プランでは CLI の entitlement エラー（有料プラン案内）が detail で
 * 返り、そのまま表示する（アップグレード導線の作り込みは issue #488）。
 */
export function PineExportCard({ strategyId, lang }: Props) {
  const L = makeL(lang)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PineScriptResponse | null>(null)
  const [copied, setCopied] = useState(false)

  const handleGenerate = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      setResult(await api.generatePine(strategyId))
    } catch (e: unknown) {
      setResult(null)
      // entitlement 拒否等はサーバー detail がユーザー向け文言なので抽出して表示
      setError(
        extractApiErrorDetail(e instanceof Error ? e.message : String(e), lang),
      )
    } finally {
      setBusy(false)
    }
  }

  const handleCopy = async (): Promise<void> => {
    if (result == null) return
    try {
      await navigator.clipboard.writeText(result.script)
      setCopied(true)
    } catch {
      // clipboard API が使えない環境（非 HTTPS 等）はプレビューから手動コピー
      setCopied(false)
    }
  }

  return (
    <section style={CARD_STYLE} aria-label={L('TradingView へ出力', 'Export to TradingView')}>
      <p style={{ ...LABEL_STYLE, margin: 0 }}>
        {L('TradingView へ出力', 'Export to TradingView')}
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
          'この戦略から TradingView 用の Pine Script（v6）を生成します。生成した内容をコピーまたはダウンロードして、TradingView の Pine エディタに貼り付けてください。',
          'Generates TradingView Pine Script (v6) from this strategy. Copy or download the output and paste it into the TradingView Pine editor.',
        )}
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button onClick={() => void handleGenerate()} disabled={busy}>
          {busy
            ? L('生成中…', 'Generating…')
            : L('Pine Script を生成', 'Generate Pine Script')}
        </Button>
        {result != null && (
          <>
            <Button onClick={() => void handleCopy()}>
              {copied ? L('コピーしました', 'Copied') : L('コピー', 'Copy')}
            </Button>
            <Button onClick={() => downloadTextFile(result.filename, result.script)}>
              {L('ダウンロード', 'Download')}
            </Button>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 'var(--fs-mono-sm)',
                color: 'var(--text3)',
              }}
            >
              {result.filename}
            </span>
          </>
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
      {result != null && <pre style={SCRIPT_STYLE}>{result.script}</pre>}
    </section>
  )
}
