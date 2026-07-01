"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { apiGet } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";

interface AuditLogRow {
  id: string;
  operation: "INSERT" | "UPDATE" | "DELETE";
  tableName: string;
  recordId: string;
  changedAt: string;
  changer: { name: string; email: string } | null;
  oldData: unknown;
  newData: unknown;
}

const OPERATION_VARIANT: Record<AuditLogRow["operation"], "success" | "warning" | "destructive"> = {
  INSERT: "success",
  UPDATE: "warning",
  DELETE: "destructive",
};

export function AuditLogViewer() {
  const [tableFilter, setTableFilter] = React.useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", tableFilter],
    queryFn: () =>
      apiGet<{ logs: AuditLogRow[] }>(
        `/api/admin/audit-logs${tableFilter ? `?tableName=${encodeURIComponent(tableFilter)}` : ""}`,
      ),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit Trail</CardTitle>
        <CardDescription>Read-only log of every mutating write across the platform.</CardDescription>
        <Input
          placeholder="Filter by table name (e.g. championships)"
          value={tableFilter}
          onChange={(e) => setTableFilter(e.target.value)}
          className="mt-2 max-w-sm"
        />
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted">Loading...</p>}
        {!isLoading && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Operation</TableHead>
                <TableHead>Table</TableHead>
                <TableHead>Record</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.logs ?? []).map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-xs">{formatDate(log.changedAt)}</TableCell>
                  <TableCell className="text-xs">{log.changer ? `${log.changer.name}` : "System"}</TableCell>
                  <TableCell>
                    <Badge variant={OPERATION_VARIANT[log.operation]}>{log.operation}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{log.tableName}</TableCell>
                  <TableCell className="max-w-[160px] truncate text-xs">{log.recordId}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {!isLoading && (data?.logs ?? []).length === 0 && (
          <p className="py-6 text-center text-sm text-muted">No audit entries match this filter.</p>
        )}
      </CardContent>
    </Card>
  );
}
