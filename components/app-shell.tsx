"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  Trophy,
  LogOut,
  LayoutDashboard,
  Building2,
  ShieldCheck,
  Megaphone,
  ScrollText,
  Inbox,
  CreditCard,
  UserCog,
  ExternalLink,
  ListOrdered,
  BookOpen,
  Landmark,
  Quote,
  FlaskConical,
  CalendarRange,
  School,
  FolderKanban,
  Gavel,
  ClipboardCheck,
  Award,
  FileBarChart,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { AppShellContextProvider, useAppShellLabel } from "@/components/app-shell-context";

function roleLabel(roles: Array<{ role: string; championshipId: string | null }> | undefined): string | null {
  if (!roles || roles.length === 0) return null;
  if (roles.some((r) => r.role === "SUPER_ADMIN")) return "Super Admin";
  if (roles.some((r) => r.role === "TENANT_OWNER")) return "Tenant Owner";
  const scoped = roles.find((r) => r.championshipId !== null);
  if (scoped) {
    return scoped.role
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }
  return null;
}

/** Persistent identity + current-championship strip, shown above the page content on every admin/dashboard screen. */
function IdentityBar() {
  const { data: session } = useSession();
  const championshipLabel = useAppShellLabel();
  const role = roleLabel(session?.user?.roles);

  if (!session?.user && !championshipLabel) return null;

  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-raised px-6 py-2.5 text-sm">
      <div className="flex items-center gap-2 text-foreground">
        {session?.user && (
          <span className="font-medium">
            {session.user.name}
            {role && <span className="ml-1.5 font-normal text-muted">· {role}</span>}
          </span>
        )}
      </div>
      {championshipLabel && (
        <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <Trophy className="h-3.5 w-3.5" /> {championshipLabel}
        </span>
      )}
    </div>
  );
}

export type IconName =
  | "LayoutDashboard"
  | "Building2"
  | "Trophy"
  | "ShieldCheck"
  | "Megaphone"
  | "ScrollText"
  | "Inbox"
  | "CreditCard"
  | "UserCog"
  | "ExternalLink"
  | "ListOrdered"
  | "BookOpen"
  | "Landmark"
  | "Quote"
  | "FlaskConical"
  | "CalendarRange"
  | "School"
  | "FolderKanban"
  | "Gavel"
  | "ClipboardCheck"
  | "Award"
  | "FileBarChart"
  | "Settings2";

// Server Component layouts (admin/dashboard) can't pass icon component
// references as props into this Client Component - functions aren't
// serializable across that boundary. Nav items carry a name string instead,
// resolved against this map inside the client.
const ICONS: Record<IconName, LucideIcon> = {
  LayoutDashboard,
  Building2,
  Trophy,
  ShieldCheck,
  Megaphone,
  ScrollText,
  Inbox,
  CreditCard,
  UserCog,
  ExternalLink,
  ListOrdered,
  BookOpen,
  Landmark,
  Quote,
  FlaskConical,
  CalendarRange,
  School,
  FolderKanban,
  Gavel,
  ClipboardCheck,
  Award,
  FileBarChart,
  Settings2,
};

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Opens in a new tab instead of navigating the app - for links to sites outside Zaroda Sports. */
  external?: boolean;
  /** Extra blue emphasis for a specific standout link (e.g. the Zaroda School marketing link). */
  accent?: boolean;
  /** Only active on this exact path, not its sub-paths (e.g. a section's own Dashboard page). */
  exact?: boolean;
  /** A section's pages - listed under it in the sidebar while the section is open. */
  children?: NavItem[];
}

function isNavItemActive(item: NavItem, pathname: string): boolean {
  return pathname === item.href || (!item.exact && pathname.startsWith(`${item.href}/`));
}

export function AppShell({
  navItems,
  title,
  children,
}: {
  navItems: NavItem[];
  title: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <AppShellContextProvider>
      <div className="flex flex-1">
      <aside className="no-print hidden w-64 shrink-0 flex-col border-r border-border bg-surface-raised lg:flex">
        <div className="flex h-14 items-center border-b border-border px-6 font-heading font-extrabold text-foreground">{title}</div>
        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item) => {
            const active = isNavItemActive(item, pathname);
            const Icon = ICONS[item.icon];
            if (item.external) {
              return (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "flex items-center gap-3 rounded-md border-l-[3px] border-transparent pl-[9px] pr-3 py-2 text-sm font-medium transition-colors hover:bg-surface-overlay",
                    item.accent
                      ? "bg-primary/10 text-primary hover:text-primary"
                      : "text-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </a>
              );
            }
            const link = (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md border-l-[3px] border-transparent pl-[9px] pr-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-overlay hover:text-foreground",
                  // A section header only gets the active bar when there's no child page to carry it.
                  active && (item.children ? "text-primary" : "border-primary bg-surface-overlay text-primary"),
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
            if (!item.children || !active) return link;
            return (
              <div key={item.href} className="space-y-1">
                {link}
                <div className="ml-4 space-y-1 border-l border-border pl-2">
                  {item.children.map((child) => {
                    const ChildIcon = ICONS[child.icon];
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md border-l-[3px] border-transparent py-1.5 pl-[9px] pr-3 text-sm text-muted transition-colors hover:bg-surface-overlay hover:text-foreground",
                          isNavItemActive(child, pathname) && "border-primary bg-surface-overlay font-medium text-primary",
                        )}
                      >
                        <ChildIcon className="h-3.5 w-3.5" />
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="flex items-center gap-3 text-sm font-medium text-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
          <ThemeToggle />
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="no-print flex flex-col border-b border-border lg:hidden">
          <div className="flex h-12 items-center justify-between px-6">
            <span className="font-heading font-extrabold text-foreground">
              {title}
            </span>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <button type="button" onClick={() => signOut({ callbackUrl: "/" })} className="text-sm text-muted">
                Sign out
              </button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-3">
            {navItems.map((item) => {
              const active = isNavItemActive(item, pathname);
              if (item.external) {
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium",
                      item.accent ? "bg-primary/10 text-primary" : "text-muted",
                    )}
                  >
                    {item.label}
                  </a>
                );
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium text-muted",
                    active && "bg-surface-overlay text-primary",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          {(() => {
            const section = navItems.find((item) => item.children && isNavItemActive(item, pathname));
            if (!section?.children) return null;
            return (
              <nav className="flex gap-1 overflow-x-auto border-t border-border px-3 py-2">
                {section.children.map((child) => (
                  <Link
                    key={child.href}
                    href={child.href}
                    className={cn(
                      "shrink-0 rounded-md px-3 py-1 text-xs font-medium text-muted",
                      isNavItemActive(child, pathname) && "bg-surface-overlay text-primary",
                    )}
                  >
                    {child.label}
                  </Link>
                ))}
              </nav>
            );
          })()}
        </header>
        <IdentityBar />
        <main className="flex-1 bg-background p-6">{children}</main>
      </div>
    </div>
    </AppShellContextProvider>
  );
}
