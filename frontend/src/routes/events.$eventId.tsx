import { createFileRoute, Link } from "@tanstack/react-router";
import { usePreferences } from "@/app/preferences";
import { QueryView } from "@/components/feedback/states";
import { CopyButton, DefinitionList, PageHeader, Panel } from "@/components/proclenz/ui";
import { arrivalDelayMs, FORMULAS } from "@/domain/derived";
import { formatDate, formatDuration, formatTime } from "@/domain/format";
import { useEvent } from "@/hooks/queries";

export const Route = createFileRoute("/events/$eventId")({
  head: () => ({ meta: [{ title: "Event · Proclenz" }] }),
  component: EventPage,
});

function EventPage() {
  const { eventId } = Route.useParams();
  const { timeDisplay } = usePreferences();
  const event = useEvent(eventId);

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Event" title="Event details" description="One stored event, with the lineage that makes ingestion idempotent." />
      <QueryView query={event} loadingLabel="Loading event…">
        {(data) => (
          <div className="two-column">
            <Panel eyebrow="STORED EVENT" title={data.activity}>
              <div className="panel-body">
                <DefinitionList
                  items={[
                    {
                      label: "Event ID",
                      value: (
                        <span className="inline-form">
                          {data.eventId}
                          <CopyButton value={data.eventId} label="Copy event ID" />
                        </span>
                      ),
                    },
                    {
                      label: "Process",
                      value: (
                        <Link to="/p/$processKey/overview" params={{ processKey: data.processKey }} className="link">
                          {data.processKey}
                        </Link>
                      ),
                    },
                    {
                      label: "Case",
                      value: (
                        <Link to="/p/$processKey/cases/$caseId" params={{ processKey: data.processKey, caseId: data.caseId }} className="link">
                          {data.caseId}
                        </Link>
                      ),
                    },
                    { label: "Activity", value: data.activity },
                    { label: "Occurred at", value: `${formatDate(data.timestamp, timeDisplay)} ${formatTime(data.timestamp, timeDisplay)}` },
                    { label: "Resource", value: data.resource ?? "—" },
                  ]}
                />
              </div>
            </Panel>
            <Panel eyebrow="LINEAGE" title="Identity and arrival">
              <div className="panel-body">
                <DefinitionList
                  items={[
                    {
                      label: "Idempotency key",
                      value: (
                        <span className="inline-form" title={data.eventIdentity}>
                          {data.eventIdentity.slice(0, 16)}…
                          <CopyButton value={data.eventIdentity} label="Copy identity" />
                        </span>
                      ),
                      info: "SHA-256 of the producer event ID when one was supplied, otherwise of the canonical event content. A unique constraint on it makes ingestion idempotent.",
                    },
                    { label: "Producer event ID", value: data.sourceEventId ?? "none (content fingerprint)" },
                    { label: "Ingested at", value: `${formatDate(data.ingestedAt, timeDisplay)} ${formatTime(data.ingestedAt, timeDisplay)}` },
                    { label: "Arrival delay", value: formatDuration(arrivalDelayMs(data.timestamp, data.ingestedAt)), info: FORMULAS.arrivalDelay },
                  ]}
                />
                <p className="muted mt-3 text-[10px] leading-relaxed">
                  Resubmitting this event (same producer ID, or the same process, case, activity, timestamp and resource) returns this stored event instead of creating a second one.
                </p>
              </div>
            </Panel>
          </div>
        )}
      </QueryView>
    </div>
  );
}
