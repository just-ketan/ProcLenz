import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Menu, PanelLeftClose, PanelLeftOpen, Search, Settings2 } from "lucide-react";
import { api } from "@/api";
import { config, describeBackend } from "@/api/config";
import { usePreferences } from "@/app/preferences";
import { Button } from "@/components/ui/button";
import { activeBottleneckCount } from "@/domain/derived";
import { BOTTLENECK_LIMIT, useHealth } from "@/hooks/queries";
import { ConnectionIndicator } from "./ConnectionIndicator";
import { DiagnosticsSheet } from "./DiagnosticsSheet";
import { NAVIGATION, PROCESS_VIEWS, breadcrumbFor, isNavItemActive, type NavItem } from "./navigation";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Matches the stylesheet breakpoint where the sidebar becomes an overlay drawer. */
const DRAWER_QUERY = "(max-width: 980px)";

export function AppShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const params = useParams({ strict: false });
  const { lastProcessKey, rememberProcessKey } = usePreferences();
  const processKey = params.processKey ?? lastProcessKey;

  useEffect(() => {
    if (params.processKey) rememberProcessKey(params.processKey);
  }, [params.processKey, rememberProcessKey]);

  // On small screens the sidebar overlays the page: start closed and close after every navigation.
  useEffect(() => {
    if (window.matchMedia(DRAWER_QUERY).matches) setSidebarOpen(false);
  }, [pathname]);

  const breadcrumb = breadcrumbFor(pathname);

  return (
    <div className="proclenz-app">
      <Sidebar open={sidebarOpen} pathname={pathname} processKey={processKey} onOpenDiagnostics={() => setDiagnosticsOpen(true)} />
      {sidebarOpen ? <button type="button" className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} /> : null}
      <main className="main-shell">
        <Topbar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          group={breadcrumb.group}
          label={breadcrumb.label}
          processKey={processKey}
        />
        <div className="page-content">{children}</div>
      </main>
      <DiagnosticsSheet open={diagnosticsOpen} onOpenChange={setDiagnosticsOpen} />
    </div>
  );
}

function Sidebar({ open, pathname, processKey, onOpenDiagnostics }: { open: boolean; pathname: string; processKey: string; onOpenDiagnostics: () => void }) {
  const health = useHealth();
  // Reads the bottleneck count only if a page already loaded it; the sidebar never triggers analytics itself.
  const cachedBottlenecks = useQuery({
    queryKey: ["process", processKey, "bottlenecks", BOTTLENECK_LIMIT],
    queryFn: () => api.getBottlenecks(processKey, { limit: BOTTLENECK_LIMIT }),
    enabled: false,
  });
  const bottleneckBadge = cachedBottlenecks.data ? activeBottleneckCount(cachedBottlenecks.data.bottlenecks) : 0;
  const backendLabel = config.useMockData ? "Mock data" : describeBackend().replace(/^https?:\/\//, "");

  const statusDotClass = config.useMockData
    ? "status-mock"
    : health.isError
      ? "status-down"
      : health.data && health.data.health.status !== "UP"
        ? "status-degraded"
        : health.isPending
          ? "status-unknown"
          : "";
  const footnote = config.useMockData
    ? "Showing bundled fixtures"
    : health.isError
      ? "Backend unreachable"
      : health.data
        ? `Backend ${health.data.health.status} · ${health.data.latencyMs}ms`
        : "Checking backend…";

  return (
    <aside className={`sidebar ${open ? "sidebar-open" : "sidebar-collapsed"}`}>
      <div className="brand-row">
        <div className="brand-mark">P</div>
        {open ? (
          <div className="brand-copy">
            <strong>proclenz</strong>
            <span>PROCESS INTELLIGENCE</span>
          </div>
        ) : null}
      </div>
      {open ? <div className="workspace-label">BACKEND</div> : <div className="workspace-label" />}
      <div className={`workspace-select ${!open ? "workspace-compact" : ""}`} title={describeBackend()}>
        <span className="workspace-avatar">{config.useMockData ? "MK" : "API"}</span>
        {open ? <span className="workspace-name">{backendLabel}</span> : null}
      </div>
      <nav className="side-nav" aria-label="Primary navigation">
        {NAVIGATION.map((section) => (
          <div className="nav-section" key={section.group}>
            {open ? <div className="nav-section-label">{section.group}</div> : null}
            {section.items.map((item) => (
              <NavLink
                key={item.label}
                item={item}
                processKey={processKey}
                active={isNavItemActive(item, pathname)}
                collapsed={!open}
                badge={"view" in item && item.view === "bottlenecks" && bottleneckBadge > 0 ? String(bottleneckBadge) : undefined}
              />
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <Link to="/settings" className={`nav-item ${pathname === "/settings" ? "nav-item-active" : ""} ${!open ? "nav-item-collapsed" : ""}`} title={!open ? "Settings" : undefined}>
          <Settings2 />
          <span>{open ? "Settings" : null}</span>
        </Link>
        <button type="button" className={`api-status api-status-button ${!open ? "api-status-collapsed" : ""}`} onClick={onOpenDiagnostics} aria-label="Open API diagnostics">
          <span className={`status-dot ${statusDotClass}`} />
          {open ? (
            <>
              <span>API status</span>
              <span className={`api-mode-badge ${config.useMockData ? "mock" : ""}`}>{config.useMockData ? "MOCK" : "LIVE"}</span>
            </>
          ) : null}
        </button>
        {open ? (
          <div className="sidebar-footnote">
            {config.useMockData ? "Mock mode" : "Live backend"}
            <br />
            <span>{footnote}</span>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function NavLink({ item, processKey, active, collapsed, badge }: { item: NavItem; processKey: string; active: boolean; collapsed: boolean; badge: string | undefined }) {
  const className = `nav-item ${active ? "nav-item-active" : ""} ${collapsed ? "nav-item-collapsed" : ""}`;
  const Icon = item.icon;
  const content = (
    <>
      <Icon />
      <span>{collapsed ? null : item.label}</span>
      {!collapsed && badge ? <span className="nav-badge">{badge}</span> : null}
    </>
  );
  if ("view" in item) {
    return (
      <Link to={PROCESS_VIEWS[item.view]} params={{ processKey }} className={className} title={collapsed ? item.label : undefined}>
        {content}
      </Link>
    );
  }
  return (
    <Link to={item.path} className={className} title={collapsed ? item.label : undefined}>
      {content}
    </Link>
  );
}

function Topbar({ sidebarOpen, onToggleSidebar, group, label, processKey }: { sidebarOpen: boolean; onToggleSidebar: () => void; group: string; label: string; processKey: string }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    if (UUID_PATTERN.test(value)) {
      void navigate({ to: "/events/$eventId", params: { eventId: value } });
    } else {
      void navigate({ to: "/p/$processKey/cases/$caseId", params: { processKey, caseId: value } });
    }
    setQuery("");
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <Button variant="ghost" size="icon" className="mobile-menu" onClick={onToggleSidebar} aria-label="Toggle navigation">
          <Menu />
        </Button>
        <Button variant="ghost" size="icon" className="desktop-menu" onClick={onToggleSidebar} aria-label="Collapse navigation">
          {sidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
        </Button>
        <div className="topbar-divider" />
        <div className="crumb">
          <span className="crumb-muted">{group}</span>
          <ChevronRight />
          <strong>{label}</strong>
        </div>
      </div>
      <div className="topbar-right">
        <form className="search-box" onSubmit={onSubmit} role="search">
          <Search />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Go to case ID or event ID" aria-label="Go to case ID or event ID" />
          <kbd>↵</kbd>
        </form>
        <ConnectionIndicator />
        <div className="user-avatar" title="Sign-in arrives with backend security (planned)">
          —
        </div>
      </div>
    </header>
  );
}
