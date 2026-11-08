import { notFound, redirect } from "next/navigation";
import { SchoolEntriesPanel } from "@/components/dashboard/school-entries-panel";
import { getAuthContext } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";

/** A school registering its learners for an Inter School championship it pushed to, and entering them in activities. */
export default async function SchoolChampionshipPage(props: { params: Promise<{ championshipId: string }> }) {
  const { championshipId } = await props.params;
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const link = await prisma.championshipSchool.findFirst({
    where: { championshipId, schoolAccount: { userId: ctx.userId } },
    select: { championship: { select: { name: true } }, school: { select: { name: true } } },
  });
  if (!link) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{link.championship.name}</h1>
        <p className="text-muted">Register {link.school.name}&apos;s learners, then enter them in races and ball-game teams.</p>
      </div>
      <SchoolEntriesPanel championshipId={championshipId} championshipName={link.championship.name} schoolName={link.school.name} manageTeams />
    </div>
  );
}
