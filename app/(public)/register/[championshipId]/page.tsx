import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { RegisterTeamForm } from "@/components/championship/register-team-form";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

export const revalidate = 30;

export default async function RegisterTeamPage({ params }: { params: { championshipId: string } }) {
  const championship = await prisma.championship.findUnique({
    where: { id: params.championshipId },
    include: {
      tenant: { select: { organizationName: true } },
      fees: { orderBy: { createdAt: "asc" } },
    },
  });

  // Registration only applies to published Open Tournament championships -
  // school-ladder events register teams through the tenant dashboard instead.
  if (!championship || !championship.isPublished || championship.level !== "OPEN_TOURNAMENT") notFound();

  return (
    <div className="container max-w-2xl py-16">
      <div className="rounded-xl border border-border bg-background p-6 shadow-sm sm:p-8">
        <Badge>{championship.category.replace("_", " ")}</Badge>
        <h1 className="mt-4 text-3xl font-bold text-foreground">Register for {championship.name}</h1>
        <p className="mt-1 text-muted">
          Organized by {championship.tenant.organizationName} - {formatDate(championship.startDate)} to{" "}
          {formatDate(championship.endDate)}
        </p>

        {championship.fees.length === 0 ? (
          <p className="mt-8 rounded-md border border-border bg-secondary/40 p-4 text-muted">
            Registration isn&apos;t open yet - the organizer hasn&apos;t set up an entry fee for this championship.
          </p>
        ) : (
          <RegisterTeamForm
            championshipId={championship.id}
            fees={championship.fees.map((f) => ({
              id: f.id,
              name: f.name,
              description: f.description,
              amountKes: f.amountKes,
              isRequired: f.isRequired,
            }))}
          />
        )}
      </div>
    </div>
  );
}
