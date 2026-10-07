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
const ZARODABOOKS_URL = "https://zarodabooks.com/";
const ZARODA_KSEF_URL = "https://ksef.zarodasports.live/";

const NAV_LINKS = [
  { href: "/category/athletics", label: "Athletics" },
  { href: "/category/ball_games", label: "Ball Games" },
  { href: "/rankings", label: "Rankings" },
  { href: "/medal-table", label: "Medal Table" },
  { href: "/scoring-rules", label: "Scoring Rules" },
  { href: "/circulars", label: "Circulars" },
  { href: "/pricing", label: "Pricing" },
  { href: "/guide", label: "User Guide" },
  { href: ZARODA_KSEF_URL, label: "Zaroda KSEF", external: true },
  { href: ZARODA_SCHOOL_URL, label: "Zaroda School", external: true },
  { href: ZARODABOOKS_URL, label: "ZARODABOOKS", external: true },
];

export function SiteHeader() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  const isSuperAdmin = session?.user?.roles?.some((r) => r.role === "SUPER_ADMIN");

  return (
    // A navy ribbon with a gold edge, matching the footer - the same in light and dark mode.
    <header className="no-print sticky top-0 z-40 border-b-[3px] border-gold bg-navy text-white shadow-[0_2px_12px_rgba(5,12,35,0.35)]">
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
                className="flex items-center gap-1 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-sm font-semibold text-white transition-colors hover:border-gold hover:text-gold"
              >
                {link.label}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "text-sm font-semibold text-white/85 transition-colors hover:text-gold",
                  pathname === link.href && "text-gold underline decoration-2 underline-offset-8",
                )}
              >
                {link.label}
              </Link>
            ),
          )}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <ThemeToggle className="text-white hover:bg-white/10 hover:text-white" />
          {status === "authenticated" ? (
            <>
              <Button size="sm" className="bg-gold text-navy hover:bg-gold/90" asChild>
                <Link href={isSuperAdmin ? "/admin" : "/dashboard"}>{isSuperAdmin ? "Admin" : "Dashboard"}</Link>
              </Button>
              <Button variant="outline" size="sm" className="border-white/40 text-white hover:bg-white/10 hover:text-white" onClick={() => signOut({ callbackUrl: "/" })}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" className="text-white hover:bg-white/10 hover:text-white" asChild>
                <Link href="/login">Log in</Link>
              </Button>
              <Button size="sm" className="bg-gold text-navy hover:bg-gold/90" asChild>
                <Link href="/signup">Sign up free</Link>
              </Button>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 lg:hidden">
          <ThemeToggle className="text-white hover:bg-white/10 hover:text-white" />
          <button className="rounded-md p-1.5 text-white hover:bg-white/10" onClick={() => setOpen((v) => !v)} aria-label="Toggle menu">
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-white/10 bg-navy-dark lg:hidden">
          <div className="container flex flex-col gap-1 py-3">
            {NAV_LINKS.map((link) =>
              link.external ? (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-1 rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:text-gold"
                >
                  {link.label}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm font-semibold text-white/85 hover:bg-white/10 hover:text-gold",
                    pathname === link.href && "text-gold",
                  )}
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
              ),
            )}
            <div className="mt-2 flex flex-col gap-2 border-t border-white/10 pt-3">
              {status === "authenticated" ? (
                <>
                  <Button size="sm" className="bg-gold text-navy hover:bg-gold/90" asChild onClick={() => setOpen(false)}>
                    <Link href={isSuperAdmin ? "/admin" : "/dashboard"}>{isSuperAdmin ? "Admin" : "Dashboard"}</Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-white/40 text-white hover:bg-white/10 hover:text-white"
                    onClick={() => {
                      setOpen(false);
                      signOut({ callbackUrl: "/" });
                    }}
                  >
                    Sign out
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" size="sm" className="text-white hover:bg-white/10 hover:text-white" asChild onClick={() => setOpen(false)}>
                    <Link href="/login">Log in</Link>
                  </Button>
                  <Button size="sm" className="bg-gold text-navy hover:bg-gold/90" asChild onClick={() => setOpen(false)}>
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
