// Client-safe pieces of the KSEF school portal (no server imports here -
// see lib/ksef-registration.ts for the server side).

import { ApiError } from "./api-client";

/** Header the school portal sends its private token in (kept out of API URLs and logs). */
export const PORTAL_TOKEN_HEADER = "x-ksef-school-token";

/** Max learners on a school-registered project (the usual KSEF rule). */
export const MAX_REGISTERED_LEARNERS = 2;

/** A JSON request to a school portal endpoint, carrying the school's private token. */
export async function portalRequest<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...init.headers, [PORTAL_TOKEN_HEADER]: token } });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError((json as { error?: string }).error ?? "Request failed", response.status);
  return json as T;
}
