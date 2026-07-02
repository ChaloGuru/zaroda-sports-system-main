"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { gameCreateSchema, type GameCreateInput } from "@/lib/validations";
import { apiGet, apiPost } from "@/lib/api-client";
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
  _count: { participants: number; heats: number; matchPools: number };
}

const GENDERS = ["BOYS", "GIRLS", "MIXED"];
const CATEGORIES = ["BALL_GAMES", "ATHLETICS", "MUSIC", "OTHER_GAMES"];
const BALL_SPORTS = ["FOOTBALL", "BASKETBALL", "VOLLEYBALL", "HANDBALL", "RUGBY", "NETBALL"];

// A championship's schoolLevel is a single pricing tier (Primary/JS bundled,
// Senior School, or Tertiary). Only a PRIMARY_JS championship needs a
// per-game choice - Senior School and Tertiary championships have exactly
// one valid game-level value each, so the field is hidden and auto-set.
const PRIMARY_JS_GAME_LEVELS = GAME_SCHOOL_LEVELS.filter((l) => l.value === "PRIMARY" || l.value === "JS");

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
    defaultValues: {
      championshipId,
      category: category as GameCreateInput["category"],
      gender: "BOYS",
      schoolLevel: needsLevelChoice ? "PRIMARY" : (championshipSchoolLevel as GameCreateInput["schoolLevel"]),
      isTimed: category === "ATHLETICS",
      sport: category === "BALL_GAMES" ? "FOOTBALL" : null,
      maxQualifiers: 5,
    },
  });
  const isBallGames = watch("category") === "BALL_GAMES";

  const createMutation = useMutation({
    mutationFn: (values: GameCreateInput) => apiPost("/api/games", values),
    onSuccess: () => {
      toast.success("Game added");
      queryClient.invalidateQueries({ queryKey: ["games", championshipId] });
      setOpen(false);
      reset();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to add game"),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Games</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4" /> Add game
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a game</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
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
                      setValue("sport", nextCategory === "BALL_GAMES" ? "FOOTBALL" : null);
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
                {isBallGames ? (
                  <div>
                    <Label>Sport</Label>
                    <Select value={watch("sport") ?? "FOOTBALL"} onValueChange={(v) => setValue("sport", v as GameCreateInput["sport"])}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {BALL_SPORTS.map((s) => (
                          <SelectItem key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</SelectItem>
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
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Adding..." : "Add game"}
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
              <p className="font-medium text-foreground">{game.name}</p>
              <p className="text-sm text-muted">
                {game.gender} - {gameSchoolLevelLabel(game.schoolLevel)}
                {game.sport ? ` - ${game.sport.charAt(0) + game.sport.slice(1).toLowerCase()}` : ""} -{" "}
                {game._count.participants} participants
              </p>
            </div>
            <Badge variant={game.isTimed ? "secondary" : "outline"}>{game.isTimed ? "Timed" : "Scored"}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
