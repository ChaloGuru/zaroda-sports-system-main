"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, FileDown, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiPost, apiDelete } from "@/lib/api-client";
import { addPdfLogoHeader } from "@/lib/pdf-logo";

interface SchoolOption {
  id: string;
  name: string;
}

interface RangeRow {
  id: string;
  schoolId: string;
  rangeStart: number;
  rangeEnd: number;
  school: { name: string };
}

export function BibRangesPanel({ championshipId }: { championshipId: string }) {
  const queryClient = useQueryClient();
  const [schoolId, setSchoolId] = React.useState("");
  const [rangeStart, setRangeStart] = React.useState("");
  const [rangeEnd, setRangeEnd] = React.useState("");

  const { data: schoolsData } = useQuery({
    queryKey: ["schools"],
    queryFn: () => apiGet<{ schools: SchoolOption[] }>("/api/schools"),
  });
  const { data: rangesData, isLoading } = useQuery({
    queryKey: ["bib-ranges", championshipId],
    queryFn: () => apiGet<{ ranges: RangeRow[] }>(`/api/bib-ranges?championshipId=${championshipId}`),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiPost("/api/bib-ranges", {
        championshipId,
        schoolId,
        rangeStart: Number(rangeStart),
        rangeEnd: Number(rangeEnd),
      }),
    onSuccess: () => {
      toast.success("Bib range saved");
      queryClient.invalidateQueries({ queryKey: ["bib-ranges", championshipId] });
      setSchoolId("");
      setRangeStart("");
      setRangeEnd("");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to save range"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/bib-ranges/${id}`),
    onSuccess: () => {
      toast.success("Bib range removed");
      queryClient.invalidateQueries({ queryKey: ["bib-ranges", championshipId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to remove range"),
  });

  function editRange(range: RangeRow) {
    setSchoolId(range.schoolId);
    setRangeStart(range.rangeStart.toString());
    setRangeEnd(range.rangeEnd.toString());
  }

  function confirmDelete(range: RangeRow) {
    if (window.confirm(`Remove the bib range for ${range.school.name}?`)) {
      deleteMutation.mutate(range.id);
    }
  }

  async function exportChecklist() {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF();
    const contentY = await addPdfLogoHeader(doc);
    doc.setFontSize(14);
    doc.text("Bib Range Allocation Checklist", 14, contentY + 6);
    autoTable(doc, {
      startY: contentY + 12,
      head: [["School", "Range Start", "Range End", "Allocated"]],
      body: (rangesData?.ranges ?? []).map((r) => [r.school.name, r.rangeStart, r.rangeEnd, r.rangeEnd - r.rangeStart + 1]),
    });
    doc.save("bib-range-checklist.pdf");
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Bib range allocation</CardTitle>
        <Button size="sm" variant="secondary" onClick={exportChecklist}>
          <FileDown className="h-4 w-4" /> Export checklist
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-4 sm:items-end">
          <div className="sm:col-span-2">
            <Label>School</Label>
            <Select value={schoolId} onValueChange={setSchoolId}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select school" /></SelectTrigger>
              <SelectContent>
                {(schoolsData?.schools ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Start</Label>
            <Input type="number" className="mt-1.5" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
          </div>
          <div>
            <Label>End</Label>
            <Input type="number" className="mt-1.5" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
          </div>
          <Button
            className="sm:col-span-4"
            disabled={!schoolId || !rangeStart || !rangeEnd || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            <Plus className="h-4 w-4" />{" "}
            {(rangesData?.ranges ?? []).some((r) => r.schoolId === schoolId) ? "Update range" : "Save range"}
          </Button>
        </div>

        {isLoading && <p className="text-muted">Loading ranges...</p>}
        {!isLoading && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>School</TableHead>
                <TableHead>Range start</TableHead>
                <TableHead>Range end</TableHead>
                <TableHead>Slots</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rangesData?.ranges ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.school.name}</TableCell>
                  <TableCell>{r.rangeStart}</TableCell>
                  <TableCell>{r.rangeEnd}</TableCell>
                  <TableCell>{r.rangeEnd - r.rangeStart + 1}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => editRange(r)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => confirmDelete(r)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {(rangesData?.ranges ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted">No bib ranges allocated yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
