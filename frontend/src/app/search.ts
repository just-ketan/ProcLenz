// Parsers for URL search params. Every key is optional so links never have to spell out defaults.

export function stringParam(value: unknown): string | undefined {
  if (typeof value === "number") return String(value);
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export function intParam(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

export function oneOf<T extends string>(value: unknown, options: readonly T[]): T | undefined {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : undefined;
}
