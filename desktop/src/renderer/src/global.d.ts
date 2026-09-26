import type { AutaApi } from '@shared/types'
import type { SageApi } from '@shared/sage'

declare global {
  interface Window {
    auta: AutaApi
    sage: SageApi
  }
}

export {}
