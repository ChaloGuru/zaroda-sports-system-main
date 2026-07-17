"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { apiGet } from "@/lib/api-client";

// Matches the categorical order already used by components/admin/overview-charts.tsx.
const COLORS = ["#D4A017", "#1A3A8F", "#8B949E", "#DA3633", "#2EA043", "#58A6FF"];

interface AnalyticsData {
  totals: { games: number; participants: number; teams: number; qualified: number };
  games: {
    byCategory: Record<string, number>;
    byGender: Record<string, number>;
    withResultsCount: number;
    byStage: { stage: string; scored: number; pending: number; total: number }[];
  };
  participants: { byGender: Record<string, number>; byStatus: Record<string, number> };
  teams: { byGender: Record<string, number>; byCounty: Record<string, number> };
  revenue: { collectedKes: number; pendingKes: number; failedKes: number; byStatus: Record<string, number> };
}

function toChartData(record: Record<string, number>) {
  return Object.entries(record).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));
}

function formatKes(amount: number) {
  return `KES ${amount.toLocaleString()}`;
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted">{label}</p>
        <p className="text-2xl font-bold text-foreground tabular">{value}</p>
      </CardContent>
    </Card>
  );
}

function DistributionCard({
  title,
  data,
  emptyLabel,
}: {
  title: string;
  data: { name: string; value: number }[];
  emptyLabel: string;
}) {
  const hasData = data.some((d) => d.value > 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-64">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" outerRadius={80} label>
                {data.map((entry, index) => (
                  <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <p className="flex h-full items-center justify-center text-sm text-muted">{emptyLabel}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function AnalyticsPanel({ championshipId }: { championshipId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics", championshipId],
    queryFn: () => apiGet<AnalyticsData>(`/api/analytics?championshipId=${championshipId}`),
  });

  if (isLoading) return <p className="text-sm text-muted">Loading analytics...</p>;
  if (error || !data) {
    return <p className="text-sm text-destructive">Failed to load analytics.</p>;
  }

  const countyData = toChartData(data.teams.byCounty).sort((a, b) => b.value - a.value).slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Games" value={data.totals.games} />
        <StatTile label="Participants" value={data.totals.participants} />
        <StatTile label="Teams" value={data.totals.teams} />
        <StatTile label="Qualified" value={data.totals.qualified} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Matches &amp; races by stage</CardTitle>
          <CardDescription>Scored vs pending games/fixtures at each school level.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.games.byStage.length === 0 && <p className="text-sm text-muted">No games yet.</p>}
          {data.games.byStage.map((row) => (
            <div key={row.stage} className="flex items-center justify-between rounded-md border border-border p-3">
              <p className="text-sm font-medium text-foreground">{row.stage.replace(/_/g, " ")}</p>
              <div className="flex gap-4 text-sm tabular">
                <span className="text-[#2EA043]">{row.scored} scored</span>
                <span className="text-[#DA3633]">{row.pending} pending</span>
                <span className="text-muted">{row.total} total</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Revenue</CardTitle>
          <CardDescription>Team fee payments for this championship.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted">Collected</p>
            <p className="text-xl font-bold text-foreground tabular">{formatKes(data.revenue.collectedKes)}</p>
          </div>
          <div>
            <p className="text-sm text-muted">Pending</p>
            <p className="text-xl font-bold text-foreground tabular">{formatKes(data.revenue.pendingKes)}</p>
          </div>
          <div>
            <p className="text-sm text-muted">Failed</p>
            <p className="text-xl font-bold text-foreground tabular">{formatKes(data.revenue.failedKes)}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <DistributionCard title="Participants by gender" data={toChartData(data.participants.byGender)} emptyLabel="No participants yet." />
        <DistributionCard title="Participants by status" data={toChartData(data.participants.byStatus)} emptyLabel="No participants yet." />
        <DistributionCard title="Teams by gender" data={toChartData(data.teams.byGender)} emptyLabel="No teams yet." />
        <DistributionCard title="Payment status" data={toChartData(data.revenue.byStatus)} emptyLabel="No payments recorded yet." />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Teams by county</CardTitle>
          <CardDescription>Top 10 counties by registered team count.</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {countyData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={countyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(226 231 240)" />
                <XAxis dataKey="name" fontSize={12} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis fontSize={12} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#1A3A8F" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="flex h-full items-center justify-center text-sm text-muted">No teams yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
