import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Noto Sans JP（ローカルバンドル・オフライン対応。必要な subset のみ読み込まれる）
import '@fontsource/noto-sans-jp/400.css'
import '@fontsource/noto-sans-jp/500.css'
import '@fontsource/noto-sans-jp/700.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
