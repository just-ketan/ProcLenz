import {
  Activity,
  AlertTriangle,
  Database,
  Gauge,
  GitBranch,
  LayoutDashboard,
  Network,
  RefreshCw,
  ShieldAlert,
  Table2,
  Upload,
  Zap,
  type LucideIcon,
} from "lucide-react";

export const PROCESS_VIEWS = {
  overview: "/p/$processKey/overview",
  explorer: "/p/$processKey/explorer",
  cases: "/p/$processKey/cases",
  bottlenecks: "/p/$processKey/bottlenecks",
  rework: "/p/$processKey/rework",
  variants: "/p/$processKey/variants",
  sla: "/p/$processKey/sla",
} as const;

export type ProcessView = keyof typeof PROCESS_VIEWS;

export type GlobalPath = "/processes" | "/datasets" | "/ingestion" | "/health" | "/migrations" | "/settings";

export type NavItem = { label: string; icon: LucideIcon } & ({ view: ProcessView } | { path: GlobalPath });

export const NAVIGATION: { group: string; items: NavItem[] }[] = [
  {
    group: "Analyze",
    items: [
      { label: "Overview", icon: LayoutDashboard, view: "overview" },
      { label: "Process Explorer", icon: Network, view: "explorer" },
      { label: "Cases", icon: Table2, view: "cases" },
      { label: "Bottlenecks", icon: AlertTriangle, view: "bottlenecks" },
      { label: "Rework", icon: RefreshCw, view: "rework" },
      { label: "Variants", icon: GitBranch, view: "variants" },
      { label: "SLA & Compliance", icon: ShieldAlert, view: "sla" },
    ],
  },
  {
    group: "Data",
    items: [
      { label: "Processes", icon: Activity, path: "/processes" },
      { label: "Datasets", icon: Database, path: "/datasets" },
      { label: "Ingestion", icon: Upload, path: "/ingestion" },
    ],
  },
  {
    group: "Operate",
    items: [
      { label: "System Health", icon: Gauge, path: "/health" },
      { label: "Migrations", icon: Zap, path: "/migrations" },
    ],
  },
];

export function processViewFromPath(pathname: string): ProcessView | undefined {
  const view = /^\/p\/[^/]+\/([^/]+)/.exec(pathname)?.[1];
  return view !== undefined && view in PROCESS_VIEWS ? (view as ProcessView) : undefined;
}

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if ("view" in item) return processViewFromPath(pathname) === item.view;
  return pathname === item.path || pathname.startsWith(`${item.path}/`);
}

export function breadcrumbFor(pathname: string): { group: string; label: string } {
  for (const section of NAVIGATION) {
    const item = section.items.find((candidate) => isNavItemActive(candidate, pathname));
    if (item) {
      const caseId = /^\/p\/[^/]+\/cases\/([^/]+)/.exec(pathname)?.[1];
      return { group: section.group, label: caseId ? `Case ${decodeURIComponent(caseId)}` : item.label };
    }
  }
  if (pathname.startsWith("/events/")) return { group: "Data", label: "Event" };
  if (pathname.startsWith("/settings")) return { group: "Workspace", label: "Settings" };
  return { group: "Proclenz", label: "Not found" };
}
