import { KsefEditionBar } from "@/components/ksef/edition-bar";
import { toEditionSummary } from "@/components/ksef/types";
import { prisma } from "@/lib/prisma";
import { resolveSelectedEdition } from "@/lib/ksef";

// app/admin/layout.tsx already restricts /admin to the super admin.
export default async function KsefLayout({ children }: { children: React.ReactNode }) {
  const [editions, selected] = await Promise.all([
    prisma.ksefEdition.findMany({ orderBy: { year: "desc" } }),
    resolveSelectedEdition(),
  ]);

  return (
    <div className="space-y-6">
      <KsefEditionBar
        editions={editions.map(toEditionSummary)}
        selected={selected ? toEditionSummary(selected) : null}
      />
      {children}
    </div>
  );
}

