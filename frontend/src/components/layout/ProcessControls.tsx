import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Check, ChevronDown, Plus } from "lucide-react";
import type { ProcessSummary } from "@/api/types";
import { usePreferences } from "@/app/preferences";
import { Button } from "@/components/ui/button";
import { formatDate, formatDuration, isPositiveIsoDuration } from "@/domain/format";
import { ConnectionIndicator } from "./ConnectionIndicator";
import { PROCESS_VIEWS, processViewFromPath } from "./navigation";

const SLA_PRESETS: readonly (readonly [string, string])[] = [
  ["PT4H", "4 hours"],
  ["PT8H", "8 hours"],
  ["P1D", "1 day"],
  ["P2D", "2 days"],
  ["P7D", "7 days"],
  ["P14D", "14 days"],
];

const PROCESS_KEY_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

/** Process, SLA and data-window controls shared by every process-scoped page. */
export function ProcessControls({ processKey, summary }: { processKey: string; summary: ProcessSummary | undefined }) {
  const { sla, setSla, processKeys, rememberProcessKey, timeDisplay } = usePreferences();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [customSla, setCustomSla] = useState<string | undefined>(undefined);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const switchProcess = (key: string) => {
    rememberProcessKey(key);
    setMenuOpen(false);
    setNewKey("");
    void navigate({ to: PROCESS_VIEWS[processViewFromPath(pathname) ?? "overview"], params: { processKey: key } });
  };

  const addProcess = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const key = newKey.trim();
    if (PROCESS_KEY_PATTERN.test(key)) switchProcess(key);
  };

  const isPreset = sla === undefined || SLA_PRESETS.some(([value]) => value === sla);
  const customValid = customSla !== undefined && isPositiveIsoDuration(customSla);

  return (
    <section className="control-strip" aria-label="Process controls">
      <div className="control-group">
        <span className="control-label">PROCESS</span>
        <div className="process-control" ref={menuRef}>
          <span className="process-dot" />
          <strong>{processKey}</strong>
          <Button variant="ghost" size="icon" onClick={() => setMenuOpen((open) => !open)} aria-label="Select process" aria-expanded={menuOpen}>
            <ChevronDown />
          </Button>
          {menuOpen ? (
            <div className="process-menu" role="menu">
              {processKeys.map((key) => (
                <button key={key} type="button" role="menuitem" onClick={() => switchProcess(key)}>
                  {key === processKey ? <Check /> : <i className="menu-spacer" />}
                  {key}
                </button>
              ))}
              <form className="process-menu-add" onSubmit={addProcess}>
                <input
                  value={newKey}
                  onChange={(event) => setNewKey(event.target.value)}
                  placeholder="Open process key…"
                  aria-label="Process key"
                  aria-invalid={newKey !== "" && !PROCESS_KEY_PATTERN.test(newKey.trim())}
                />
                <button type="submit" aria-label="Open process" disabled={!PROCESS_KEY_PATTERN.test(newKey.trim())}>
                  <Plus />
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </div>
      <div className="control-separator" />
      <div className="control-group">
        <span className="control-label">SLA THRESHOLD</span>
        <div className="inline-form">
          <select
            value={customSla !== undefined ? "CUSTOM" : (sla ?? "DEFAULT")}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "CUSTOM") {
                setCustomSla(sla ?? "");
              } else {
                setCustomSla(undefined);
                setSla(value === "DEFAULT" ? undefined : value);
              }
            }}
            aria-label="SLA threshold"
          >
            <option value="DEFAULT">Backend default</option>
            {SLA_PRESETS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
            {!isPreset && sla ? <option value={sla}>{sla}</option> : null}
            <option value="CUSTOM">Custom (ISO-8601)…</option>
          </select>
          {customSla !== undefined ? (
            <form
              className="inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!customValid) return;
                setSla(customSla.trim().toUpperCase());
                setCustomSla(undefined);
              }}
            >
              <input
                className="control-input"
                value={customSla}
                onChange={(event) => setCustomSla(event.target.value)}
                placeholder="e.g. PT36H"
                aria-label="Custom SLA threshold"
                aria-invalid={customSla !== "" && !customValid}
                autoFocus
              />
              <Button type="submit" size="sm" variant="outline" disabled={!customValid}>
                Apply
              </Button>
            </form>
          ) : null}
        </div>
        <span className="source-chip" title="Where the threshold in effect comes from">
          {summary ? `${summary.sla.source} · ${formatDuration(summary.sla.thresholdMs)}` : "RESOLVING"}
        </span>
      </div>
      <div className="control-separator" />
      <div className="control-group data-window">
        <span className="control-label">DATA WINDOW</span>
        <strong>
          {summary ? (
            <>
              {formatDate(summary.firstEventAt, timeDisplay)} <span>→</span> {formatDate(summary.lastEventAt, timeDisplay)}
            </>
          ) : (
            "—"
          )}
        </strong>
        <span className="readonly-chip" title="The backend analyses every event of the process; there is no date filter">
          All events of this process
        </span>
      </div>
      <div className="control-spacer" />
      <ConnectionIndicator />
    </section>
  );
}
