// Browser-side CSV → NDJSON conversion for the Ingestion page. It only reshapes rows into the event
// request format; validation and deduplication stay on the backend.

export const MAX_CSV_BYTES = 20 * 1024 * 1024;

const REQUIRED_COLUMNS = ["case_id", "activity", "timestamp"] as const;

/** Splits one CSV record, honouring double-quoted fields and escaped quotes (""). */
export function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

export interface CsvConversion {
  ndjson: string;
  rows: number;
}

export function csvToNdjson(text: string, processKey: string): CsvConversion {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const header = parseCsvRow(lines[0] ?? "").map((column) => column.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    throw new Error(`The CSV header must contain ${REQUIRED_COLUMNS.join(", ")}. Missing: ${missing.join(", ")}. Found: ${header.join(", ") || "(empty)"}.`);
  }
  const column = (name: string) => header.indexOf(name);
  const indexes = {
    eventId: column("event_id"),
    caseId: column("case_id"),
    activity: column("activity"),
    timestamp: column("timestamp"),
    resource: column("resource"),
  };
  const value = (fields: string[], index: number) => (index >= 0 ? (fields[index] ?? "").trim() : "");

  const events = lines.slice(1).map((line) => {
    const fields = parseCsvRow(line);
    const eventId = value(fields, indexes.eventId);
    const resource = value(fields, indexes.resource);
    return JSON.stringify({
      ...(eventId ? { eventId } : {}),
      processKey,
      caseId: value(fields, indexes.caseId),
      activity: value(fields, indexes.activity),
      timestamp: value(fields, indexes.timestamp),
      ...(resource ? { resource } : {}),
    });
  });
  return { ndjson: events.join("\n"), rows: events.length };
}
