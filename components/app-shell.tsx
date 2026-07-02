"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
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
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type IconName =
  | "LayoutDashboard"
  | "Building2"
  | "Trophy"
  | "ShieldCheck"
  | "Megaphone"
  | "ScrollText"
  | "Inbox"
  | "CreditCard";

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
};

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
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
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface-raised lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-border px-6 font-heading font-extrabold text-foreground">
          <Image src="/images/logo.png" alt="Zaroda Sports" width={144} height={96} className="h-9 w-auto" priority />
          {title}
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = ICONS[item.icon];
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md border-l-[3px] border-transparent pl-[9px] pr-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-overlay hover:text-foreground",
                  active && "border-primary bg-surface-overlay text-primary",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="flex items-center gap-3 border-t border-border px-6 py-4 text-sm font-medium text-muted hover:text-foreground"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex flex-col border-b border-border lg:hidden">
          <div className="flex h-16 items-center justify-between px-6">
            <span className="flex items-center gap-2 font-heading font-extrabold text-foreground">
              <Image src="/images/logo.png" alt="Zaroda Sports" width={144} height={96} className="h-9 w-auto" /> {title}
            </span>
            <button type="button" onClick={() => signOut({ callbackUrl: "/" })} className="text-sm text-muted">
              Sign out
            </button>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-3">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
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
        </header>
        <main className="flex-1 bg-background p-6">{children}</main>
      </div>
    </div>
  );
}
