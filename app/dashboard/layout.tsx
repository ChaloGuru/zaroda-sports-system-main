import { AppShell, type NavItem } from "@/components/app-shell";
import { getAuthContext } from "@/lib/authorize";

const OVERVIEW_ITEM: NavItem = { href: "/dashboard", label: "Overview", icon: "LayoutDashboard" };

const TENANT_ONLY_ITEMS: NavItem[] = [
  { href: "/dashboard/championships", label: "Championships", icon: "Trophy" },
  { href: "/dashboard/roles", label: "Roles", icon: "ShieldCheck" },
  { href: "/dashboard/billing", label: "Billing", icon: "CreditCard" },
  { href: "/dashboard/payout-account", label: "Payout Account", icon: "Landmark" },
];

const REST_OF_COMMON_ITEMS: NavItem[] = [
  { href: "/dashboard/messages", label: "Messages", icon: "Inbox" },
  { href: "/dashboard/account", label: "Account", icon: "UserCog" },
  { href: "/guide", label: "User Guide", icon: "BookOpen", external: true },
  { href: "/rankings", label: "Public Rankings", icon: "ListOrdered", external: true },
  { href: "https://zarodasolutions.app/", label: "Zaroda School", icon: "ExternalLink", external: true, accent: true },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  // Championship-scoped officials (Scorekeeper, Coordinator, etc.) have no
  // Tenant of their own - the tenant-management pages (Championships, Roles,
  // Billing, Payout Account) don't apply to them and would only show either
  // an empty/misleading list or every published championship platform-wide.
  const isTenantAccount = !!ctx?.tenantId;
  const navItems = isTenantAccount
    ? [OVERVIEW_ITEM, ...TENANT_ONLY_ITEMS, ...REST_OF_COMMON_ITEMS]
    : [OVERVIEW_ITEM, ...REST_OF_COMMON_ITEMS];

  return (
    <AppShell navItems={navItems} title="Zaroda Dashboard">
      {children}
    </AppShell>
  );
}
