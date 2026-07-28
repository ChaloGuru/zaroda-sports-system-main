import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface-raised">
      <div className="container flex flex-wrap items-center justify-center gap-x-3 gap-y-2 py-4 text-center text-xs font-semibold text-muted md:justify-between">
        <p>&copy; {new Date().getFullYear()} Zaroda Solutions. All rights reserved.</p>
        <p className="text-muted">Innovative. Reliable. Forward.</p>
        <a
          href="https://wa.me/254781230805"
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground hover:underline"
        >
          0781230805
        </a>
        <div className="flex gap-4">
          <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
          <Link href="/circulars" className="hover:text-foreground">Circulars</Link>
          <Link href="/contacts" className="hover:text-foreground">Contact</Link>
        </div>
      </div>
    </footer>
  );
}
