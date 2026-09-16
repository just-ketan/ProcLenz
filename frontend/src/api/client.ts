import { config, describeBackend } from "./config";
import { recordApiCall } from "./diagnostics";
import { ApiRequestError } from "./errors";
import type { ApiError } from "./types";

export type QueryValue = string | number | boolean | null | undefined | readonly string[];
export type QueryParams = Readonly<Record<string, QueryValue>>;
export type RequestTarget = "api" | "actuator";

export interface RequestOptions {
  query?: QueryParams | undefined;
  /** Plain objects are sent as JSON; strings, Blobs and streams are sent as-is with `contentType`. */
  body?: unknown;
  contentType?: string | undefined;
  target?: RequestTarget | undefined;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Headers;
  correlationId: string;
}

export function buildUrl(target: RequestTarget, path: string, query?: QueryParams): string {
  const base = target === "actuator" ? config.actuatorBaseUrl : config.apiBaseUrl;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "object") value.forEach((item) => search.append(key, item));
    else search.append(key, String(value));
  }
  const queryString = search.toString();
  return `${base}${path}${queryString ? `?${queryString}` : ""}`;
}

/** Matches the backend's accepted alphabet `[A-Za-z0-9._:-]{1,64}` so the ID is echoed, not replaced. */
function createCorrelationId(): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `pl-${random}`;
}

function isRawBody(body: unknown): body is BodyInit {
  return (
    typeof body === "string" ||
    (typeof Blob !== "undefined" && body instanceof Blob) ||
    (typeof FormData !== "undefined" && body instanceof FormData) ||
    (typeof ReadableStream !== "undefined" && body instanceof ReadableStream)
  );
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

function isApiErrorBody(value: unknown): value is ApiError {
  return typeof value === "object" && value !== null && "code" in value && "message" in value;
}

export async function apiRequest<T>(method: string, path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const target = options.target ?? "api";
  const url = buildUrl(target, path, options.query);
  const correlationId = createCorrelationId();
  const headers = new Headers({ Accept: "application/json", "X-Correlation-Id": correlationId });
  const init: RequestInit & { duplex?: "half" } = { method, headers };

  if (options.body !== undefined) {
    if (isRawBody(options.body)) {
      init.body = options.body;
      if (options.contentType) headers.set("Content-Type", options.contentType);
      if (typeof ReadableStream !== "undefined" && options.body instanceof ReadableStream) init.duplex = "half";
    } else {
      init.body = JSON.stringify(options.body);
      headers.set("Content-Type", options.contentType ?? "application/json");
    }
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.requestTimeoutMs);
  init.signal = controller.signal;
  const startedAt = performance.now();
  const record = (status: number, code: string | undefined, responseCorrelationId: string) =>
    recordApiCall({
      method,
      url,
      status,
      code,
      durationMs: Math.round(performance.now() - startedAt),
      correlationId: responseCorrelationId,
      at: new Date().toISOString(),
    });

  let response: Response;
  let text: string;
  try {
    response = await fetch(url, init);
    text = await response.text();
  } catch {
    const code = timedOut ? "TIMEOUT" : "NETWORK_ERROR";
    record(0, code, correlationId);
    throw new ApiRequestError({
      status: 0,
      code,
      path,
      traceId: correlationId,
      message: timedOut
        ? `The request timed out after ${Math.round(config.requestTimeoutMs / 1000)}s`
        : `Cannot reach the backend at ${target === "actuator" ? config.actuatorBaseUrl : describeBackend()}`,
    });
  } finally {
    clearTimeout(timer);
  }

  const responseCorrelationId = response.headers.get("X-Correlation-Id") ?? correlationId;
  const payload = text ? parseJson(text) : undefined;

  if (!response.ok) {
    const retryAfterSeconds = parseRetryAfter(response.headers.get("Retry-After"));
    const error = isApiErrorBody(payload)
      ? new ApiRequestError({
          status: response.status,
          code: payload.code,
          message: payload.message,
          path: payload.path ?? path,
          traceId: payload.traceId ?? responseCorrelationId,
          fieldErrors: payload.fieldErrors,
          details: payload.details,
          retryAfterSeconds,
        })
      : new ApiRequestError({
          status: response.status,
          code: `HTTP_${response.status}`,
          message: `The server responded with HTTP ${response.status}`,
          path,
          traceId: responseCorrelationId,
          retryAfterSeconds,
        });
    record(response.status, error.code, responseCorrelationId);
    throw error;
  }

  if (text && payload === undefined) {
    // Typically an HTML page: the base URL points at the frontend host instead of the backend.
    record(response.status, "UNEXPECTED_RESPONSE", responseCorrelationId);
    throw new ApiRequestError({
      status: response.status,
      code: "UNEXPECTED_RESPONSE",
      path,
      traceId: responseCorrelationId,
      message: "The backend returned a non-JSON response. Check VITE_API_BASE_URL or the API rewrite.",
    });
  }

  record(response.status, undefined, responseCorrelationId);
  return { data: payload as T, status: response.status, headers: response.headers, correlationId: responseCorrelationId };
}
