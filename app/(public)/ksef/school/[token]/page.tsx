"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, FlaskConical, Pencil, Plus, Trash2 } from "lucide-react";
import type { KsefDivision, KsefProjectStatus, KsefRegistrationStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ProjectDialog, type ProjectLearner, type ProjectMentor, type ProjectRow } from "@/components/ksef/project-dialog";
import type { KsefCategoryRow } from "@/components/ksef/types";
import { KSEF_DIVISION_LABELS } from "@/lib/ksef-config";
import { MAX_REGISTERED_LEARNERS, portalRequest } from "@/lib/ksef-portal-client";

interface PortalCategory {
  id: string;
  name: string;
  division: KsefDivision;
  subCategories: { id: string; name: string }[];
}

interface PortalProject {
  id: string;
  code: string | null;
  status: KsefProjectStatus;
  title: string;
  abstract: string | null;
  documentUrl: string | null;
  categoryId: string;
  subCategoryId: string | null;
  learners: ProjectLearner[];
  mentors: ProjectMentor[];
}

interface PortalData {
  registration: {
    schoolName: string;
    county: string;
    subcounty: string;
    contactName: string;
    contactEmail: string;
    status: KsefRegistrationStatus;
    rejectionReason: string | null;
  };
  edition: { name: string; closesAt: string | null };
  writable: boolean;
  categories: PortalCategory[];
  projects: PortalProject[];
}

const REGISTRATION_BADGE = {
  PENDING: { variant: "warning", label: "Awaiting approval" },
  APPROVED: { variant: "success", label: "Approved" },
  REJECTED: { variant: "destructive", label: "Not accepted" },
} as const;

/** A school's private page for entering its KSEF projects (link emailed at registration). */
export default function KsefSchoolPortalPage() {
  const { token } = useParams<{ token: string }>();
  const [editing, setEditing] = React.useState<ProjectRow | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["ksef-school-portal", token],
    queryFn: () => portalRequest<PortalData>(token, "/api/ksef/school-portal"),
    retry: false,
  });

  // The dialog works with the admin's richer shapes - fill in what the portal doesn't need.
  const categories: KsefCategoryRow[] = React.useMemo(
    () =>
      (data?.categories ?? []).map((c) => ({
        ...c,
        isActive: true,
        subCategories: c.subCategories.map((s) => ({ ...s, isActive: true })),
        _count: { projects: 0 },
      })),
    [data],
  );
  const toRow = (p: PortalProject): ProjectRow => {
    const category = data!.categories.find((c) => c.id === p.categoryId);
    return {
      ...p,
      currentLevel: "",
      school: { id: "", name: data!.registration.schoolName, subcounty: data!.registration.subcounty, county: data!.registration.county },
      category: { id: p.categoryId, name: category?.name ?? "", division: category?.division ?? "JUNIOR_SCHOOL" },
      subCategory: p.subCategoryId ? { id: p.subCategoryId, name: category?.subCategories.find((s) => s.id === p.subCategoryId)?.name ?? "" } : null,
    };
  };

  async function remove(project: PortalProject) {
    if (!window.confirm(`Remove "${project.title}"?`)) return;
    try {
      await portalRequest(token, `/api/ksef/school-portal/projects/${project.id}`, { method: "DELETE" });
      toast.success("Project removed");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove the project");
    }
  }

  if (isLoading) return <p className="container py-16 text-center text-muted">Loading your school&apos;s entries...</p>;
  if (error || !data) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-16">
        <Card className="w-full max-w-md text-center">
          <CardContent className="space-y-4 pt-6">
            <p className="text-foreground">{error instanceof Error ? error.message : "This link isn't valid."}</p>
            <Button asChild variant="outline">
              <Link href="/">Go to Zaroda Sports</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { registration, edition, writable, projects } = data;
  const badge = REGISTRATION_BADGE[registration.status];
  const categoryName = (id: string) => data.categories.find((c) => c.id === id);

  return (
    <div className="container max-w-4xl space-y-6 py-12">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <FlaskConical className="h-8 w-8 text-primary" />
            <div className="flex-1">
              <CardTitle>{registration.schoolName}</CardTitle>
              <CardDescription>
                {edition.name} · {registration.subcounty}, {registration.county} · Contact: {registration.contactName}
              </CardDescription>
            </div>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {registration.status === "PENDING" && (
            <p className="text-muted">
              You can enter your projects now. The KSEF administrator will confirm your school, then review each project before it enters judging.
            </p>
          )}
          {registration.status === "REJECTED" && (
            <p className="text-foreground">This registration wasn&apos;t accepted{registration.rejectionReason ? `: ${registration.rejectionReason}` : "."}</p>
          )}
          {registration.status !== "REJECTED" && !writable && (
            <p className="text-foreground">Registration has closed - your entries can no longer be changed here. Contact the KSEF administrator for changes.</p>
          )}
          {writable && edition.closesAt && (
            <p className="text-muted">
              You can make changes until {new Date(edition.closesAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Projects</CardTitle>
            <CardDescription>Up to {MAX_REGISTERED_LEARNERS} learners per project, with their mentor.</CardDescription>
          </div>
          {writable && (
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add project
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {projects.length === 0 && <p className="text-muted">No projects entered yet.</p>}
          {projects.map((p) => {
            const category = categoryName(p.categoryId);
            return (
              <div key={p.id} className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{p.title}</span>
                    {p.status === "DRAFT" && <Badge variant="outline">Awaiting review</Badge>}
                    {p.status === "SUBMITTED" && <Badge variant="success">Entered{p.code ? ` · ${p.code}` : ""}</Badge>}
                    {p.status === "WITHDRAWN" && <Badge variant="secondary">Withdrawn</Badge>}
                  </div>
                  <p className="text-sm text-muted">
                    {category ? `${KSEF_DIVISION_LABELS[category.division]} · ${category.name}` : ""} ·{" "}
                    {p.learners.map((l) => `${l.firstName} ${l.lastName}`).join(", ")}
                  </p>
                  {p.documentUrl && (
                    <a href={p.documentUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm text-primary underline">
                      <FileText className="h-3.5 w-3.5" /> Project report
                    </a>
                  )}
                </div>
                {writable && p.status === "DRAFT" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditing(toRow(p));
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" aria-label="Remove project" onClick={() => remove(p)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted">
        Keep this page&apos;s link private - anyone with it can change your school&apos;s entries.
      </p>

      {dialogOpen && (
        <ProjectDialog
          key={editing?.id ?? "new"}
          categories={categories}
          project={editing}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          portal={{ token, maxLearners: MAX_REGISTERED_LEARNERS, onSaved: () => refetch() }}
        />
      )}
    </div>
  );
}
