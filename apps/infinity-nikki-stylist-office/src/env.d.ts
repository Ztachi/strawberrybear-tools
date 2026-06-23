/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 当前应用发版号，由 Vite 从 package.json 注入。 */
  readonly VITE_APP_VERSION: string
}
