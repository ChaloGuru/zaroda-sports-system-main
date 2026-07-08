"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
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

function emptyDefaults(category: string, championshipId: string, needsLevelChoice: boolean, championshipSchoolLevel: string): GameCreateInput {
  return {
    championshipId,
    name: "",
    category: category as GameCreateInput["category"],
    gender: "BOYS",
    schoolLevel: needsLevelChoice ? "PRIMARY" : (championshipSchoolLevel as GameCreateInput["schoolLevel"]),
    isTimed: category === "ATHLETICS",
    sport: defaultSportForCategory(category),
    maxQualifiers: 5,
  };
}

export function GamesPanel({
  championshipId,
  category,
  championshipSchoolLevel,
}: {
  championshipId: string;
  category: string;
  championshipSchoolLevel: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const needsLevelChoice = championshipSchoolLevel === "PRIMARY_JS";

  const { data, isLoading } = useQuery({
    queryKey: ["games", championshipId],
    queryFn: () => apiGet<{ games: GameRow[] }>(`/api/games?championshipId=${championshipId}`),
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
    defaultValues: emptyDefaults(category, championshipId, needsLevelChoice, championshipSchoolLevel),
  });
  const watchedCategory = watch("category");
  const showsSportPicker = watchedCategory === "BALL_GAMES" || watchedCategory === "OTHER_GAMES";
  const sportOptions = watchedCategory === "OTHER_GAMES" ? INDOOR_SPORTS : BALL_SPORTS;

  function openCreate() {
    setEditingId(null);
    reset(emptyDefaults(category, championshipId, needsLevelChoice, championshipSchoolLevel));
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
    onSuccess: () => {
      toast.success("Game deleted");
      queryClient.invalidateQueries({ queryKey: ["games", championshipId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to delete game"),
  });

  function confirmDelete(game: GameRow) {
    if (window.confirm(`Delete "${game.name}"? This also removes its participants, heats, and fixtures.`)) {
      deleteMutation.mutate(game.id);
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
                        {PRIMARY_JS_GAME_LEVELS.map((l) => (
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
      <CardContent className="space-y-2">
        {isLoading && <p className="text-muted">Loading games...</p>}
        {!isLoading && (data?.games ?? []).length === 0 && <p className="text-muted">No games yet. Add your first game.</p>}
        {(data?.games ?? []).map((game) => (
          <div key={game.id} className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium text-foreground">{game.name}</p>
                <GenderBadge gender={game.gender} />
              </div>
              <p className="text-sm text-muted">
                {gameSchoolLevelLabel(game.schoolLevel)}
                {game.sport ? ` - ${sportLabel(game.sport)}` : ""} -{" "}
                {game.isTimed
                  ? `${game._count.participants} participant${game._count.participants === 1 ? "" : "s"}`
                  : `${game._count.tournamentTeams} team${game._count.tournamentTeams === 1 ? "" : "s"}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={game.isTimed ? "secondary" : "outline"}>{game.isTimed ? "Timed" : "Scored"}</Badge>
              <Button size="icon" variant="ghost" onClick={() => openEdit(game)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => confirmDelete(game)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
