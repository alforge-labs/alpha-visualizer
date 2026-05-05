import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'

// セルフホスト化したフォント（OFL）。各 weight × latin subset のみを意図的に絞り込む。
// これらが Google Fonts の preconnect に置き換わるため index.html の <link> は不要。
import '@fontsource/source-serif-4/latin-600.css'
import '@fontsource/inter-tight/latin-400.css'
import '@fontsource/inter-tight/latin-500.css'
import '@fontsource/inter-tight/latin-600.css'
import '@fontsource/jetbrains-mono/latin-500.css'

import './design/tokens.css'
import './design/a11y.css'

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('#root element not found in index.html')
}

createRoot(rootEl).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
)
