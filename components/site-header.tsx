"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Menu, X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const ZARODA_SCHOOL_URL = "https://zarodasolutions.app/";

const NAV_LINKS = [
  { href: "/category/athletics", label: "Athletics" },
  { href: "/category/ball_games", label: "Ball Games" },
  { href: "/rankings", label: "Rankings" },
  { href: "/medal-table", label: "Medal Table" },
  { href: "/circulars", label: "Circulars" },
  { href: "/pricing", label: "Pricing" },
  { href: ZARODA_SCHOOL_URL, label: "Zaroda School", external: true },
];

export function SiteHeader() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  const isSuperAdmin = session?.user?.roles?.some((r) => r.role === "SUPER_ADMIN");

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center">
          <Image src="/images/logo.png" alt="Zaroda Sports Management System" width={144} height={96} className="h-12 w-auto" priority />
        </Link>

        <nav className="hidden items-center gap-6 lg:flex">
          {NAV_LINKS.map((link) =>
            link.external ? (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-foreground"
              >
                {link.label}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "text-sm font-medium text-muted transition-colors hover:text-foreground",
                  pathname === link.href && "text-primary",
                )}
              >
                {link.label}
              </Link>
            ),
          )}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <ThemeToggle />
          {status === "authenticated" ? (
            <>
              <Button variant="secondary" size="sm" asChild>
                <Link href={isSuperAdmin ? "/admin" : "/dashboard"}>{isSuperAdmin ? "Admin" : "Dashboard"}</Link>
              </Button>
              <Button variant="outline" size="sm" onClick={() => signOut({ callbackUrl: "/" })}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login">Log in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/signup">Sign up free</Link>
              </Button>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 lg:hidden">
          <ThemeToggle />
          <button className="p-1.5" onClick={() => setOpen((v) => !v)} aria-label="Toggle menu">
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border bg-surface-raised lg:hidden">
          <div className="container flex flex-col gap-1 py-3">
            {NAV_LINKS.map((link) =>
              link.external ? (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-muted hover:bg-surface-overlay hover:text-foreground"
                >
                  {link.label}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-md px-3 py-2 text-sm font-medium text-muted hover:bg-surface-overlay hover:text-foreground"
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
              ),
            )}
            <div className="mt-2 flex flex-col gap-2 border-t border-border pt-3">
              {status === "authenticated" ? (
                <>
                  <Button variant="secondary" size="sm" asChild>
                    <Link href={isSuperAdmin ? "/admin" : "/dashboard"}>{isSuperAdmin ? "Admin" : "Dashboard"}</Link>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => signOut({ callbackUrl: "/" })}>
                    Sign out
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/login">Log in</Link>
                  </Button>
                  <Button size="sm" asChild>
                    <Link href="/signup">Sign up free</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
