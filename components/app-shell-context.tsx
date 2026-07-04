"use client";

import * as React from "react";

interface AppShellContextValue {
  label: string | null;
  setLabel: (label: string | null) => void;
}

const AppShellContext = React.createContext<AppShellContextValue | null>(null);

export function AppShellContextProvider({ children }: { children: React.ReactNode }) {
  const [label, setLabel] = React.useState<string | null>(null);
  const value = React.useMemo(() => ({ label, setLabel }), [label]);
  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

function useAppShellContext(): AppShellContextValue {
  const ctx = React.useContext(AppShellContext);
  if (!ctx) throw new Error("useAppShellContext must be used within AppShellContextProvider");
  return ctx;
}

export function useAppShellLabel(): string | null {
  return useAppShellContext().label;
}

/** Lets a deeply-nested page (e.g. a specific championship's manager) show its name in the persistent top bar. */
export function useSetAppShellLabel(label: string | null): void {
  const { setLabel } = useAppShellContext();
  React.useEffect(() => {
    setLabel(label);
    return () => setLabel(null);
  }, [label, setLabel]);
}
