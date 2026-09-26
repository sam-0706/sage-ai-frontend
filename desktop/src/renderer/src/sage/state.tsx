import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { SageAuthState } from '@shared/sage'
import { api, type Me } from './api'

interface SageState {
  auth: SageAuthState | null
  me: Me | null
  onboarded: boolean | null
  loadingError: string
  refreshMe: () => Promise<void>
  setAuth: (s: SageAuthState) => void
}

const Ctx = createContext<SageState | null>(null)

export function SageProvider({ children }: { children: ReactNode }) {
  const [loadingError, setLoadingError] = useState('')
  const [auth, setAuth] = useState<SageAuthState | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [onboarded, setOnboarded] = useState<boolean | null>(null)

  const refreshMe = useCallback(async () => {
    setLoadingError('')
    try {
      const [m, ob] = await Promise.all([api.get<Me>('/v1/me'), api.get<{ completed: boolean }>('/v1/onboarding')])
      setMe(m)
      setOnboarded(ob.completed)
    } catch (e) {
      setLoadingError(e instanceof Error ? e.message : 'Account setup failed. Please retry.')
    }
  }, [])

  useEffect(() => {
    void window.sage.authStatus().then(setAuth).catch(() => setAuth({ status: 'offline' }))
    return window.sage.onAuth(setAuth)
  }, [])

  useEffect(() => {
    if (auth?.status === 'signed_in') void refreshMe()
    if (auth?.status === 'signed_out') {
      setMe(null)
      setOnboarded(null)
    }
  }, [auth?.status, refreshMe])

  return <Ctx.Provider value={{ auth, me, onboarded, loadingError, refreshMe, setAuth }}>{children}</Ctx.Provider>
}

export function useSage(): SageState {
  const c = useContext(Ctx)
  if (!c) throw new Error('useSage must be used within SageProvider')
  return c
}
