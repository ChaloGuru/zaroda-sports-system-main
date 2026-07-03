import { AppShell, type NavItem } from "@/components/app-shell";

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: "LayoutDashboard" },
  { href: "/dashboard/championships", label: "Championships", icon: "Trophy" },
  { href: "/dashboard/messages", label: "Messages", icon: "Inbox" },
  { href: "/dashboard/billing", label: "Billing", icon: "CreditCard" },
  { href: "/dashboard/account", label: "Account", icon: "UserCog" },
  { href: "/rankings", label: "Public Rankings", icon: "ListOrdered", external: true },
  { href: "https://zarodasolutions.app/", label: "Zaroda School", icon: "ExternalLink", external: true, accent: true },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell navItems={NAV_ITEMS} title="Zaroda Dashboard">
      {children}
    </AppShell>
  );
}
