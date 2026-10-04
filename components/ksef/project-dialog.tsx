"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, apiPatch, apiPost } from "@/lib/api-client";
import { portalRequest } from "@/lib/ksef-portal-client";
import { KSEF_DIVISIONS, KSEF_DIVISION_LABELS } from "@/lib/ksef-config";
import type { KsefCategoryRow, KsefEditionSummary } from "./types";

export interface ProjectLearner {
  firstName: string;
  lastName: string;
  gender: "BOYS" | "GIRLS";
  grade: string | null;
  upiNumber: string | null;
}

export interface ProjectMentor {
  name: string;
  tscNumber: string | null;
  phone: string | null;
  email: string | null;
}

export interface ProjectRow {
  id: string;
  code: string | null;
  title: string;
  abstract: string | null;
  documentUrl: string | null;
  status: "DRAFT" | "SUBMITTED" | "WITHDRAWN";
  currentLevel: string;
  school: { id: string; name: string; subcounty: string; county: string };
  category: { id: string; name: string; division: "JUNIOR_SCHOOL" | "SENIOR_SCHOOL" };
  subCategory: { id: string; name: string } | null;
  learners: ProjectLearner[];
  mentors: ProjectMentor[];
  /** Set when the school entered this project itself through its registration link. */
  registration?: { status: "PENDING" | "APPROVED" | "REJECTED" } | null;
}

/**
 * A school entering its own projects through its private registration link
 * (see lib/ksef-registration.ts): no school picker, the portal endpoints, and
 * at most `maxLearners` learners.
 */
export interface PortalMode {
  token: string;
  maxLearners: number;
  onSaved: () => void;
}

const EMPTY_LEARNER: ProjectLearner = { firstName: "", lastName: "", gender: "GIRLS", grade: "", upiNumber: "" };
const EMPTY_MENTOR: ProjectMentor = { name: "", tscNumber: "", phone: "", email: "" };

/** Create (no `project`) or edit a project, including its learners and mentor(s). */
export function ProjectDialog({
  edition,
  schools,
  categories,
  project,
  open,
  onOpenChange,
  portal,
}: {
  /** Admin mode only. */
  edition?: KsefEditionSummary;
  /** Admin mode only - a portal project always belongs to the school entering it. */
  schools?: { schoolId: string; name: string }[];
  portal?: PortalMode;
  categories: KsefCategoryRow[];
  project: ProjectRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const placementLocked = !!project && project.status !== "DRAFT";
  const [division, setDivision] = React.useState<string>(project?.category.division ?? "JUNIOR_SCHOOL");
  const [form, setForm] = React.useState({
    schoolId: project?.school.id ?? "",
    categoryId: project?.category.id ?? "",
    subCategoryId: project?.subCategory?.id ?? "",
    title: project?.title ?? "",
    abstract: project?.abstract ?? "",
    documentUrl: project?.documentUrl ?? "",
  });
  const [learners, setLearners] = React.useState<ProjectLearner[]>(project?.learners.length ? project.learners : [{ ...EMPTY_LEARNER }]);
  const [mentors, setMentors] = React.useState<ProjectMentor[]>(project?.mentors.length ? project.mentors : [{ ...EMPTY_MENTOR }]);
  const [uploading, setUploading] = React.useState(false);
  const maxLearners = portal?.maxLearners ?? Infinity;

  const divisionCategories = categories.filter((c) => c.division === division && (c.isActive || c.id === form.categoryId));
  const subCategories = categories.find((c) => c.id === form.categoryId)?.subCategories.filter((s) => s.isActive || s.id === form.subCategoryId) ?? [];

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        subCategoryId: form.subCategoryId || null,
        // Blank rows are ignored rather than rejected.
        learners: learners.filter((l) => l.firstName.trim() || l.lastName.trim()),
        mentors: mentors.filter((m) => m.name.trim()),
      };
      if (portal) {
        const { schoolId: _schoolId, ...portalBody } = body;
        return portalRequest(portal.token, project ? `/api/ksef/school-portal/projects/${project.id}` : "/api/ksef/school-portal/projects", {
          method: project ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(portalBody),
        });
      }
      return project ? apiPatch(`/api/ksef/projects/${project.id}`, body) : apiPost("/api/ksef/projects", { editionId: edition?.id, ...body });
    },
    onSuccess: () => {
      toast.success(project ? "Project updated" : portal ? "Project saved" : "Project registered as a draft");
      if (portal) portal.onSaved();
      else queryClient.invalidateQueries({ queryKey: ["ksef-projects", edition?.id] });
      onOpenChange(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to save project"),
  });

  async function upload(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      let json: { url: string };
      if (portal) {
        json = await portalRequest(portal.token, "/api/ksef/school-portal/upload", { method: "POST", body });
      } else {
        const response = await fetch("/api/ksef/projects/upload", { method: "POST", body });
        json = await response.json();
        if (!response.ok) throw new ApiError((json as { error?: string }).error ?? "Upload failed", response.status);
      }
      setForm((f) => ({ ...f, documentUrl: json.url }));
      toast.success("Project report attached");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{project ? `Edit ${project.code ?? "project"}` : "Register project"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {placementLocked && (
            <p className="text-xs text-muted">School and category are fixed once a project is submitted.</p>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Project title</Label>
              <Input className="mt-1.5" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            {schools && (
            <div>
              <Label>School</Label>
              <Select value={form.schoolId} onValueChange={(v) => setForm((f) => ({ ...f, schoolId: v }))} disabled={placementLocked}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select school" />
                </SelectTrigger>
                <SelectContent>
                  {schools.map((s) => (
                    <SelectItem key={s.schoolId} value={s.schoolId}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {schools.length === 0 && <p className="mt-1 text-xs text-muted">Register schools on the Schools page first.</p>}
            </div>
            )}
            <div>
              <Label>Division</Label>
              <Select
                value={division}
                onValueChange={(v) => {
                  setDivision(v);
                  setForm((f) => ({ ...f, categoryId: "", subCategoryId: "" }));
                }}
                disabled={placementLocked}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KSEF_DIVISIONS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {KSEF_DIVISION_LABELS[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.categoryId} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v, subCategoryId: "" }))} disabled={placementLocked}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {divisionCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sub-category</Label>
              <Select
                value={form.subCategoryId || "NONE"}
                onValueChange={(v) => setForm((f) => ({ ...f, subCategoryId: v === "NONE" ? "" : v }))}
                disabled={subCategories.length === 0}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">{subCategories.length === 0 ? "None for this category" : "None"}</SelectItem>
                  {subCategories.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Abstract</Label>
              <Textarea className="mt-1.5" rows={4} value={form.abstract} onChange={(e) => setForm((f) => ({ ...f, abstract: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <Label>Project report (PDF)</Label>
              <div className="mt-1.5 flex flex-wrap items-center gap-3">
                <Input type="file" accept="application/pdf" className="max-w-xs" disabled={uploading} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                {form.documentUrl && (
                  <a href={form.documentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-primary underline">
                    <FileText className="h-4 w-4" /> View attached report
                  </a>
                )}
                {uploading && <span className="text-sm text-muted">Uploading...</span>}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Learners{Number.isFinite(maxLearners) ? ` (up to ${maxLearners})` : ""}</Label>
              <Button size="sm" variant="outline" disabled={learners.length >= maxLearners} onClick={() => setLearners((l) => [...l, { ...EMPTY_LEARNER }])}>
                <Plus className="h-3.5 w-3.5" /> Add learner
              </Button>
            </div>
            {learners.map((l, i) => (
              <div key={i} className="grid gap-2 rounded-md border border-border p-2 md:grid-cols-[1fr_1fr_110px_90px_1fr_auto]">
                <Input placeholder="First name" value={l.firstName} onChange={(e) => setLearners((all) => all.map((x, j) => (j === i ? { ...x, firstName: e.target.value } : x)))} />
                <Input placeholder="Last name" value={l.lastName} onChange={(e) => setLearners((all) => all.map((x, j) => (j === i ? { ...x, lastName: e.target.value } : x)))} />
                <Select value={l.gender} onValueChange={(v) => setLearners((all) => all.map((x, j) => (j === i ? { ...x, gender: v as "BOYS" | "GIRLS" } : x)))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GIRLS">Female</SelectItem>
                    <SelectItem value="BOYS">Male</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Grade" value={l.grade ?? ""} onChange={(e) => setLearners((all) => all.map((x, j) => (j === i ? { ...x, grade: e.target.value } : x)))} />
                <Input placeholder="NEMIS / UPI no." value={l.upiNumber ?? ""} onChange={(e) => setLearners((all) => all.map((x, j) => (j === i ? { ...x, upiNumber: e.target.value } : x)))} />
                <Button size="icon" variant="ghost" aria-label="Remove learner" onClick={() => setLearners((all) => all.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Mentor (patron)</Label>
              <Button size="sm" variant="outline" onClick={() => setMentors((m) => [...m, { ...EMPTY_MENTOR }])}>
                <Plus className="h-3.5 w-3.5" /> Add mentor
              </Button>
            </div>
            {mentors.map((m, i) => (
              <div key={i} className="grid gap-2 rounded-md border border-border p-2 md:grid-cols-[1.3fr_1fr_1fr_1.3fr_auto]">
                <Input placeholder="Full name" value={m.name} onChange={(e) => setMentors((all) => all.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <Input placeholder="TSC no." value={m.tscNumber ?? ""} onChange={(e) => setMentors((all) => all.map((x, j) => (j === i ? { ...x, tscNumber: e.target.value } : x)))} />
                <Input placeholder="Phone" value={m.phone ?? ""} onChange={(e) => setMentors((all) => all.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} />
                <Input placeholder="Email" value={m.email ?? ""} onChange={(e) => setMentors((all) => all.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
                <Button size="icon" variant="ghost" aria-label="Remove mentor" onClick={() => setMentors((all) => all.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <Button
            className="w-full"
            disabled={saveMutation.isPending || uploading || !form.title.trim() || (!portal && !form.schoolId) || !form.categoryId}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? "Saving..." : project ? "Save changes" : portal ? "Save project" : "Register project"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
