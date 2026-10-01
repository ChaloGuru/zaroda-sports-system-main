import Link from "next/link";
import { School, FolderKanban, GraduationCap, Microscope, Hourglass, Award, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NoKsefEdition, KsefPageHeader } from "@/components/ksef/no-edition";
import { prisma } from "@/lib/prisma";
import { resolveSelectedEdition } from "@/lib/ksef";
import { KSEF_DIVISION_LABELS } from "@/lib/ksef-config";
import { LEVEL_LABELS, cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function KsefDashboardPage() {
  const edition = await resolveSelectedEdition();
  if (!edition) return <NoKsefEdition />;

  const level = edition.currentLevel;
  const activeProjects = { editionId: edition.id, status: { not: "WITHDRAWN" as const } };

  const [schools, projects, junior, senior, awaitingJudging, qualified, byCategory] = await Promise.all([
    prisma.ksefEditionSchool.count({ where: { editionId: edition.id } }),
    prisma.ksefProject.count({ where: activeProjects }),
    prisma.ksefProject.count({ where: { ...activeProjects, category: { division: "JUNIOR_SCHOOL" } } }),
    prisma.ksefProject.count({ where: { ...activeProjects, category: { division: "SENIOR_SCHOOL" } } }),
    // Competing at the current level with no submitted judge score sheet yet.
    prisma.ksefResult.count({
      where: {
        level,
        project: {
          editionId: edition.id,
          status: "SUBMITTED",
          assignments: { none: { level, submittedAt: { not: null } } },
        },
      },
    }),
    prisma.ksefResult.count({ where: { level, status: "QUALIFIED", project: { editionId: edition.id } } }),
    prisma.ksefCategory.findMany({
      where: { editionId: edition.id },
      orderBy: [{ division: "asc" }, { sortOrder: "asc" }],
      select: {
        id: true,
        name: true,
        division: true,
        isActive: true,
        _count: { select: { projects: { where: { status: { not: "WITHDRAWN" } } } } },
      },
    }),
  ]);

  return (
    <div className="space-y-8">
      <KsefPageHeader title={`${edition.name} dashboard`} description="Kenya Science and Engineering Fair at a glance." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<School className="h-5 w-5 text-primary" />} label="Total schools" value={schools} href="/admin/ksef/schools" />
        <Stat icon={<FolderKanban className="h-5 w-5 text-primary" />} label="Total projects" value={projects} href="/admin/ksef/projects" />
        <Stat icon={<GraduationCap className="h-5 w-5 text-primary" />} label="Junior School projects" value={junior} />
        <Stat icon={<Microscope className="h-5 w-5 text-primary" />} label="Senior School projects" value={senior} />
        <Stat icon={<Hourglass className="h-5 w-5 text-primary" />} label="Pending judging" value={awaitingJudging} href="/admin/ksef/judging" />
        <Stat icon={<Award className="h-5 w-5 text-primary" />} label={`Qualified at ${LEVEL_LABELS[level]}`} value={qualified} href="/admin/ksef/results" />
        <Card className="sm:col-span-2">
          <CardContent className="py-6">
            <p className="mb-3 flex items-center gap-2 text-sm text-muted">
              <MapPin className="h-4 w-4" /> Current competition level
            </p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {edition.levels.map((l, i) => (
                <span key={l} className="flex items-center gap-2">
                  {i > 0 && <span className="text-muted">→</span>}
                  <span
                    className={cn(
                      "rounded-full px-3 py-1 font-semibold",
                      l === level ? "bg-primary text-primary-foreground" : "bg-surface-overlay text-muted",
                    )}
                  >
                    {LEVEL_LABELS[l]}
                  </span>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Projects by category</CardTitle>
          <CardDescription>Excludes withdrawn projects.</CardDescription>
        </CardHeader>
        <CardContent>
          {byCategory.length === 0 ? (
            <p className="text-muted">
              No categories configured yet - set them up in{" "}
              <Link href="/admin/ksef/configuration" className="text-primary underline">
                Configuration
              </Link>
              .
            </p>
          ) : (
            <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
              {byCategory.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm">
                  <span className={cn("text-foreground", !c.isActive && "text-muted line-through")}>
                    {c.name}
                    <span className="ml-2 text-xs text-muted">{KSEF_DIVISION_LABELS[c.division]}</span>
                  </span>
                  <span className="font-mono font-semibold tabular-nums">{c._count.projects}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: number; href?: string }) {
  const body = (
    <Card className={cn("h-full", href && "transition-colors hover:border-primary/50")}>
      <CardContent className="flex items-center gap-4 py-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-navy-light/40">{icon}</div>
        <div>
          <p className="font-mono text-2xl font-bold tabular-nums text-foreground">{value.toLocaleString()}</p>
          <p className="text-sm text-muted">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
