"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Menu, X, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/category/athletics", label: "Athletics" },
  { href: "/category/ball_games", label: "Ball Games" },
  { href: "/rankings", label: "Rankings" },
  { href: "/medal-table", label: "Medal Table" },
  { href: "/circulars", label: "Circulars" },
  { href: "/pricing", label: "Pricing" },
];

export function SiteHeader() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  const isSuperAdmin = session?.user?.roles?.some((r) => r.role === "SUPER_ADMIN");

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-heading font-extrabold text-foreground">
          <Trophy className="h-6 w-6 text-primary" />
          <span>
            Zaroda <span className="text-primary">Sports</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-6 lg:flex">
          {NAV_LINKS.map((link) => (
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
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
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

        <button className="lg:hidden" onClick={() => setOpen((v) => !v)} aria-label="Toggle menu">
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border bg-surface-raised lg:hidden">
          <div className="container flex flex-col gap-1 py-3">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted hover:bg-surface-overlay hover:text-foreground"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
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
