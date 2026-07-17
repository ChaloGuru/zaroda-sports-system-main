"use client";

import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { GenderBadge } from "@/components/ui/gender-badge";
import { apiGet } from "@/lib/api-client";
import { formatKes, formatDate } from "@/lib/utils";

interface RegisteredTeam {
  id: string;
  name: string;
  teamCode: string | null;
  gender: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  game: { name: string } | null;
  feePayments: { id: string; amountKes: number; paidAt: string | null; fee: { name: string } }[];
}

export function RegisteredTeamsPanel({ championshipId }: { championshipId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["registered-teams", championshipId],
    queryFn: () => apiGet<{ teams: RegisteredTeam[] }>(`/api/registered-teams?championshipId=${championshipId}`),
  });

  if (isLoading) return <p className="text-sm text-muted">Loading registered teams...</p>;
  if (error || !data) return <p className="text-sm text-destructive">Failed to load registered teams.</p>;

  const teams = data.teams;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" /> Registered Teams
        </CardTitle>
        <CardDescription>Teams that have paid their registration fee for this championship.</CardDescription>
      </CardHeader>
      <CardContent>
        {teams.length === 0 ? (
          <p className="text-sm text-muted">No paid team registrations yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team</TableHead>
                <TableHead>Game</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Fee(s) Paid</TableHead>
                <TableHead>Paid On</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map((team) => (
                <TableRow key={team.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{team.name}</span>
                      <GenderBadge gender={team.gender} />
                    </div>
                  </TableCell>
                  <TableCell>{team.game?.name ?? "-"}</TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <p>{team.contactName ?? "-"}</p>
                      <p className="text-muted">{team.contactEmail ?? team.contactPhone ?? ""}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {team.feePayments.map((p) => (
                      <p key={p.id}>
                        {p.fee.name}: {formatKes(p.amountKes)}
                      </p>
                    ))}
                  </TableCell>
                  <TableCell>{team.feePayments[0]?.paidAt ? formatDate(team.feePayments[0].paidAt) : "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
