// The only module that reads build-time environment variables.

function trimTrailingSlashes(value: string | undefined): string {
  return (value ?? "").trim().replace(/\/+$/, "");
}

const apiBaseUrl = trimTrailingSlashes(import.meta.env.VITE_API_BASE_URL);
const mockSetting = (import.meta.env.VITE_USE_MOCK_DATA ?? "").trim().toLowerCase();
const timeout = Number(import.meta.env.VITE_REQUEST_TIMEOUT_MS);

export const config = {
  /** Empty string: same origin (Vite dev proxy locally, Vercel rewrite when deployed). */
  apiBaseUrl,
  actuatorBaseUrl: trimTrailingSlashes(import.meta.env.VITE_ACTUATOR_BASE_URL) || `${apiBaseUrl}/actuator`,
  /** Explicit "true"/"false" wins; otherwise fixtures are used only when no backend URL is configured. */
  useMockData: mockSetting === "true" ? true : mockSetting === "false" ? false : apiBaseUrl === "",
  defaultProcessKey: (import.meta.env.VITE_DEFAULT_PROCESS_KEY ?? "").trim() || "order-to-cash",
  requestTimeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 30_000,
} as const;

export function describeBackend(): string {
  return config.apiBaseUrl || (typeof window === "undefined" ? "same origin" : window.location.origin);
}
