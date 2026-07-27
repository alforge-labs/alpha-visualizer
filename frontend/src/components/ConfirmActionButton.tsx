import { useState } from 'react'
import type { ReactElement } from 'react'
import { Button, ConfirmDialog } from '../design/primitives'
import { SR_ONLY_STYLE } from '../design/primitives/srOnly'
import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'

export interface ConfirmActionButtonProps {
  /** トリガーボタンのラベル（選択件数・容量などを含む） */
  triggerLabel: string
  triggerDisabled?: boolean
  title: string
  body: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  lang: Lang
}

/**
 * トリガーボタンと確認モーダルを 1 セットにしたコンポーネント。
 *
 * `screens/` は `useState` を持てない（ADR-0001）ため、不可逆な操作を
 * 1 クリックで実行させないための開閉 state はここに閉じ込める
 * （`components/browser/CollapsibleSection.tsx` が同じ理由で自前 state を
 * 持っている前例に倣う）。モーダル自体の見た目・Escape キー処理は
 * 既存の `design/primitives/ConfirmDialog` に委譲する
 * （このコンポーネントとは shape が異なる別物。名前が紛らわしいため
 * `ConfirmActionButton` と命名して区別する）。
 */
export function ConfirmActionButton({
  triggerLabel,
  triggerDisabled = false,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  lang,
}: ConfirmActionButtonProps): ReactElement {
  const [open, setOpen] = useState(false)
  const L = makeL(lang)

  const handleConfirm = (): void => {
    setOpen(false)
    onConfirm()
  }

  return (
    <>
      <Button
        variant="primary"
        disabled={triggerDisabled}
        onClick={() => setOpen(true)}
        style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
      >
        {triggerLabel}
      </Button>
      <ConfirmDialog
        open={open}
        title={title}
        message={
          <>
            {body}
            <span style={SR_ONLY_STYLE}>
              {L('Escape キーでキャンセルできます', 'Press Escape to cancel')}
            </span>
          </>
        }
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
        tone="danger"
      />
    </>
  )
}
