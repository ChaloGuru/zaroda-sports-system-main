import { describe, it, expect } from "vitest";
import jsPDF from "jspdf";
import { addPdfFooter } from "@/lib/pdf-logo";

describe("addPdfFooter", () => {
  it("stamps the footer text on every page of a multi-page document", () => {
    const doc = new jsPDF();
    doc.text("Page 1", 14, 20);
    doc.addPage();
    doc.text("Page 2", 14, 20);

    addPdfFooter(doc);

    // jsPDF's internal text stream doesn't expose a clean "get text on page"
    // API, so assert via the raw PDF output containing our footer string.
    const output = doc.output();
    const occurrences = output.split("Powered by Zaroda Solutions").length - 1;
    expect(occurrences).toBe(2);
  });
});
