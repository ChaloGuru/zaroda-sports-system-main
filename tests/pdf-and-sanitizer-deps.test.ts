import { describe, it, expect } from "vitest";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import DOMPurify from "isomorphic-dompurify";

// Guards the jspdf/jspdf-autotable and DOMPurify major upgrades: the PDF
// exports rely on the function-style autoTable(doc, ...) API and on
// doc.lastAutoTable.finalY to stack tables (components/dashboard/reports-panel.tsx),
// and circulars rely on DOMPurify stripping active content (components/sanitized-html.tsx).

describe("jspdf + jspdf-autotable", () => {
  it("draws a table and exposes lastAutoTable.finalY for stacking the next one", () => {
    const doc = new jsPDF();
    autoTable(doc, { startY: 20, head: [["Pos", "Team", "Pts"]], body: [["1", "Thunder FC", "9"], ["2", "Lions", "6"]] });
    const firstY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
    expect(firstY).toBeGreaterThan(20);

    autoTable(doc, { startY: firstY + 8, head: [["Institution", "Total"]], body: [["School A", "12"]] });
    const secondY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
    expect(secondY).toBeGreaterThan(firstY);
  });

  it("paginates long tables and still produces a valid PDF", () => {
    const doc = new jsPDF();
    autoTable(doc, { head: [["#", "Name"]], body: Array.from({ length: 120 }, (_, i) => [String(i + 1), `Athlete ${i + 1}`]) });
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    expect(doc.output()).toMatch(/^%PDF-/);
  });
});

describe("isomorphic-dompurify", () => {
  it("strips scripts and event handlers but keeps formatting", () => {
    const clean = DOMPurify.sanitize(
      '<p onclick="alert(1)">Hello <strong>world</strong></p><script>alert(2)</script><img src=x onerror="alert(3)"><a href="javascript:alert(4)">x</a>',
    );
    expect(clean).toContain("<strong>world</strong>");
    expect(clean).not.toMatch(/script|onclick|onerror|javascript:/i);
  });
});
