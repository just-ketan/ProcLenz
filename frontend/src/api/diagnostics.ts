// In-memory log of recent API calls for the diagnostics drawer. Subscribable without a state library.

export interface ApiCallRecord {
  id: number;
  method: string;
  url: string;
  status: number;
  code: string | undefined;
  durationMs: number;
  correlationId: string;
  at: string;
}

const MAX_RECORDS = 50;
const EMPTY: ApiCallRecord[] = [];
const listeners = new Set<() => void>();
let records: ApiCallRecord[] = EMPTY;
let sequence = 0;

export function recordApiCall(call: Omit<ApiCallRecord, "id">): void {
  records = [{ ...call, id: ++sequence }, ...records].slice(0, MAX_RECORDS);
  listeners.forEach((listener) => listener());
}

export function subscribeToApiCalls(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getApiCalls(): ApiCallRecord[] {
  return records;
}

export function getServerApiCalls(): ApiCallRecord[] {
  return EMPTY;
}
