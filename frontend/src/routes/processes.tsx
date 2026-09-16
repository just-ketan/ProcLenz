import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { api } from "@/api";
import { config } from "@/api/config";
import { usePreferences } from "@/app/preferences";
import { CapabilityUnavailable, ErrorState, LoadingState, QueryView } from "@/components/feedback/states";
import { CAPABILITIES } from "@/api/capabilities";
import { PageHeader, Panel } from "@/components/proclenz/ui";
import { Button } from "@/components/ui/button";
import { formatCount, formatDate, formatDuration, formatPercent } from "@/domain/format";
import { useCapabilities } from "@/hooks/queries";

export const Route = createFileRoute("/processes")({
  head: () => ({ meta: [{ title: "Processes · Proclenz" }] }),
  component: ProcessesPage,
});

const PROCESS_KEY_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

function ProcessesPage() {
  const capabilities = useCapabilities(["processRegistry"]);
  const registryAvailable = capabilities.data?.processRegistry === true;
  const registry = useQuery({ queryKey: ["processes"], queryFn: () => api.listProcesses(), enabled: registryAvailable });

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Data" title="Processes" description="The processes events are ingested into. Each process key has its own event log, cases and analytics." />
      {capabilities.isPending ? (
        <Panel>
          <LoadingState label="Checking backend capabilities…" />
        </Panel>
      ) : registryAvailable ? (
        <Panel title="Process registry">
          <QueryView query={registry} loadingLabel="Loading processes…">
            {(processes) => (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Process</th>
                      <th className="numeric">Events</th>
                      <th className="numeric">Cases</th>
                      <th>First event</th>
                      <th>Last event</th>
                      <th>SLA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processes.map((process) => (
                      <tr key={process.processKey}>
                        <td>
                          <Link to="/p/$processKey/overview" params={{ processKey: process.processKey }} className="link">
                            {process.displayName ?? process.processKey}
                          </Link>
                        </td>
                        <td className="numeric mono-value">{formatCount(process.eventCount)}</td>
                        <td className="numeric mono-value">{formatCount(process.caseCount)}</td>
                        <td>{formatDate(process.firstEventAt)}</td>
                        <td>{formatDate(process.lastEventAt)}</td>
                        <td>{process.slaThresholdMs ? formatDuration(process.slaThresholdMs) : "default"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </QueryView>
        </Panel>
      ) : (
        <KnownProcesses />
      )}
    </div>
  );
}

function KnownProcesses() {
  const { processKeys, rememberProcessKey, forgetProcessKey } = usePreferences();
  const [newKey, setNewKey] = useState("");
  const valid = PROCESS_KEY_PATTERN.test(newKey.trim());

  const add = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid) return;
    rememberProcessKey(newKey.trim());
    setNewKey("");
  };

  return (
    <>
      <Panel>
        <CapabilityUnavailable
          title="Process registry"
          probe={CAPABILITIES.processRegistry.probe}
          description="Listing every process and configuring per-process SLAs needs the process registry endpoint. Until then, open processes by key; their analytics already work."
        />
      </Panel>
      <Panel
        eyebrow="THIS BROWSER"
        title="Known process keys"
        action={
          <form className="inline-form" onSubmit={add}>
            <input
              className="control-input w-48"
              value={newKey}
              onChange={(event) => setNewKey(event.target.value)}
              placeholder="process key, e.g. order-to-cash"
              aria-label="Process key"
              aria-invalid={newKey !== "" && !valid}
            />
            <Button type="submit" size="sm" disabled={!valid}>
              Add
            </Button>
          </form>
        }
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th />
                <th>Process key</th>
                <th className="numeric">Cases</th>
                <th className="numeric">Events</th>
                <th className="numeric">Variants</th>
                <th className="numeric">SLA breaches</th>
                <th>Data window</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {processKeys.map((key) => (
                <ProcessRow key={key} processKey={key} removable={key !== config.defaultProcessKey} onRemove={() => forgetProcessKey(key)} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted px-5 pb-4 text-[10px]">Summaries load when a row is expanded: each one is computed on demand by the backend from all of the process's events.</p>
      </Panel>
    </>
  );
}

function ProcessRow({ processKey, removable, onRemove }: { processKey: string; removable: boolean; onRemove: () => void }) {
  const { sla } = usePreferences();
  const [expanded, setExpanded] = useState(false);
  const summary = useQuery({
    queryKey: ["process", processKey, "summary", sla ?? null],
    queryFn: () => api.getSummary(processKey, { sla }),
    enabled: expanded,
    staleTime: 60_000,
  });

  const cell = (render: (data: NonNullable<typeof summary.data>) => string) => (summary.data ? render(summary.data) : expanded && summary.isPending ? "…" : "—");

  return (
    <>
      <tr>
        <td>
          <Button variant="ghost" size="icon" onClick={() => setExpanded((open) => !open)} aria-label={expanded ? "Collapse" : "Load summary"}>
            {expanded ? <ChevronDown /> : <ChevronRight />}
          </Button>
        </td>
        <td>
          <Link to="/p/$processKey/overview" params={{ processKey }} className="link mono-value">
            {processKey}
          </Link>
        </td>
        <td className="numeric mono-value">{cell((data) => formatCount(data.caseCount))}</td>
        <td className="numeric mono-value">{cell((data) => formatCount(data.eventCount))}</td>
        <td className="numeric mono-value">{cell((data) => formatCount(data.variantCount))}</td>
        <td className="numeric mono-value">{cell((data) => formatPercent(data.sla.violationRatePercent))}</td>
        <td>{cell((data) => `${formatDate(data.firstEventAt)} → ${formatDate(data.lastEventAt)}`)}</td>
        <td>
          {removable ? (
            <Button variant="ghost" size="icon" onClick={onRemove} aria-label={`Forget ${processKey}`} title="Forget this key in this browser">
              <Trash2 />
            </Button>
          ) : null}
        </td>
      </tr>
      {expanded && summary.isError ? (
        <tr>
          <td colSpan={8}>
            <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
          </td>
        </tr>
      ) : null}
    </>
  );
}
