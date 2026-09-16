import type { ApiFieldError } from "./types";

export interface ApiRequestErrorInit {
  status: number;
  code: string;
  message: string;
  path: string;
  traceId?: string | undefined;
  fieldErrors?: ApiFieldError[] | undefined;
  details?: Record<string, unknown> | undefined;
  retryAfterSeconds?: number | undefined;
}

/**
 * Every failed API call surfaces as this error. Backend failures carry the ApiError fields; transport
 * failures use the synthetic codes NETWORK_ERROR, TIMEOUT, UNEXPECTED_RESPONSE or HTTP_<status>.
 */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly path: string;
  readonly traceId: string | undefined;
  readonly fieldErrors: ApiFieldError[];
  readonly details: Record<string, unknown>;
  readonly retryAfterSeconds: number | undefined;

  constructor(init: ApiRequestErrorInit) {
    super(init.message);
    this.name = "ApiRequestError";
    this.status = init.status;
    this.code = init.code;
    this.path = init.path;
    this.traceId = init.traceId;
    this.fieldErrors = init.fieldErrors ?? [];
    this.details = init.details ?? {};
    this.retryAfterSeconds = init.retryAfterSeconds;
  }

  get isTransportFailure(): boolean {
    return this.code === "NETWORK_ERROR" || this.code === "TIMEOUT";
  }

  /** Mirrors the backend failure classes: only transport failures and 503 are worth retrying automatically. */
  get isRetryable(): boolean {
    return this.isTransportFailure || this.status === 503;
  }
}

export function isApiRequestError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError;
}

export function hasErrorCode(error: unknown, ...codes: string[]): boolean {
  return isApiRequestError(error) && codes.includes(error.code);
}
