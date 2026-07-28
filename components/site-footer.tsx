import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface-raised">
      <div className="container flex flex-col items-center justify-between gap-4 py-8 text-sm text-muted md:flex-row">
        <p>&copy; {new Date().getFullYear()} Zaroda Solutions. All rights reserved.</p>
        <div className="flex gap-6">
          <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
          <Link href="/circulars" className="hover:text-foreground">Circulars</Link>
          <Link href="/contacts" className="hover:text-foreground">Contact</Link>
        </div>
      </div>
      <div className="border-t border-border py-3 text-center text-xs text-muted">
        Powered by <span className="font-semibold text-foreground">ZARODA SOLUTIONS</span> - Innovative. Reliable. Forward.{" "}
        <a href="https://wa.me/254781230805" target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
          0781230805
        </a>
      </div>
    </footer>
  );
}
