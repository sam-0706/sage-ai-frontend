// Contract between the SAGE main-process client and the renderer.

export type SageAuthState =
  | { status: 'signed_out'; reason?: string; code?: string }
  | { status: 'waiting'; userCode: string; verificationUrl: string }
  | { status: 'signed_in'; email: string; name?: string; dev?: boolean }
  | { status: 'offline'; reason?: string }

export interface SageApi {
  authStatus: () => Promise<SageAuthState>
  signIn: () => Promise<SageAuthState>
  cancelSignIn: () => Promise<SageAuthState>
  signOut: () => Promise<SageAuthState>
  onAuth: (cb: (s: SageAuthState) => void) => () => void
  /** Authenticated call to the SAGE API (path must start with /v1/). Rejects with {message, status, code}. */
  request: <T = any>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown) => Promise<T>
  openExternal: (url: string) => Promise<void>
  apiBase: () => Promise<string>
}
