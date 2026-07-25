"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Banknote, Eye, EyeOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const STORAGE_KEY = "zaroda-admin-revenue-visible";

const RevenueVisibilityContext = createContext<{ visible: boolean }>({ visible: true });

export function useRevenueVisible() {
  return useContext(RevenueVisibilityContext).visible;
}

export function RevenueVisibilityProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) setVisible(stored === "true");
  }, []);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setVisible(e.newValue === "true");
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <RevenueVisibilityContext.Provider value={{ visible }}>{children}</RevenueVisibilityContext.Provider>
  );
}

export function RevenueVisibilityToggle() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) setVisible(stored === "true");
  }, []);

  function toggle() {
    const next = !visible;
    setVisible(next);
    localStorage.setItem(STORAGE_KEY, String(next));
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: String(next) }));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted hover:text-foreground hover:border-primary transition-colors"
    >
      {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      {visible ? "Hide revenue" : "Show revenue"}
    </button>
  );
}

export function RevenueStatCard({ value }: { value: number }) {
  const visible = useRevenueVisible();

  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-navy-light/40">
          <Banknote className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="font-mono text-2xl font-bold tabular-nums text-foreground">
            {visible ? value.toLocaleString() : "••••••"}
          </p>
          <p className="text-sm text-muted">Revenue (6mo, KES)</p>
        </div>
      </CardContent>
    </Card>
  );
}
