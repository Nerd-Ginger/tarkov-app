/**
 * Tarkov Quest Tracker — author: Nerd_Ginger
 * https://github.com/Nerd-Ginger/tarkov-app
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Console watermark so the author survives the single-file bundle.
console.info('Tarkov Quest Tracker — by Nerd_Ginger · https://github.com/Nerd-Ginger/tarkov-app')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
