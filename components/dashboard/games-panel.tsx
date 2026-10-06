"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GenderBadge } from "@/components/ui/gender-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { gameCreateSchema, type GameCreateInput } from "@/lib/validations";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api-client";
import { GAME_SCHOOL_LEVELS, gameSchoolLevelLabel } from "@/lib/school-levels";

interface GameRow {
  id: string;
  name: string;
  category: string;
  gender: string;
  schoolLevel: string;
  isTimed: boolean;
  sport: string | null;
  maxQualifiers: number;
  isActive: boolean;
  _count: { participants: number; tournamentTeams: number; heats: number; matchPools: number };
}

const GENDERS = ["BOYS", "GIRLS", "MIXED"];
const CATEGORIES = ["BALL_GAMES", "ATHLETICS", "MUSIC", "OTHER_GAMES"];
// "Indoor games" (chess, table tennis, badminton) are run at higher
// competition levels and use the same fixtures/standings pipeline as ball
// games, just filed under the OTHER_GAMES category instead.
const BALL_SPORTS = ["FOOTBALL", "BASKETBALL", "VOLLEYBALL", "HANDBALL", "RUGBY", "NETBALL"];
const INDOOR_SPORTS = ["CHESS", "TABLE_TENNIS", "BADMINTON"];

function sportLabel(sport: string): string {
  return sport
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

const CATEGORY_LABELS: Record<string, string> = {
  ATHLETICS: "Athletics",
  BALL_GAMES: "Ball Games",
  MUSIC: "Music",
  OTHER_GAMES: "Other Games",
};
const LEVEL_ORDER = ["PRIMARY", "JS", "PRIMARY_JS", "SENIOR_SCHOOL", "TERTIARY"];

/** Groups games by school level, then category, so long event lists stay scannable. */
function groupGames(games: GameRow[]): { key: string; label: string; games: GameRow[] }[] {
  const groups = new Map<string, { key: string; label: string; games: GameRow[] }>();
  for (const game of games) {
    const key = `${game.schoolLevel}|${game.category}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: `${gameSchoolLevelLabel(game.schoolLevel)} - ${CATEGORY_LABELS[game.category] ?? game.category}`,
        games: [],
      });
    }
    groups.get(key)!.games.push(game);
  }
  const rank = (key: string) => {
    const [level, category] = key.split("|");
    return LEVEL_ORDER.indexOf(level ?? "") * 10 + Object.keys(CATEGORY_LABELS).indexOf(category ?? "");
  };
  return Array.from(groups.values()).sort((a, b) => rank(a.key) - rank(b.key));
}

// A championship's schoolLevel is a single pricing tier (Primary/JS bundled,
// Senior School, or Tertiary). Only a PRIMARY_JS championship needs a
// per-game choice - Senior School and Tertiary championships have exactly
// one valid game-level value each, so the field is hidden and auto-set.
const PRIMARY_JS_GAME_LEVELS = GAME_SCHOOL_LEVELS.filter((l) => l.value === "PRIMARY" || l.value === "JS");

function defaultSportForCategory(category: string): GameCreateInput["sport"] {
  if (category === "BALL_GAMES") return "FOOTBALL";
  if (category === "OTHER_GAMES") return "CHESS";
  return null;
}

function emptyDefaults(
  category: string,
  championshipId: string,
  needsLevelChoice: boolean,
  championshipSchoolLevel: string,
  defaultLevel: string,
): GameCreateInput {
  return {
    championshipId,
    name: "",
    category: category as GameCreateInput["category"],
    gender: "BOYS",
    schoolLevel: needsLevelChoice ? (defaultLevel as GameCreateInput["schoolLevel"]) : (championshipSchoolLevel as GameCreateInput["schoolLevel"]),
    isTimed: category === "ATHLETICS",
    sport: defaultSportForCategory(category),
    maxQualifiers: 5,
  };
}

export function GamesPanel({
  championshipId,
  category,
  championshipSchoolLevel,
  isOpenTournament,
}: {
  championshipId: string;
  category: string;
  championshipSchoolLevel: string;
  isOpenTournament?: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  // An open tournament isn't bound to one fixed school level the way a
  // school-ladder championship is (its Championship.schoolLevel is just a
  // neutral placeholder, not a real level) - it can mix Primary, JS, Senior
  // School, and Tertiary category games under one roof, so the choice needs
  // to stay open per-game rather than being hidden and auto-set.
  const needsLevelChoice = championshipSchoolLevel === "PRIMARY_JS" || !!isOpenTournament;
  const levelOptions = isOpenTournament ? GAME_SCHOOL_LEVELS : PRIMARY_JS_GAME_LEVELS;

  const { data, isLoading } = useQuery({
    // Includes deactivated games (unlike every other panel), so they can be
    // switched back on. The ["games", championshipId] prefix still matches
    // for invalidation.
    queryKey: ["games", championshipId, "all"],
    queryFn: () => apiGet<{ games: GameRow[] }>(`/api/games?championshipId=${championshipId}&includeInactive=true`),
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<GameCreateInput>({
    resolver: zodResolver(gameCreateSchema),
    defaultValues: emptyDefaults(category, championshipId, needsLevelChoice, championshipSchoolLevel, levelOptions[0]?.value ?? "PRIMARY"),
  });
  const watchedCategory = watch("category");
  const showsSportPicker = watchedCategory === "BALL_GAMES" || watchedCategory === "OTHER_GAMES";
  const sportOptions = watchedCategory === "OTHER_GAMES" ? INDOOR_SPORTS : BALL_SPORTS;

  function openCreate() {
    setEditingId(null);
    reset(emptyDefaults(category, championshipId, needsLevelChoice, championshipSchoolLevel, levelOptions[0]?.value ?? "PRIMARY"));
    setOpen(true);
  }

  function openEdit(game: GameRow) {
    setEditingId(game.id);
    reset({
      championshipId,
      name: game.name,
      category: game.category as GameCreateInput["category"],
      gender: game.gender as GameCreateInput["gender"],
      schoolLevel: game.schoolLevel as GameCreateInput["schoolLevel"],
      isTimed: game.isTimed,
      sport: (game.sport as GameCreateInput["sport"]) ?? null,
      maxQualifiers: game.maxQualifiers,
    });
    setOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: (values: GameCreateInput) =>
      editingId ? apiPatch(`/api/games/${editingId}`, values) : apiPost("/api/games", values),
    onSuccess: () => {
      toast.success(editingId ? "Game updated" : "Game added");
      queryClient.invalidateQueries({ queryKey: ["games", championshipId] });
      setOpen(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to save game"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/games/${id}`),
    onSuccess: (_data, id) => {
      toast.success("Game deleted");
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["games", championshipId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to delete game"),
  });

  function confirmDelete(game: GameRow) {
    if (window.confirm(`Delete "${game.name}"? This also removes its participants, heats, and fixtures.`)) {
      deleteMutation.mutate(game.id);
    }
  }

  const toggleActiveMutation = useMutation({
    mutationFn: (game: GameRow) => apiPatch(`/api/games/${game.id}`, { isActive: !game.isActive }),
    onSuccess: (_data, game) => {
      toast.success(game.isActive ? `"${game.name}" deactivated` : `"${game.name}" activated`);
      queryClient.invalidateQueries({ queryKey: ["games", championshipId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to update game"),
  });

  // ── Bulk selection (mainly for trimming the auto-created standard events) ──
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const games = data?.games ?? [];
  const groups = groupGames(games);

  function toggleSelected(ids: string[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  const bulkMutation = useMutation({
    mutationFn: (action: "activate" | "deactivate" | "delete") =>
      apiPost<{ affected: number }>("/api/games/bulk", { championshipId, gameIds: Array.from(selected), action }),
    onSuccess: (result, action) => {
      const verb = action === "delete" ? "deleted" : action === "activate" ? "activated" : "deactivated";
      toast.success(`${result.affected} game${result.affected === 1 ? "" : "s"} ${verb}`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["games", championshipId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Bulk update failed"),
  });

  function confirmBulkDelete() {
    if (
      window.confirm(
        `Delete ${selected.size} selected game${selected.size === 1 ? "" : "s"}? This also removes their participants, heats, and fixtures. Deactivating instead keeps them for later.`,
      )
    ) {
      bulkMutation.mutate("delete");
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Games</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add game
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit game" : "Add a game"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
              <div>
                <Label htmlFor="game-name">Name</Label>
                <Input id="game-name" className="mt-1.5" {...register("name")} />
                {errors.name && <p className="mt-1 text-sm text-red-400">{errors.name.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Gender</Label>
                  <Select value={watch("gender")} onValueChange={(v) => setValue("gender", v as GameCreateInput["gender"])}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {GENDERS.map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {needsLevelChoice && (
                  <div>
                    <Label>School level</Label>
                    <Select value={watch("schoolLevel")} onValueChange={(v) => setValue("schoolLevel", v as GameCreateInput["schoolLevel"])}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {levelOptions.map((l) => (
                          <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Category</Label>
                  <Select
                    value={watch("category")}
                    onValueChange={(v) => {
                      const nextCategory = v as GameCreateInput["category"];
                      setValue("category", nextCategory);
                      setValue("isTimed", nextCategory === "ATHLETICS");
                      setValue("sport", defaultSportForCategory(nextCategory));
                    }}
                  >
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {showsSportPicker ? (
                  <div>
                    <Label>Sport</Label>
                    <Select
                      value={watch("sport") ?? sportOptions[0]}
                      onValueChange={(v) => setValue("sport", v as GameCreateInput["sport"])}
                    >
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {sportOptions.map((s) => (
                          <SelectItem key={s} value={s}>{sportLabel(s)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="maxQualifiers">Max qualifiers</Label>
                    <Input
                      id="maxQualifiers"
                      type="number"
                      className="mt-1.5"
                      {...register("maxQualifiers", { valueAsNumber: true })}
                    />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" {...register("isTimed")} /> Timed event (athletics track)
                </label>
              </div>
              <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : editingId ? "Save changes" : "Add game"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p className="text-muted">Loading games...</p>}
        {!isLoading && games.length === 0 && <p className="text-muted">No games yet. Add your first game.</p>}
        {games.length > 0 && (
          <p className="text-sm text-muted">
            Deactivate events your championship isn&apos;t running - they&apos;re hidden from the public site and entry
            screens but kept here so you can switch them back on. Delete removes them for good.
          </p>
        )}

        {selected.size > 0 && (
          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-3 shadow-sm">
            <span className="mr-auto text-sm font-medium text-foreground">
              {selected.size} selected
            </span>
            <Button size="sm" variant="outline" disabled={bulkMutation.isPending} onClick={() => bulkMutation.mutate("activate")}>
              <Power className="h-4 w-4" /> Activate
            </Button>
            <Button size="sm" variant="outline" disabled={bulkMutation.isPending} onClick={() => bulkMutation.mutate("deactivate")}>
              <PowerOff className="h-4 w-4" /> Deactivate
            </Button>
            <Button size="sm" variant="outline" disabled={bulkMutation.isPending} onClick={confirmBulkDelete}>
              <Trash2 className="h-4 w-4 text-destructive" /> Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        )}

        {groups.map((group) => {
          const ids = group.games.map((g) => g.id);
          const allSelected = ids.every((id) => selected.has(id));
          const activeCount = group.games.filter((g) => g.isActive).length;
          return (
            <section key={group.key} className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => toggleSelected(ids, e.target.checked)}
                  aria-label={`Select all ${group.label} games`}
                />
                {group.label}
                <span className="font-normal text-muted">
                  ({activeCount} of {group.games.length} active)
                </span>
              </label>
              {group.games.map((game) => (
                <div
                  key={game.id}
                  className={`flex items-center justify-between gap-3 rounded-md border border-border p-3 ${game.isActive ? "" : "opacity-60"}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(game.id)}
                      onChange={(e) => toggleSelected([game.id], e.target.checked)}
                      aria-label={`Select ${game.name}`}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">{game.name}</p>
                        <GenderBadge gender={game.gender} />
                        {!game.isActive && <Badge variant="outline">Inactive</Badge>}
                      </div>
                      <p className="text-sm text-muted">
                        {gameSchoolLevelLabel(game.schoolLevel)}
                        {game.sport ? ` - ${sportLabel(game.sport)}` : ""} -{" "}
                        {game.sport
                          ? `${game._count.tournamentTeams} team${game._count.tournamentTeams === 1 ? "" : "s"}`
                          : `${game._count.participants} participant${game._count.participants === 1 ? "" : "s"}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge variant={game.isTimed ? "secondary" : "outline"}>{game.isTimed ? "Timed" : "Scored"}</Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      title={game.isActive ? "Deactivate" : "Activate"}
                      aria-label={game.isActive ? `Deactivate ${game.name}` : `Activate ${game.name}`}
                      disabled={toggleActiveMutation.isPending}
                      onClick={() => toggleActiveMutation.mutate(game)}
                    >
                      {game.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4 text-primary" />}
                    </Button>
                    <Button size="icon" variant="ghost" title="Edit" aria-label={`Edit ${game.name}`} onClick={() => openEdit(game)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" title="Delete" aria-label={`Delete ${game.name}`} onClick={() => confirmDelete(game)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
