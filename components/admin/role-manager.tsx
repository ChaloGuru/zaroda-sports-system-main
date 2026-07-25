"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiPost } from "@/lib/api-client";

interface ChampionshipOption {
  id: string;
  name: string;
  level: string;
  category: string;
  tenant: { organizationName: string };
}

interface TeamOption {
  id: string;
  name: string;
}

interface RoleRow {
  id: string;
  role: string;
  organizationName: string | null;
  gameCategory: string | null;
  ballSport: string | null;
  athleticsType: string | null;
  user: { id: string; name: string; email: string };
}

// Roles every championship can use, regardless of category.
const UNIVERSAL_ROLES = [
  { value: "TOURNAMENT_ADMIN", label: "Tournament Admin" },
  { value: "SCOREKEEPER", label: "Scorekeeper" },
  { value: "OFFICIAL", label: "Official" },
  { value: "TEAM_MANAGER", label: "Team Manager (single organization only)" },
];

// Only meaningful for a Ball Games championship - a Chief Track Judge etc.
// makes no sense where there are no athletics events, and vice versa.
const BALL_GAMES_ROLES = [{ value: "GAME_COORDINATOR", label: "Game Coordinator (e.g. Football Coordinator)" }];

const ATHLETICS_ROLES = [
  { value: "CHIEF_CALLROOM_MANAGER", label: "Chief Callroom Manager (Athletics)" },
  { value: "CHIEF_TRACK_JUDGE", label: "Chief Track Judge (Athletics)" },
  { value: "CHIEF_FIELD_JUDGE", label: "Chief Field Judge (Athletics)" },
  { value: "CHIEF_RECORDER", label: "Chief Recorder (Athletics)" },
];

// Roles that TOURNAMENT_ADMIN/TEAM_MANAGER don't need scoping for - the
// former is meant to oversee the whole championship, the latter is already
// scoped by organizationName.
const SCOPABLE_ROLES = new Set([
  "SCOREKEEPER",
  "OFFICIAL",
  "GAME_COORDINATOR",
  "CHIEF_CALLROOM_MANAGER",
  "CHIEF_TRACK_JUDGE",
  "CHIEF_FIELD_JUDGE",
  "CHIEF_RECORDER",
]);

const GAME_CATEGORIES = [
  { value: "BALL_GAMES", label: "Ball Games" },
  { value: "ATHLETICS", label: "Athletics" },
  { value: "MUSIC", label: "Music" },
  { value: "OTHER_GAMES", label: "Other Games" },
];

const BALL_SPORTS = [
  { value: "FOOTBALL", label: "Football" },
  { value: "BASKETBALL", label: "Basketball" },
  { value: "VOLLEYBALL", label: "Volleyball" },
  { value: "HANDBALL", label: "Handball" },
  { value: "RUGBY", label: "Rugby" },
  { value: "NETBALL", label: "Netball" },
  { value: "CHESS", label: "Chess" },
  { value: "TABLE_TENNIS", label: "Table Tennis" },
  { value: "BADMINTON", label: "Badminton" },
];

const ATHLETICS_TYPES = [
  { value: "TRACK", label: "Track" },
  { value: "FIELD", label: "Field" },
];

function scopeLabel(r: RoleRow): string | null {
  if (r.gameCategory === "BALL_GAMES") {
    const sport = BALL_SPORTS.find((s) => s.value === r.ballSport);
    return sport ? sport.label : "Ball Games (any sport)";
  }
  if (r.gameCategory === "ATHLETICS") {
    const type = ATHLETICS_TYPES.find((t) => t.value === r.athleticsType);
    return type ? type.label : "Athletics (track & field)";
  }
  if (r.gameCategory) {
    return GAME_CATEGORIES.find((c) => c.value === r.gameCategory)?.label ?? r.gameCategory;
  }
  return null;
}

export function RoleManager() {
  const queryClient = useQueryClient();
  const [championshipId, setChampionshipId] = React.useState<string>("");
  const [form, setForm] = React.useState({
    email: "",
    name: "",
    password: "",
    role: "TOURNAMENT_ADMIN",
    organizationName: "",
    gameCategory: "",
    ballSport: "",
    athleticsType: "",
  });

  const { data: championshipsData } = useQuery({
    queryKey: ["admin-championships-picker"],
    // mine=true - only championships this caller actually owns/administers,
    // not every published championship platform-wide (this picker assigns
    // roles, it isn't the public discovery list).
    queryFn: () => apiGet<{ championships: ChampionshipOption[] }>("/api/championships?mine=true"),
  });

  const { data: rolesData, isLoading: rolesLoading } = useQuery({
    queryKey: ["championship-roles", championshipId],
    queryFn: () => apiGet<{ roles: RoleRow[] }>(`/api/admin/roles?championshipId=${championshipId}`),
    enabled: !!championshipId,
  });

  const assignMutation = useMutation({
    mutationFn: () =>
      apiPost("/api/admin/roles", {
        championshipId,
        role: form.role,
        email: form.email,
        name: form.name || undefined,
        password: form.password || undefined,
        organizationName: form.role === "TEAM_MANAGER" ? form.organizationName : undefined,
        gameCategory: SCOPABLE_ROLES.has(form.role) && form.gameCategory ? form.gameCategory : undefined,
        ballSport: SCOPABLE_ROLES.has(form.role) && form.gameCategory === "BALL_GAMES" && form.ballSport ? form.ballSport : undefined,
        athleticsType:
          SCOPABLE_ROLES.has(form.role) && form.gameCategory === "ATHLETICS" && form.athleticsType ? form.athleticsType : undefined,
      }),
    onSuccess: () => {
      copyChampionshipLink();
      setForm({
        email: "",
        name: "",
        password: "",
        role: "TOURNAMENT_ADMIN",
        organizationName: "",
        gameCategory: "",
        ballSport: "",
        athleticsType: "",
      });
      queryClient.invalidateQueries({ queryKey: ["championship-roles", championshipId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to assign role"),
  });

  const championships = championshipsData?.championships ?? [];
  const selectedChampionship = championships.find((c) => c.id === championshipId);
  // A championship only ever runs games in its own category (schema enforces
  // this at creation) - scoping a role to a category that isn't this
  // championship's would silently match nothing, so only offer its actual
  // category instead of all four.
  const availableGameCategories = GAME_CATEGORIES.filter((c) => !selectedChampionship || c.value === selectedChampionship.category);
  const availableRoles = [
    ...UNIVERSAL_ROLES,
    ...(!selectedChampionship || selectedChampionship.category === "BALL_GAMES" ? BALL_GAMES_ROLES : []),
    ...(!selectedChampionship || selectedChampionship.category === "ATHLETICS" ? ATHLETICS_ROLES : []),
  ];

  const { data: teamsData } = useQuery({
    queryKey: ["championship-teams-picker", championshipId],
    queryFn: () => apiGet<{ teams: TeamOption[] }>(`/api/tournament-teams?championshipId=${championshipId}`),
    enabled: !!championshipId && form.role === "TEAM_MANAGER",
  });
  const teams = teamsData?.teams ?? [];
  const [organizationNameMode, setOrganizationNameMode] = React.useState<"select" | "manual">("select");

  React.useEffect(() => {
    setForm((f) => ({ ...f, gameCategory: "", ballSport: "", athleticsType: "", organizationName: "" }));
    setOrganizationNameMode("select");
  }, [championshipId]);

  React.useEffect(() => {
    if (!availableRoles.some((r) => r.value === form.role)) {
      setForm((f) => ({ ...f, role: "TOURNAMENT_ADMIN" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChampionship?.category]);

  function copyChampionshipLink() {
    const url = `${window.location.origin}/dashboard/championships/${championshipId}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied - send it to the person you just assigned");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Assign a championship-level role</CardTitle>
          <CardDescription>
            Create level admins, scorekeepers, officials, ball-game coordinators, or athletics chief
            officials (callroom, track, field, recorder), all scoped to a single championship.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Championship</Label>
            <Select value={championshipId} onValueChange={setChampionshipId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a championship" />
              </SelectTrigger>
              <SelectContent>
                {championships.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.tenant.organizationName})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="official@example.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Name (new accounts only)</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Password (new accounts only)</Label>
              <PasswordInput
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(role) => setForm({ ...form, role })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {SCOPABLE_ROLES.has(form.role) && (
            <div className="space-y-2">
              <Label>Scope to sport/discipline (optional)</Label>
              <Select
                value={form.gameCategory || "ANY"}
                onValueChange={(gameCategory) =>
                  setForm({ ...form, gameCategory: gameCategory === "ANY" ? "" : gameCategory, ballSport: "", athleticsType: "" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ANY">Any (whole championship)</SelectItem>
                  {availableGameCategories.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {form.gameCategory === "BALL_GAMES" && (
                <Select
                  value={form.ballSport || "ANY"}
                  onValueChange={(ballSport) => setForm({ ...form, ballSport: ballSport === "ANY" ? "" : ballSport })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any ball sport" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ANY">Any ball sport</SelectItem>
                    {BALL_SPORTS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {form.gameCategory === "ATHLETICS" && (
                <Select
                  value={form.athleticsType || "ANY"}
                  onValueChange={(athleticsType) => setForm({ ...form, athleticsType: athleticsType === "ANY" ? "" : athleticsType })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Track & field" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ANY">Track &amp; field</SelectItem>
                    {ATHLETICS_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted">
                Leave as &quot;Any&quot; for championship-wide access. Scoping restricts this person to only enter results
                for the chosen sport/discipline.
              </p>
            </div>
          )}

          {form.role === "TEAM_MANAGER" && (
            <div className="space-y-2">
              <Label>Organization / team name</Label>
              {organizationNameMode === "select" ? (
                <>
                  <Select
                    value={form.organizationName}
                    onValueChange={(v) => setForm({ ...form, organizationName: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={teams.length === 0 ? "No teams registered yet" : "Select a registered team"} />
                    </SelectTrigger>
                    <SelectContent>
                      {teams.map((t) => (
                        <SelectItem key={t.id} value={t.name}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    className="text-xs text-primary underline"
                    onClick={() => {
                      setOrganizationNameMode("manual");
                      setForm({ ...form, organizationName: "" });
                    }}
                  >
                    Team not registered yet - type the name manually
                  </button>
                </>
              ) : (
                <>
                  <Input
                    value={form.organizationName}
                    onChange={(e) => setForm({ ...form, organizationName: e.target.value })}
                    placeholder="Must match the team's registered name exactly"
                  />
                  <button
                    type="button"
                    className="text-xs text-primary underline"
                    onClick={() => {
                      setOrganizationNameMode("select");
                      setForm({ ...form, organizationName: "" });
                    }}
                  >
                    Choose from registered teams instead
                  </button>
                </>
              )}
              <p className="text-xs text-muted">
                Scopes this manager to only add/edit/delete their own organization's team rows - never anyone else's.
              </p>
            </div>
          )}

          <Button
            onClick={() => assignMutation.mutate()}
            disabled={
              !championshipId ||
              !form.email ||
              (form.role === "TEAM_MANAGER" && !form.organizationName.trim()) ||
              assignMutation.isPending
            }
          >
            {assignMutation.isPending ? "Assigning..." : "Assign Role"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Current assignments</CardTitle>
            <CardDescription>Roles scoped to the selected championship.</CardDescription>
          </div>
          {championshipId && (
            <Button variant="outline" size="sm" onClick={copyChampionshipLink}>
              <Link2 className="h-4 w-4" /> Copy championship link
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {!championshipId && <p className="text-sm text-muted">Select a championship to view its team.</p>}
          {championshipId && rolesLoading && <p className="text-sm text-muted">Loading...</p>}
          {championshipId &&
            (rolesData?.roles ?? []).map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border border-border p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{r.user.name}</p>
                  <p className="text-xs text-muted">
                    {r.user.email}
                    {r.organizationName ? ` - ${r.organizationName}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{r.role.replace("_", " ")}</Badge>
                  {scopeLabel(r) && <Badge variant="outline">{scopeLabel(r)}</Badge>}
                </div>
              </div>
            ))}
          {championshipId && (rolesData?.roles ?? []).length === 0 && !rolesLoading && (
            <p className="text-sm text-muted">No officials assigned yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
