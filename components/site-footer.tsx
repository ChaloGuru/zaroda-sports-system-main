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
    </footer>
  );
}
