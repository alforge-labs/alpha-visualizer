import type { CSSProperties } from 'react'

/** 視覚的に隠しつつスクリーンリーダーには読ませる clip 法のスタイル（issue #262/#259）。 */
export const SR_ONLY_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
}
