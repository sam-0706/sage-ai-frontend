import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/manrope'
import '@fontsource-variable/jetbrains-mono'
import { App } from './App'
import { AutaProvider } from './state'
import { SageProvider } from './sage/state'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SageProvider>
      <AutaProvider>
        <App />
      </AutaProvider>
    </SageProvider>
  </React.StrictMode>
)
