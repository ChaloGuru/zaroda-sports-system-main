"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiDelete, apiGet, apiPost } from "@/lib/api-client";
import { KENYA_COUNTIES } from "@/lib/kenya-counties";
import type { KsefEditionSummary } from "./types";

interface EditionSchool {
  id: string;
  schoolId: string;
  name: string;
  subcounty: string;
  county: string;
  region: string;
  projectCount: number;
}

interface ExistingSchool {
  id: string;
  name: string;
  subcounty: string;
  county: string;
}

function AddSchoolCard({ edition }: { edition: KsefEditionSummary }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [form, setForm] = React.useState({ name: "", county: "", subcounty: "", zone: "" });

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data: matches } = useQuery({
    queryKey: ["ksef-school-search", edition.id, debounced],
    queryFn: () => apiGet<{ schools: ExistingSchool[] }>(`/api/ksef/schools?editionId=${edition.id}&search=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2,
  });

  const addMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/api/ksef/schools", { editionId: edition.id, ...body }),
    onSuccess: () => {
      toast.success("School registered");
      queryClient.invalidateQueries({ queryKey: ["ksef-schools", edition.id] });
      queryClient.invalidateQueries({ queryKey: ["ksef-school-search", edition.id] });
      setForm({ name: "", county: "", subcounty: "", zone: "" });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to register school"),
  });

  const subcounties = KENYA_COUNTIES.find((c) => c.name === form.county)?.subcounties ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Register a school</CardTitle>
        <CardDescription>Search for a school already in Zaroda first - add a new one only if it isn&apos;t there.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <Label>Find an existing school</Label>
          <div className="relative mt-1.5">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input className="pl-9" placeholder="Type at least 2 letters of the school name" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {debounced.length >= 2 && (
            <div className="mt-2 space-y-1">
              {(matches?.schools ?? []).length === 0 && <p className="text-sm text-muted">No matching school - add it below.</p>}
              {(matches?.schools ?? []).map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium text-foreground">{s.name}</span>
                    <span className="ml-2 text-muted">
                      {s.subcounty}, {s.county}
                    </span>
                  </span>
                  <Button size="sm" variant="secondary" disabled={addMutation.isPending} onClick={() => addMutation.mutate({ schoolId: s.id })}>
                    Register
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <Label>Or add a new school</Label>
          <div className="grid gap-3 md:grid-cols-2">
            <Input placeholder="School name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <Input placeholder="Zone (optional)" value={form.zone} onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))} />
            <Select value={form.county} onValueChange={(v) => setForm((f) => ({ ...f, county: v, subcounty: "" }))}>
              <SelectTrigger>
                <SelectValue placeholder="County" />
              </SelectTrigger>
              <SelectContent>
                {KENYA_COUNTIES.map((c) => (
                  <SelectItem key={c.name} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={form.subcounty} onValueChange={(v) => setForm((f) => ({ ...f, subcounty: v }))} disabled={!form.county}>
              <SelectTrigger>
                <SelectValue placeholder="Sub-county" />
              </SelectTrigger>
              <SelectContent>
                {subcounties.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            disabled={!form.name.trim() || !form.county || !form.subcounty || addMutation.isPending}
            onClick={() => addMutation.mutate(form)}
          >
            <Plus className="h-4 w-4" /> Add school
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function SchoolsManager({ edition }: { edition: KsefEditionSummary }) {
  const queryClient = useQueryClient();
  const readOnly = edition.status === "CLOSED";
  const [filter, setFilter] = React.useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["ksef-schools", edition.id],
    queryFn: () => apiGet<{ schools: EditionSchool[] }>(`/api/ksef/schools?editionId=${edition.id}`),
  });
  const schools = (data?.schools ?? []).filter((s) =>
    `${s.name} ${s.subcounty} ${s.county}`.toLowerCase().includes(filter.toLowerCase()),
  );

  const removeMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/ksef/schools/${id}`),
    onSuccess: () => {
      toast.success("School removed from this edition");
      queryClient.invalidateQueries({ queryKey: ["ksef-schools", edition.id] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to remove school"),
  });

  return (
    <div className="space-y-6">
      {!readOnly && <AddSchoolCard edition={edition} />}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Registered schools ({data?.schools.length ?? 0})</CardTitle>
            <CardDescription>Projects compete within their school&apos;s sub-county, county and region.</CardDescription>
          </div>
          <Input className="w-64" placeholder="Filter schools..." value={filter} onChange={(e) => setFilter(e.target.value)} />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted">Loading...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead>Sub-county</TableHead>
                  <TableHead>County</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead className="text-right">Projects</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {schools.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.subcounty}</TableCell>
                    <TableCell>{s.county}</TableCell>
                    <TableCell>{s.region}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{s.projectCount}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Remove ${s.name}`}
                        disabled={readOnly || s.projectCount > 0 || removeMutation.isPending}
                        onClick={() => removeMutation.mutate(s.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {schools.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted">
                      No schools registered yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
