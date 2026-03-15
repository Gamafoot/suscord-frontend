/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_ORIGIN?: string;
  readonly VITE_FETCH_TIMEOUT_MS?: string;
  readonly VITE_LIVEKIT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
