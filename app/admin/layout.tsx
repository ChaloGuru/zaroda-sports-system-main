import { AppShell, type NavItem } from "@/components/app-shell";

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Overview", icon: "LayoutDashboard" },
  { href: "/admin/tenants", label: "Tenants", icon: "Building2" },
  { href: "/admin/championships", label: "Championships", icon: "Trophy" },
  { href: "/admin/roles", label: "Roles", icon: "ShieldCheck" },
  { href: "/admin/messaging", label: "Messaging", icon: "Megaphone" },
  { href: "/admin/audit-log", label: "Audit Log", icon: "ScrollText" },
  { href: "/admin/account", label: "Account", icon: "UserCog" },
  { href: "https://zarodasolutions.app/", label: "Zaroda School", icon: "ExternalLink", external: true },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell navItems={NAV_ITEMS} title="Zaroda Admin">
      {children}
    </AppShell>
  );
}
