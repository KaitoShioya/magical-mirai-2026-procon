/// <reference types="vite/client" />

// vite.config.ts の define で注入する環境値の型。
interface ImportMetaEnv {
  /** TextAlive アプリトークン（.env の TEXT_ALIVE_API_TOKEN を注入） */
  readonly VITE_TEXTALIVE_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
