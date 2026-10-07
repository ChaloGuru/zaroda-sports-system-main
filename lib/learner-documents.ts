/** Shared by the browser and the server - no server imports here. */

/** The documents a school can upload to show who a learner is. */
export const ID_DOCUMENT_KINDS = [
  { value: "BIRTH_CERTIFICATE", label: "Birth certificate" },
  { value: "KNEC_RECORD", label: "KNEC registration record" },
  { value: "OTHER", label: "Other official document" },
] as const;
export type IdDocumentKind = (typeof ID_DOCUMENT_KINDS)[number]["value"];

export function idDocumentLabel(kind: string | null | undefined): string {
  return ID_DOCUMENT_KINDS.find((k) => k.value === kind)?.label ?? "Document";
}

/** Document photos are resized in the browser to stay readable but under this. */
export const MAX_DOCUMENT_BYTES = 800 * 1024;
