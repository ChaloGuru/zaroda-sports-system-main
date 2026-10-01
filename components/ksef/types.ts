import type { KsefDivision, KsefEdition, KsefEditionStatus, Level } from "@prisma/client";

/** The serializable slice of a KsefEdition passed from server pages to client components. */
export interface KsefEditionSummary {
  id: string;
  year: number;
  name: string;
  status: KsefEditionStatus;
  levels: Level[];
  currentLevel: Level;
  qualifiersPerCategory: number;
  startDate: string | null;
  endDate: string | null;
}

export function toEditionSummary(edition: KsefEdition): KsefEditionSummary {
  return {
    id: edition.id,
    year: edition.year,
    name: edition.name,
    status: edition.status,
    levels: edition.levels,
    currentLevel: edition.currentLevel,
    qualifiersPerCategory: edition.qualifiersPerCategory,
    startDate: edition.startDate?.toISOString() ?? null,
    endDate: edition.endDate?.toISOString() ?? null,
  };
}

export interface KsefSubCategoryRow {
  id: string;
  name: string;
  isActive: boolean;
}

export interface KsefCategoryRow {
  id: string;
  division: KsefDivision;
  name: string;
  isActive: boolean;
  subCategories: KsefSubCategoryRow[];
  _count: { projects: number };
}

export interface KsefCriterionRow {
  id: string;
  division: KsefDivision | null;
  name: string;
  description: string | null;
  maxScore: number;
  isActive: boolean;
  _count: { scores: number };
}

export const EDITION_STATUS_BADGE: Record<KsefEditionStatus, "outline" | "success" | "secondary"> = {
  DRAFT: "outline",
  ACTIVE: "success",
  CLOSED: "secondary",
};
