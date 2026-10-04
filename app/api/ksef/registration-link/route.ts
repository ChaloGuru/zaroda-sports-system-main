import { NextResponse } from "next/server";
import type { KsefEdition } from "@prisma/client";
import { withAudit } from "@/lib/audit";
import { toErrorResponse } from "@/lib/authorize";
import { getEditableEdition, getEditionOrThrow, requireKsefAdmin } from "@/lib/ksef";
import { isRegistrationOpen, newRegistrationLinkToken, registrationUrl } from "@/lib/ksef-registration";
import { ksefRegistrationLinkSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

function linkState(edition: KsefEdition) {
  return {
    url: edition.registrationToken ? registrationUrl(edition.registrationToken) : null,
    closesAt: edition.registrationClosesAt,
    isOpen: isRegistrationOpen(edition),
  };
}

/** ?editionId= -> the edition's school registration link and whether it's accepting registrations. */
export async function GET(request: Request) {
  try {
    await requireKsefAdmin();
    const editionId = new URL(request.url).searchParams.get("editionId");
    if (!editionId) return NextResponse.json({ error: "editionId is required" }, { status: 400 });
    return NextResponse.json(linkState(await getEditionOrThrow(editionId)));
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/** Opens, replaces or closes the edition's school registration link, or changes its deadline. */
export async function POST(request: Request) {
  try {
    const ctx = await requireKsefAdmin();
    const input = ksefRegistrationLinkSchema.parse(await request.json());
    const edition = await getEditableEdition(input.editionId);

    const data: { registrationToken?: string | null; registrationClosesAt?: Date | null } = {};
    if (input.action === "OPEN") data.registrationToken = edition.registrationToken ?? newRegistrationLinkToken();
    if (input.action === "ROTATE") data.registrationToken = newRegistrationLinkToken();
    if (input.action === "CLOSE") data.registrationToken = null;
    if (input.closesAt !== undefined && input.action !== "CLOSE") data.registrationClosesAt = input.closesAt;
    if (data.registrationClosesAt && data.registrationClosesAt <= new Date()) {
      throw new Error("The registration deadline must be in the future");
    }

    const updated = await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "ksef_editions",
      oldData: { registrationOpen: !!edition.registrationToken, registrationClosesAt: edition.registrationClosesAt },
      mutate: (tx) => tx.ksefEdition.update({ where: { id: edition.id }, data }),
      recordId: (result) => result.id,
      newData: { action: input.action, registrationClosesAt: data.registrationClosesAt },
    });
    return NextResponse.json(linkState(updated));
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
