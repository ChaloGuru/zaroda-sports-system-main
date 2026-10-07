import { del } from "@vercel/blob";

/**
 * Removes a circular's PDF from Vercel Blob once nothing points to it (the
 * circular was deleted or given a different file). Best effort: a file that
 * can't be removed is logged, never allowed to block the change itself.
 */
export async function deleteCircularFile(url: string | null | undefined): Promise<void> {
  if (!url) return;
  try {
    if (!new URL(url).hostname.endsWith(".blob.vercel-storage.com")) return;
    await del(url);
  } catch (error) {
    console.warn("[circulars] couldn't remove the old PDF:", error instanceof Error ? error.message : error);
  }
}
