import { AppShell, type NavItem } from "@/components/app-shell";

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: "LayoutDashboard" },
  { href: "/dashboard/championships", label: "Championships", icon: "Trophy" },
  { href: "/dashboard/messages", label: "Messages", icon: "Inbox" },
  { href: "/dashboard/billing", label: "Billing", icon: "CreditCard" },
  { href: "/dashboard/account", label: "Account", icon: "UserCog" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell navItems={NAV_ITEMS} title="Zaroda Dashboard">
      {children}
    </AppShell>
  );
}
