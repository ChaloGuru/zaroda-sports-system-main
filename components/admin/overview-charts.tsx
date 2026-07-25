"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRevenueVisible } from "@/components/admin/revenue-visibility";

const COLORS = ["#D4A017", "#1A3A8F", "#8B949E", "#DA3633", "#2EA043", "#58A6FF"];

export interface MonthlyPoint {
  month: string;
  count: number;
}

export interface LevelCount {
  level: string;
  count: number;
}

export interface RevenuePoint {
  month: string;
  revenueKes: number;
}

export function OverviewCharts({
  signups,
  levelCounts,
  revenue,
}: {
  signups: MonthlyPoint[];
  levelCounts: LevelCount[];
  revenue: RevenuePoint[];
}) {
  const revenueVisible = useRevenueVisible();

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Tenant signups over time</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={signups}>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363D" />
              <XAxis dataKey="month" stroke="#8B949E" fontSize={12} />
              <YAxis stroke="#8B949E" fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#161B22", border: "1px solid #30363D" }} />
              <Line type="monotone" dataKey="count" stroke="#D4A017" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Championships by level</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={levelCounts} dataKey="count" nameKey="level" outerRadius={90} label>
                {levelCounts.map((entry, index) => (
                  <Cell key={entry.level} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "#161B22", border: "1px solid #30363D" }} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {revenueVisible && (
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue (KES) by month</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#30363D" />
                <XAxis dataKey="month" stroke="#8B949E" fontSize={12} />
                <YAxis stroke="#8B949E" fontSize={12} />
                <Tooltip contentStyle={{ background: "#161B22", border: "1px solid #30363D" }} />
                <Bar dataKey="revenueKes" fill="#1A3A8F" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
