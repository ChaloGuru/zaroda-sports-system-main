import Link from "next/link";
import type { Level } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PrintButton } from "@/components/ui/print-button";
import { NoKsefEdition, KsefPageHeader } from "@/components/ksef/no-edition";
import { CsvButton } from "@/components/ksef/csv-button";
import { prisma } from "@/lib/prisma";
import { resolveSelectedEdition } from "@/lib/ksef";
import { KSEF_DIVISION_LABELS, competitionUnit } from "@/lib/ksef-config";
import { LEVEL_LABELS, cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const REPORTS = {
  results: "Official results",
  qualifiers: "Qualifiers list",
  register: "Project register",
  summary: "Participation summary",
} as const;
type ReportKey = keyof typeof REPORTS;

const learnerNames = (learners: { firstName: string; lastName: string }[]) => learners.map((l) => `${l.firstName} ${l.lastName}`).join(", ");

export default async function KsefReportsPage(props: { searchParams: Promise<{ report?: string; level?: string }> }) {
  const edition = await resolveSelectedEdition();
  if (!edition) return <NoKsefEdition />;

  const searchParams = await props.searchParams;
  const report: ReportKey = searchParams.report && searchParams.report in REPORTS ? (searchParams.report as ReportKey) : "results";
  const level: Level = edition.levels.find((l) => l === searchParams.level) ?? edition.currentLevel;
  const href = (r: ReportKey, l: Level = level) => `/admin/ksef/reports?report=${r}&level=${l}`;

  return (
    <div className="space-y-6">
      <div className="no-print">
        <KsefPageHeader title="Reports" description={`Printable sheets and CSV exports for ${edition.name}.`} />
      </div>
      <div className="no-print flex flex-wrap gap-2">
        {(Object.keys(REPORTS) as ReportKey[]).map((r) => (
          <Link
            key={r}
            href={href(r)}
            className={cn("rounded-md border border-border px-3 py-1.5 text-sm", r === report ? "bg-primary text-primary-foreground" : "text-muted hover:text-foreground")}
          >
            {REPORTS[r]}
          </Link>
        ))}
      </div>
      {(report === "results" || report === "qualifiers") && (
        <div className="no-print flex flex-wrap gap-2">
          {edition.levels.map((l) => (
            <Link
              key={l}
              href={href(report, l)}
              className={cn("rounded-full px-3 py-1 text-xs font-semibold", l === level ? "bg-primary/10 text-primary" : "text-muted hover:text-foreground")}
            >
              {LEVEL_LABELS[l]}
            </Link>
          ))}
        </div>
      )}

      {report === "results" && <ResultsReport editionId={edition.id} editionName={edition.name} level={level} />}
      {report === "qualifiers" && <QualifiersReport editionId={edition.id} editionName={edition.name} level={level} />}
      {report === "register" && <RegisterReport editionId={edition.id} editionName={edition.name} />}
      {report === "summary" && <SummaryReport editionId={edition.id} editionName={edition.name} />}
    </div>
  );
}

function ReportCard({ title, description, csv, children }: { title: string; description: string; csv: { filename: string; rows: (string | number | null)[][] }; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <div className="flex gap-2">
          <CsvButton {...csv} />
          <PrintButton />
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

async function ResultsReport({ editionId, editionName, level }: { editionId: string; editionName: string; level: Level }) {
  const results = await prisma.ksefResult.findMany({
    where: { level, isPublished: true, project: { editionId, status: "SUBMITTED" } },
    include: {
      project: {
        select: {
          code: true,
          title: true,
          school: { select: { name: true, subcounty: true, county: true, region: true } },
          category: { select: { name: true, division: true } },
          learners: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
  const rows = results
    .map((r) => ({ ...r, unit: competitionUnit(level, r.project.school), group: `${KSEF_DIVISION_LABELS[r.project.category.division]} · ${r.project.category.name}` }))
    .sort((a, b) => a.unit.localeCompare(b.unit) || a.group.localeCompare(b.group) || (a.rank ?? 9999) - (b.rank ?? 9999));

  return (
    <ReportCard
      title={`${editionName} - ${LEVEL_LABELS[level]} official results`}
      description="Published results only, ranked within each category and area."
      csv={{
        filename: `${editionName}-${LEVEL_LABELS[level]}-results.csv`,
        rows: [
          ["Area", "Category", "Rank", "Code", "Title", "School", "Learners", "Score", "Status"],
          ...rows.map((r) => [r.unit, r.group, r.rank, r.project.code, r.project.title, r.project.school.name, learnerNames(r.project.learners), r.totalScore === null ? null : Number(r.totalScore), r.status]),
        ],
      }}
    >
      {rows.length === 0 ? (
        <p className="text-muted">No published results at {LEVEL_LABELS[level]} yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Area</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Rank</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>School</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.unit}</TableCell>
                <TableCell className="text-sm">{r.group}</TableCell>
                <TableCell className="font-mono font-bold">{r.rank ?? "-"}</TableCell>
                <TableCell>
                  <span className="mr-2 font-mono">{r.project.code}</span>
                  {r.project.title}
                </TableCell>
                <TableCell>{r.project.school.name}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{r.totalScore === null ? "-" : Number(r.totalScore).toFixed(2)}</TableCell>
                <TableCell>{r.status === "QUALIFIED" ? "Qualified" : r.status === "NOT_QUALIFIED" ? "-" : "Pending"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </ReportCard>
  );
}

async function QualifiersReport({ editionId, editionName, level }: { editionId: string; editionName: string; level: Level }) {
  const results = await prisma.ksefResult.findMany({
    where: { level, status: "QUALIFIED", isPublished: true, project: { editionId, status: "SUBMITTED" } },
    include: {
      project: {
        select: {
          code: true,
          title: true,
          school: { select: { name: true, subcounty: true, county: true } },
          category: { select: { name: true, division: true } },
          learners: { select: { firstName: true, lastName: true, gender: true, grade: true, upiNumber: true } },
          mentors: { select: { name: true, tscNumber: true, phone: true } },
        },
      },
    },
    orderBy: [{ project: { school: { county: "asc" } } }, { project: { code: "asc" } }],
  });

  return (
    <ReportCard
      title={`${editionName} - qualified at ${LEVEL_LABELS[level]}`}
      description="Projects that qualified for the next level, with their learners and mentors."
      csv={{
        filename: `${editionName}-${LEVEL_LABELS[level]}-qualifiers.csv`,
        rows: [
          ["Code", "Title", "Division", "Category", "School", "Sub-county", "County", "Rank", "Learners", "Mentor", "Mentor TSC", "Mentor phone"],
          ...results.map((r) => [
            r.project.code, r.project.title, KSEF_DIVISION_LABELS[r.project.category.division], r.project.category.name, r.project.school.name,
            r.project.school.subcounty, r.project.school.county, r.rank, learnerNames(r.project.learners),
            r.project.mentors.map((m) => m.name).join("; "), r.project.mentors.map((m) => m.tscNumber ?? "").join("; "), r.project.mentors.map((m) => m.phone ?? "").join("; "),
          ]),
        ],
      }}
    >
      {results.length === 0 ? (
        <p className="text-muted">No published qualifiers at {LEVEL_LABELS[level]} yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>School</TableHead>
              <TableHead>Learners</TableHead>
              <TableHead>Mentor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono">{r.project.code}</TableCell>
                <TableCell>
                  {r.project.title}
                  <span className="block text-xs text-muted">{r.project.category.name} · rank {r.rank}</span>
                </TableCell>
                <TableCell>
                  {r.project.school.name}
                  <span className="block text-xs text-muted">
                    {r.project.school.subcounty}, {r.project.school.county}
                  </span>
                </TableCell>
                <TableCell className="text-sm">{learnerNames(r.project.learners)}</TableCell>
                <TableCell className="text-sm">{r.project.mentors.map((m) => m.name).join(", ")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </ReportCard>
  );
}

async function RegisterReport({ editionId, editionName }: { editionId: string; editionName: string }) {
  const projects = await prisma.ksefProject.findMany({
    where: { editionId, status: { not: "WITHDRAWN" } },
    include: {
      school: { select: { name: true, subcounty: true, county: true } },
      category: { select: { name: true, division: true } },
      subCategory: { select: { name: true } },
      learners: { select: { firstName: true, lastName: true, gender: true, grade: true, upiNumber: true } },
      mentors: { select: { name: true, tscNumber: true } },
    },
    orderBy: [{ school: { name: "asc" } }, { code: "asc" }],
  });

  return (
    <ReportCard
      title={`${editionName} - project register`}
      description="Every registered project (drafts and submitted) by school."
      csv={{
        filename: `${editionName}-project-register.csv`,
        rows: [
          ["School", "Sub-county", "County", "Code", "Title", "Division", "Category", "Sub-category", "Status", "Learners", "Learner UPI numbers", "Mentor", "Mentor TSC"],
          ...projects.map((p) => [
            p.school.name, p.school.subcounty, p.school.county, p.code, p.title, KSEF_DIVISION_LABELS[p.category.division], p.category.name,
            p.subCategory?.name ?? null, p.status, learnerNames(p.learners), p.learners.map((l) => l.upiNumber ?? "").join("; "),
            p.mentors.map((m) => m.name).join("; "), p.mentors.map((m) => m.tscNumber ?? "").join("; "),
          ]),
        ],
      }}
    >
      {projects.length === 0 ? (
        <p className="text-muted">No projects registered yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>School</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Learners</TableHead>
              <TableHead>Mentor</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.school.name}</TableCell>
                <TableCell className="font-mono">{p.code ?? "-"}</TableCell>
                <TableCell>
                  {p.title}
                  <span className="block text-xs text-muted">
                    {KSEF_DIVISION_LABELS[p.category.division]} · {p.category.name}
                    {p.subCategory ? ` / ${p.subCategory.name}` : ""}
                  </span>
                </TableCell>
                <TableCell className="text-sm">{learnerNames(p.learners)}</TableCell>
                <TableCell className="text-sm">{p.mentors.map((m) => m.name).join(", ")}</TableCell>
                <TableCell className="text-sm">{p.status.toLowerCase()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </ReportCard>
  );
}

async function SummaryReport({ editionId, editionName }: { editionId: string; editionName: string }) {
  const projects = await prisma.ksefProject.findMany({
    where: { editionId, status: "SUBMITTED" },
    select: {
      school: { select: { county: true } },
      category: { select: { name: true, division: true } },
      learners: { select: { gender: true } },
    },
  });

  const byCounty = new Map<string, { projects: number; girls: number; boys: number }>();
  const byCategory = new Map<string, number>();
  for (const p of projects) {
    const c = byCounty.get(p.school.county) ?? { projects: 0, girls: 0, boys: 0 };
    c.projects += 1;
    c.girls += p.learners.filter((l) => l.gender === "GIRLS").length;
    c.boys += p.learners.filter((l) => l.gender === "BOYS").length;
    byCounty.set(p.school.county, c);
    const cat = `${KSEF_DIVISION_LABELS[p.category.division]} · ${p.category.name}`;
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1);
  }
  const counties = Array.from(byCounty.entries()).sort(([a], [b]) => a.localeCompare(b));
  const categories = Array.from(byCategory.entries()).sort(([a], [b]) => a.localeCompare(b));

  return (
    <ReportCard
      title={`${editionName} - participation summary`}
      description="Submitted projects and learners by county and by category."
      csv={{
        filename: `${editionName}-participation-summary.csv`,
        rows: [["County", "Projects", "Girls", "Boys"], ...counties.map(([county, c]) => [county, c.projects, c.girls, c.boys])],
      }}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>County</TableHead>
              <TableHead className="text-right">Projects</TableHead>
              <TableHead className="text-right">Girls</TableHead>
              <TableHead className="text-right">Boys</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {counties.map(([county, c]) => (
              <TableRow key={county}>
                <TableCell>{county}</TableCell>
                <TableCell className="text-right font-mono">{c.projects}</TableCell>
                <TableCell className="text-right font-mono">{c.girls}</TableCell>
                <TableCell className="text-right font-mono">{c.boys}</TableCell>
              </TableRow>
            ))}
            {counties.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted">
                  No submitted projects yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Projects</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map(([category, count]) => (
              <TableRow key={category}>
                <TableCell>{category}</TableCell>
                <TableCell className="text-right font-mono">{count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </ReportCard>
  );
}
