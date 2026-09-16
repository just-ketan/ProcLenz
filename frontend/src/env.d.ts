/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin, e.g. https://api.proclenz.example. Empty means same origin (dev proxy or Vercel rewrite). */
  readonly VITE_API_BASE_URL?: string;
  /** Actuator base URL. Defaults to `${VITE_API_BASE_URL}/actuator`. */
  readonly VITE_ACTUATOR_BASE_URL?: string;
  /** "true" uses bundled fixtures, "false" calls the backend. Unset: fixtures only when no API base URL is set. */
  readonly VITE_USE_MOCK_DATA?: string;
  readonly VITE_DEFAULT_PROCESS_KEY?: string;
  readonly VITE_REQUEST_TIMEOUT_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
