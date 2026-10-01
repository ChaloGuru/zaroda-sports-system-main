import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** Shown by KSEF pages that need an edition when none exists yet. */
export function NoKsefEdition() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
        <FlaskConical className="h-10 w-10 text-primary" />
        <div>
          <p className="text-lg font-bold text-foreground">No KSEF competition yet</p>
          <p className="text-muted">Create the first KSEF edition (competition year) to get started.</p>
        </div>
        <Button asChild>
          <Link href="/admin/ksef/competitions">Create New KSEF Edition</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function KsefPageHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">{title}</h1>
      <p className="text-muted">{description}</p>
    </div>
  );
}
