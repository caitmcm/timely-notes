import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AuthGate from './AuthGate.tsx'
import { AuthBoundary } from './auth/AuthBoundary.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthBoundary>
      <AuthGate />
    </AuthBoundary>
  </StrictMode>,
)
