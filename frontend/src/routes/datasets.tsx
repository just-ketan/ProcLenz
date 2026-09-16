import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api";
import { CAPABILITIES } from "@/api/capabilities";
import { CapabilityUnavailable, EmptyState, LoadingState, QueryView } from "@/components/feedback/states";
import { PageHeader, Panel } from "@/components/proclenz/ui";
import { Button } from "@/components/ui/button";
import { formatCount, formatDateTime, formatDuration } from "@/domain/format";
import { useCapabilities } from "@/hooks/queries";

export const Route = createFileRoute("/datasets")({
  head: () => ({ meta: [{ title: "Datasets · Proclenz" }] }),
  component: DatasetsPage,
});

function DatasetsPage() {
  const capabilities = useCapabilities(["datasets"]);
  const available = capabilities.data?.datasets === true;
  const datasets = useQuery({ queryKey: ["datasets"], queryFn: () => api.listDatasets({ page: 0, size: 50 }), enabled: available });

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Data" title="Datasets" description="Event logs uploaded as CSV files and processed on the server, each tracked as a first-class dataset." />
      {capabilities.isPending ? (
        <Panel>
          <LoadingState label="Checking backend capabilities…" />
        </Panel>
      ) : available ? (
        <Panel title="Datasets">
          <QueryView query={datasets} loadingLabel="Loading datasets…">
            {(page) =>
              page.content.length === 0 ? (
                <EmptyState title="No datasets yet" />
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Process</th>
                        <th>Status</th>
                        <th className="numeric">Rows</th>
                        <th className="numeric">Accepted</th>
                        <th className="numeric">Duplicates</th>
                        <th className="numeric">Invalid</th>
                        <th>Started</th>
                        <th className="numeric">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {page.content.map((dataset) => (
                        <tr key={dataset.id}>
                          <td>{dataset.name}</td>
                          <td className="mono-value">{dataset.processKey}</td>
                          <td>
                            <span className="chip">{dataset.status}</span>
                          </td>
                          <td className="numeric mono-value">{formatCount(dataset.rowsRead)}</td>
                          <td className="numeric mono-value">{formatCount(dataset.acceptedEvents)}</td>
                          <td className="numeric mono-value">{formatCount(dataset.duplicateEvents)}</td>
                          <td className="numeric mono-value">{formatCount(dataset.invalidRows)}</td>
                          <td>{formatDateTime(dataset.startedAt)}</td>
                          <td className="numeric mono-value">{formatDuration(dataset.durationMs)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </QueryView>
        </Panel>
      ) : (
        <>
          <Panel>
            <CapabilityUnavailable
              title="Server-side CSV datasets"
              probe={CAPABILITIES.datasets.probe}
              description="Uploading a CSV as a named dataset, streamed and validated on the server with live progress, is designed but not shipped by this backend yet. Events can already be ingested in bulk from the Ingestion page, including CSV files converted in the browser."
              action={
                <Button asChild size="sm">
                  <Link to="/ingestion">Go to Ingestion</Link>
                </Button>
              }
            />
          </Panel>
          <Panel eyebrow="WHAT IT WILL ACCEPT" title="Expected CSV format">
            <div className="panel-body text-[11px] leading-relaxed">
              <p>
                One row per event with a header row. Required columns: <code>case_id</code>, <code>activity</code>, <code>timestamp</code> (ISO-8601 with a zone, e.g. <code>2026-09-15T09:00:00Z</code>). Optional:{" "}
                <code>event_id</code>, <code>resource</code>.
              </p>
              <pre className="mt-3 overflow-x-auto rounded border bg-muted p-3 font-mono text-[10px]">
                {`event_id,case_id,activity,timestamp,resource
evt-1,ORD-1001,Order Created,2026-09-15T09:00:00Z,web-shop
evt-2,ORD-1001,Order Approved,2026-09-15T09:14:00Z,approver-2`}
              </pre>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
