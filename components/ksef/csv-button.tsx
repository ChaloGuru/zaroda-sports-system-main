"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  // Neutralise spreadsheet formula injection, then quote.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Downloads `rows` (first row = headers) as a CSV file. */
export function CsvButton({ filename, rows }: { filename: string; rows: (string | number | null)[][] }) {
  function download() {
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <Button variant="outline" size="sm" className="no-print" onClick={download} disabled={rows.length <= 1}>
      <Download className="h-4 w-4" /> Download CSV
    </Button>
  );
}
