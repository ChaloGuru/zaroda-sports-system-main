"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: React.ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
}

/**
 * Wraps a single dashboard/admin panel so a crash in that panel doesn't take
 * down the rest of the page (§8). Use one per independent panel.
 */
export class PanelErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Panel error boundary caught:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card p-8 text-center">
          <AlertTriangle className="h-8 w-8 text-[#8A6412]" />
          <p className="font-medium text-foreground">{this.props.fallbackTitle ?? "This panel failed to load"}</p>
          <p className="text-sm text-muted">The rest of the dashboard is unaffected. Try reloading this panel.</p>
          <Button variant="secondary" size="sm" onClick={() => this.setState({ hasError: false })}>
            Retry
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
