"use client";

import { useSession } from "next-auth/react";
import type { Role } from "@prisma/client";
import { roleMatchesGameScope, type ScopableGame } from "@/lib/role-scope";

/**
 * Client-side mirror of lib/authorize.ts's requireGameAccess, for hiding/
 * disabling controls a scoped role can't use before the user clicks and gets
 * a 403 - the API call is still the real security boundary, this is UX only.
 */
export function useCanManageGame(
  championshipId: string,
  allowedRoles: Role[],
  game: ScopableGame | null | undefined,
): boolean {
  const { data: session } = useSession();
  const roles = session?.user?.roles ?? [];
  if (!game) return false;
  if (roles.some((r) => r.role === "SUPER_ADMIN" || r.role === "TENANT_OWNER")) return true;
  return roles.some(
    (r) => r.championshipId === championshipId && allowedRoles.includes(r.role as Role) && roleMatchesGameScope(r, game),
  );
}
