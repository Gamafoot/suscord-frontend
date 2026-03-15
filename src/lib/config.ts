export const BACKEND_HTTP_ORIGIN =
  import.meta.env.VITE_BACKEND_ORIGIN?.trim().replace(/\/+$/, '') || 'http://localhost:8000';
export const API_BASE = `${BACKEND_HTTP_ORIGIN}/api`;
export const WS_BASE = `${BACKEND_HTTP_ORIGIN.replace(/^http/, 'ws')}/ws`;
export const FETCH_TIMEOUT_MS = Math.max(Number(import.meta.env.VITE_FETCH_TIMEOUT_MS) || 5000, 1);
