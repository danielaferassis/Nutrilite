/// <reference types="vite/client" />

// Variáveis de ambiente do frontend (definidas em frontend/.env)
interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string
  readonly VITE_LOG_LEVEL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
