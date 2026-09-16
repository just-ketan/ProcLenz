import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronRight, GitBranch, RefreshCw, ShieldAlert, SkipForward } from "lucide-react";
import type { InsightType, ProcessInsight } from "@/api/types";
import { formatCount, formatDuration, formatPercent } from "@/domain/format";
import { SeverityBadge } from "./ui";

function asNumber(value: string | number | null | undefined): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function asString(value: string | number | null | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

const ICONS: Record<InsightType, ReactNode> = {
  BOTTLENECK: <AlertTriangle />,
  SLA_RISK: <ShieldAlert />,
  REWORK_HOTSPOT: <RefreshCw />,
  SKIPPED_ACTIVITY: <SkipForward />,
  VARIANT_FRAGMENTATION: <GitBranch />,
};

export function evidenceChips(insight: ProcessInsight): string[] {
  const evidence = insight.evidence;
  switch (insight.type) {
    case "BOTTLENECK":
      return [
        `${formatPercent(asNumber(evidence["waitSharePercent"]))} of waiting time`,
        `p95 ${formatDuration(asNumber(evidence["p95WaitMs"]))}`,
        `${formatPercent(asNumber(evidence["caseCoveragePercent"]))} of cases`,
      ];
    case "SLA_RISK":
      return [
        `${formatCount(asNumber(evidence["violatingCases"]))} breaches`,
        `p95 ${formatDuration(asNumber(evidence["p95DurationMs"]))}`,
        `SLA ${formatDuration(asNumber(evidence["thresholdMs"]))}`,
      ];
    case "REWORK_HOTSPOT":
      return [
        `${formatCount(asNumber(evidence["affectedCases"]))} cases`,
        `${formatCount(asNumber(evidence["repeatOccurrences"]))} repeats`,
        `+${formatDuration(asNumber(evidence["avgReworkTimePerAffectedCaseMs"]))} per case`,
      ];
    case "SKIPPED_ACTIVITY":
      return [`${formatCount(asNumber(evidence["casesWithoutActivity"]))} cases without it`, `${formatPercent(asNumber(evidence["skippedPercent"]))} skipped`];
    case "VARIANT_FRAGMENTATION":
      return [`${formatCount(asNumber(evidence["variantCount"]))} variants`, `top covers ${formatPercent(asNumber(evidence["topVariantCasePercent"]))}`];
  }
}

function InsightLink({ insight, processKey, className, children }: { insight: ProcessInsight; processKey: string; className: string; children: ReactNode }) {
  const evidence = insight.evidence;
  switch (insight.type) {
    case "BOTTLENECK": {
      const from = asString(evidence["fromActivity"]);
      const to = asString(evidence["toActivity"]);
      return (
        <Link to="/p/$processKey/bottlenecks" params={{ processKey }} search={{ selected: from && to ? `${from}->${to}` : undefined }} className={className}>
          {children}
        </Link>
      );
    }
    case "SLA_RISK":
      return (
        <Link to="/p/$processKey/sla" params={{ processKey }} className={className}>
          {children}
        </Link>
      );
    case "REWORK_HOTSPOT":
      return (
        <Link to="/p/$processKey/rework" params={{ processKey }} search={{ activity: asString(evidence["activity"]) }} className={className}>
          {children}
        </Link>
      );
    case "SKIPPED_ACTIVITY":
      return (
        <Link to="/p/$processKey/explorer" params={{ processKey }} search={{ node: asString(evidence["activity"]), overlay: "deviations" }} className={className}>
          {children}
        </Link>
      );
    case "VARIANT_FRAGMENTATION":
      return (
        <Link to="/p/$processKey/variants" params={{ processKey }} className={className}>
          {children}
        </Link>
      );
  }
}

export function InsightItem({ insight, processKey }: { insight: ProcessInsight; processKey: string }) {
  return (
    <InsightLink insight={insight} processKey={processKey} className="issue-item">
      <div className={`issue-icon tone-${insight.severity.toLowerCase()}`}>{ICONS[insight.type]}</div>
      <div className="issue-body">
        <div className="issue-title-row">
          <SeverityBadge severity={insight.severity} />
          <strong>{insight.title}</strong>
        </div>
        <p>{insight.detail}</p>
        <div className="evidence-row">
          {evidenceChips(insight).map((chip) => (
            <span key={chip}>{chip}</span>
          ))}
        </div>
      </div>
      <ChevronRight className="issue-chevron" />
    </InsightLink>
  );
}
