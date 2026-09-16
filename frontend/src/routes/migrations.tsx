import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api";
import { CAPABILITIES } from "@/api/capabilities";
import { CapabilityUnavailable, EmptyState, LoadingState, QueryView } from "@/components/feedback/states";
import { PageHeader, Panel } from "@/components/proclenz/ui";
import { formatCount, formatDateTime } from "@/domain/format";
import { useCapabilities } from "@/hooks/queries";

export const Route = createFileRoute("/migrations")({
  head: () => ({ meta: [{ title: "Migrations · Proclenz" }] }),
  component: MigrationsPage,
});

function MigrationsPage() {
  const capabilities = useCapabilities(["migrations"]);
  const available = capabilities.data?.migrations === true;
  const migrations = useQuery({ queryKey: ["migrations"], queryFn: () => api.listMigrations(), enabled: available });

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Operate" title="Migrations" description="On-prem to cloud migration jobs: extract, transform, transfer and validate with record counts and checksums." />
      {capabilities.isPending ? (
        <Panel>
          <LoadingState label="Checking backend capabilities…" />
        </Panel>
      ) : available ? (
        <Panel title="Migration jobs">
          <QueryView query={migrations} loadingLabel="Loading migration jobs…">
            {(jobs) =>
              jobs.length === 0 ? (
                <EmptyState title="No migration jobs yet" />
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Job</th>
                        <th>Source → target</th>
                        <th>Status</th>
                        <th className="numeric">Extracted</th>
                        <th className="numeric">Transferred</th>
                        <th className="numeric">Validated</th>
                        <th className="numeric">Failures</th>
                        <th>Started</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.map((job) => (
                        <tr key={job.migrationId}>
                          <td className="mono-value">{job.migrationId.slice(0, 8)}</td>
                          <td>
                            {job.sourceDataset} → {job.targetDataset}
                          </td>
                          <td>
                            <span className="chip">{job.status}</span>
                          </td>
                          <td className="numeric mono-value">{formatCount(job.recordsExtracted)}</td>
                          <td className="numeric mono-value">{formatCount(job.recordsTransferred)}</td>
                          <td className="numeric mono-value">{formatCount(job.recordsValidated)}</td>
                          <td className="numeric mono-value">{formatCount(job.failures)}</td>
                          <td>{formatDateTime(job.startedAt)}</td>
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
        <Panel>
          <CapabilityUnavailable
            title="Migration jobs"
            probe={CAPABILITIES.migrations.probe}
            description="The migration subsystem validates on-prem to cloud transfers with record counts, order-independent checksums, uniqueness, timestamp sanity and key consistency. It is planned for a later backend release."
          />
        </Panel>
      )}
    </div>
  );
}
