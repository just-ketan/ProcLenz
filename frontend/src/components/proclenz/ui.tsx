import { useState, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, Copy, Info, type LucideIcon } from "lucide-react";
import type { Severity } from "@/api/types";
import type { CaseSlaStatus } from "@/domain/derived";
import { formatCount, formatPercent } from "@/domain/format";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode | undefined;
  actions?: ReactNode | undefined;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow eyebrow-accent">
          <span className="live-pulse" />
          {eyebrow}
        </div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="heading-actions">{actions}</div> : null}
    </div>
  );
}

export function Panel({
  eyebrow,
  title,
  action,
  children,
  className,
}: {
  eyebrow?: string | undefined;
  title?: ReactNode | undefined;
  action?: ReactNode | undefined;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <section className={cn("panel", className)}>
      {title ? (
        <div className="section-heading">
          <div>
            {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
            <h2>{title}</h2>
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function KpiCard({
  label,
  value,
  subline,
  footer,
  icon: Icon,
  tone = "neutral",
  info,
}: {
  label: string;
  value: ReactNode;
  subline: ReactNode;
  footer?: ReactNode | undefined;
  icon: LucideIcon;
  tone?: "neutral" | "blue" | "warning" | "critical" | "violet" | undefined;
  info?: string | undefined;
}) {
  return (
    <div className={`kpi-card kpi-${tone}`}>
      <div className="kpi-top">
        <span className="kpi-label">
          {label}
          {info ? <InfoTip text={info} /> : null}
        </span>
        <span className="kpi-icon">
          <Icon />
        </span>
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-subline">{subline}</div>
      {footer ? <div className="kpi-footer">{footer}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  info,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode | undefined;
  info?: string | undefined;
  tone?: "good" | "warning" | "danger" | undefined;
}) {
  return (
    <div className={cn("stat", tone && `stat-${tone}`)}>
      <div className="stat-label">
        {label}
        {info ? <InfoTip text={info} /> : null}
      </div>
      <div className="stat-value">{value}</div>
      {hint ? <div className="stat-hint">{hint}</div> : null}
    </div>
  );
}

export function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="info-tip" aria-label={text}>
          <Info />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-relaxed">{text}</TooltipContent>
    </Tooltip>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`severity severity-${severity.toLowerCase()}`}>
      <span className="severity-dot" />
      {severity}
    </span>
  );
}

const SLA_STATUS: Record<CaseSlaStatus, { label: string; className: string }> = {
  BREACHED: { label: "BREACHED", className: "sla-breach" },
  AT_RISK: { label: "AT RISK", className: "sla-risk" },
  ON_TRACK: { label: "ON TRACK", className: "sla-good" },
};

export function SlaStatusBadge({ status }: { status: CaseSlaStatus }) {
  const presentation = SLA_STATUS[status];
  return <span className={`sla-pill ${presentation.className}`}>{presentation.label}</span>;
}

export function Chip({ children, tone, title }: { children: ReactNode; tone?: "blue" | "rework" | "warning" | "danger" | "good" | undefined; title?: string | undefined }) {
  return (
    <span className={cn("chip", tone && `chip-${tone}`)} title={title}>
      {children}
    </span>
  );
}

export function SequenceChips({ activities, max = 8, highlight }: { activities: readonly string[]; max?: number | undefined; highlight?: ReadonlySet<string> | undefined }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? activities : activities.slice(0, max);
  const hidden = activities.length - visible.length;
  return (
    <div className="sequence sequence-wrap">
      {visible.map((activity, index) => (
        <span key={`${activity}-${index}`}>
          <b className={cn(highlight?.has(activity) && "sequence-highlight")}>{activity}</b>
          {index < visible.length - 1 || hidden > 0 ? <ChevronRight /> : null}
        </span>
      ))}
      {hidden > 0 ? (
        <button type="button" className="link-button" onClick={() => setExpanded(true)}>
          +{hidden} more
        </button>
      ) : null}
    </div>
  );
}

export function ShareBar({ percent, tone }: { percent: number; tone?: "danger" | "warning" | undefined }) {
  return (
    <div className="share-cell">
      <strong>{formatPercent(percent)}</strong>
      <div className="share-track">
        <span className={cn(tone && `share-${tone}`)} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>
    </div>
  );
}

export function Pager({
  page,
  totalPages,
  totalElements,
  itemLabel,
  onPage,
}: {
  page: number;
  totalPages: number;
  totalElements: number;
  itemLabel: string;
  onPage: (page: number) => void;
}) {
  return (
    <div className="pager">
      <span>
        {formatCount(totalElements)} {itemLabel} · page {totalPages === 0 ? 0 : page + 1} of {formatCount(totalPages)}
      </span>
      <div className="pager-actions">
        <Button variant="outline" size="sm" disabled={page <= 0} onClick={() => onPage(page - 1)}>
          <ChevronLeft />
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => onPage(page + 1)}>
          Next
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

export function DefinitionList({ items }: { items: { label: string; value: ReactNode; info?: string | undefined }[] }) {
  return (
    <dl className="definition-list">
      {items.map((item) => (
        <div key={item.label} className="definition-row">
          <dt>
            {item.label}
            {item.info ? <InfoTip text={item.info} /> : null}
          </dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      title={label}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1_500);
        });
      }}
    >
      {copied ? <Check /> : <Copy />}
    </button>
  );
}

export function Bar({ value, max, tone }: { value: number; max: number; tone?: "danger" | "warning" | "good" | undefined }) {
  const width = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <span className="bar-track">
      <span className={cn("bar-fill", tone && `bar-${tone}`)} style={{ width: `${width}%` }} />
    </span>
  );
}
