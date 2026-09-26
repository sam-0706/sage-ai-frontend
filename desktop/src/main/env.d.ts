/// <reference types="electron-vite/node" />
interface ImportMetaEnv {
  readonly MAIN_VITE_SAGE_API_URL?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
