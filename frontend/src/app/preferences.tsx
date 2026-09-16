import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { config } from "@/api/config";
import type { TimeDisplay } from "@/domain/format";

interface Preferences {
  /** ISO-8601 SLA threshold sent with analytics requests; undefined lets the backend decide. */
  sla: string | undefined;
  timeDisplay: TimeDisplay;
  /** Process keys the user works with. The registry endpoint is not available yet, so they are remembered here. */
  processKeys: string[];
  lastProcessKey: string;
}

interface PreferencesContextValue extends Preferences {
  setSla: (sla: string | undefined) => void;
  setTimeDisplay: (display: TimeDisplay) => void;
  rememberProcessKey: (processKey: string) => void;
  forgetProcessKey: (processKey: string) => void;
}

const STORAGE_KEY = "proclenz.preferences.v1";

const DEFAULTS: Preferences = {
  sla: undefined,
  timeDisplay: "local",
  processKeys: [config.defaultProcessKey],
  lastProcessKey: config.defaultProcessKey,
};

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined);

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim() !== ""))];
}

function readStoredPreferences(): Preferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const stored = raw ? (JSON.parse(raw) as Partial<Record<keyof Preferences, unknown>>) : {};
    const processKeys = Array.isArray(stored.processKeys)
      ? stored.processKeys.filter((key): key is string => typeof key === "string")
      : [];
    return {
      sla: typeof stored.sla === "string" ? stored.sla : undefined,
      timeDisplay: stored.timeDisplay === "utc" ? "utc" : "local",
      processKeys: unique([config.defaultProcessKey, ...processKeys]),
      lastProcessKey: typeof stored.lastProcessKey === "string" ? stored.lastProcessKey : config.defaultProcessKey,
    };
  } catch {
    return DEFAULTS;
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setPreferences(readStoredPreferences());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Storage can be unavailable (private mode); preferences then last for this tab only.
    }
  }, [preferences, loaded]);

  const setSla = useCallback((sla: string | undefined) => setPreferences((current) => ({ ...current, sla })), []);
  const setTimeDisplay = useCallback(
    (timeDisplay: TimeDisplay) => setPreferences((current) => ({ ...current, timeDisplay })),
    [],
  );
  const rememberProcessKey = useCallback(
    (processKey: string) =>
      setPreferences((current) =>
        current.lastProcessKey === processKey && current.processKeys.includes(processKey)
          ? current
          : { ...current, lastProcessKey: processKey, processKeys: unique([...current.processKeys, processKey]) },
      ),
    [],
  );
  const forgetProcessKey = useCallback(
    (processKey: string) =>
      setPreferences((current) => ({
        ...current,
        processKeys: unique(current.processKeys.filter((key) => key !== processKey || key === config.defaultProcessKey)),
      })),
    [],
  );

  const value = useMemo(
    () => ({ ...preferences, setSla, setTimeDisplay, rememberProcessKey, forgetProcessKey }),
    [preferences, setSla, setTimeDisplay, rememberProcessKey, forgetProcessKey],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("usePreferences must be used inside PreferencesProvider");
  return value;
}
