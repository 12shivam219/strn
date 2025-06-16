/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_SIGNALING_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
