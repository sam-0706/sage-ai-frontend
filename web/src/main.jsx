import React from 'react'
import ReactDOM from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './tokens.css'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {__CLERK_KEY__ ? <ClerkProvider publishableKey={__CLERK_KEY__} afterSignOutUrl="/"><BrowserRouter><App /></BrowserRouter></ClerkProvider> : <main className="setup"><h1>SAGE needs its publishable identity key.</h1><p>Add VITE_CLERK_PUBLISHABLE_KEY to the frontend environment.</p></main>}
  </React.StrictMode>,
)
