import { redirect } from "next/navigation";
import { AppShell, type NavItem } from "@/components/app-shell";
import { requireRole } from "@/lib/authorize";

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Overview", icon: "LayoutDashboard", exact: true },
  { href: "/admin/tenants", label: "Tenants", icon: "Building2" },
  { href: "/admin/championships", label: "Championships", icon: "Trophy" },
  { href: "/admin/roles", label: "Roles", icon: "ShieldCheck" },
  { href: "/admin/messaging", label: "Messaging", icon: "Megaphone" },
  { href: "/admin/testimonials", label: "Testimonials", icon: "Quote" },
  {
    href: "/admin/ksef",
    label: "KSEF",
    icon: "FlaskConical",
    children: [
      { href: "/admin/ksef", label: "Dashboard", icon: "LayoutDashboard", exact: true },
      { href: "/admin/ksef/competitions", label: "Competitions", icon: "CalendarRange" },
      { href: "/admin/ksef/schools", label: "Schools", icon: "School" },
      { href: "/admin/ksef/projects", label: "Projects", icon: "FolderKanban" },
      { href: "/admin/ksef/judges", label: "Judges", icon: "Gavel" },
      { href: "/admin/ksef/judging", label: "Judging", icon: "ClipboardCheck" },
      { href: "/admin/ksef/results", label: "Results", icon: "Award" },
      { href: "/admin/ksef/reports", label: "Reports", icon: "FileBarChart" },
      { href: "/admin/ksef/configuration", label: "Configuration", icon: "Settings2" },
    ],
  },
  { href: "/admin/audit-log", label: "Audit Log", icon: "ScrollText" },
  { href: "/admin/account", label: "Account", icon: "UserCog" },
  { href: "/guide", label: "User Guide", icon: "BookOpen", external: true },
  { href: "/rankings", label: "Public Rankings", icon: "ListOrdered", external: true },
  { href: "https://zarodasolutions.app/", label: "Zaroda School", icon: "ExternalLink", external: true, accent: true },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Defense in depth - never rely on middleware.ts alone to gate /admin.
  try {
    await requireRole(["SUPER_ADMIN"]);
  } catch {
    redirect("/dashboard");
  }

  return (
    <AppShell navItems={NAV_ITEMS} title="Zaroda Admin">
      {children}
    </AppShell>
  );
}
