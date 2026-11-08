import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { toErrorResponse } from "@/lib/authorize";
import { isTournamentAdmin, requireLearnerEditor } from "@/lib/learners";
import { descriptorToBytes, findSameFaceInChampionship, sameFaceMessage } from "@/lib/identity-checks";

export const dynamic = "force-dynamic";

const optionalText = z.string().trim().max(100).nullable().optional().transform((v) => v || null);

const faceCheckSchema = z.object({
  championshipId: z.string().uuid(),
  schoolId: z.string().max(64).nullable().optional().transform((v) => v || null),
  faceDescriptor: z.array(z.number()),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  gender: z.string().max(10),
  dateOfBirth: z.string().nullable().optional(),
  birthCertNumber: optionalText,
  knecAssessmentNumber: optionalText,
  kemisUpi: optionalText,
});

/**
 * Asked before a learner is registered: does this face already belong to a
 * learner in the championship under other details? The photo upload refuses
 * that too (the real rule) - asking first means a refused photo never leaves
 * a learner registered without one. Answers with the matching bib only.
 */
export async function POST(request: Request) {
  try {
    const input = faceCheckSchema.parse(await request.json());
    await requireLearnerEditor({ championshipId: input.championshipId, schoolId: input.schoolId });
    const descriptor = descriptorToBytes(input.faceDescriptor);
    if (!descriptor) return NextResponse.json({ error: "That isn't a face descriptor" }, { status: 400 });

    const dateOfBirth = input.dateOfBirth ? new Date(input.dateOfBirth) : null;
    const match = await findSameFaceInChampionship(prisma, input.championshipId, descriptor, {
      firstName: input.firstName,
      lastName: input.lastName,
      gender: input.gender,
      dateOfBirth: dateOfBirth && !Number.isNaN(dateOfBirth.getTime()) ? dateOfBirth : null,
      birthCertNumber: input.birthCertNumber,
      knecAssessmentNumber: input.knecAssessmentNumber,
      kemisUpi: input.kemisUpi,
    });
    if (!match) return NextResponse.json({ match: null });
    const allowed = await isTournamentAdmin(input.championshipId);
    return NextResponse.json({ match: { bibNumber: match.bibNumber }, allowed, error: allowed ? null : sameFaceMessage(match.bibNumber) });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
