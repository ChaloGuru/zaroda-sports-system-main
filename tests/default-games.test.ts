import { describe, it, expect } from "vitest";
import {
  PRIMARY_JS_ATHLETICS_TEMPLATE,
  PRIMARY_JS_BALL_GAMES_TEMPLATE,
  defaultGamesFor,
  type DefaultGameTemplate,
} from "@/lib/default-games";

const primary = PRIMARY_JS_ATHLETICS_TEMPLATE.filter((g) => g.schoolLevel === "PRIMARY");
const js = PRIMARY_JS_ATHLETICS_TEMPLATE.filter((g) => g.schoolLevel === "JS");
const find = (games: DefaultGameTemplate[], name: string) => games.find((g) => g.name === name);

describe("defaultGamesFor", () => {
  it("seeds the athletics roster for Primary/JS athletics championships", () => {
    expect(defaultGamesFor({ schoolLevel: "PRIMARY_JS", category: "ATHLETICS" })).toBe(PRIMARY_JS_ATHLETICS_TEMPLATE);
  });

  it("keeps seeding the ball-games roster for Primary/JS ball-games championships", () => {
    expect(defaultGamesFor({ schoolLevel: "PRIMARY_JS", category: "BALL_GAMES" })).toBe(PRIMARY_JS_BALL_GAMES_TEMPLATE);
  });

  it("seeds nothing for other levels or categories", () => {
    expect(defaultGamesFor({ schoolLevel: "SENIOR_SCHOOL", category: "ATHLETICS" })).toEqual([]);
    expect(defaultGamesFor({ schoolLevel: "PRIMARY_JS", category: "MUSIC" })).toEqual([]);
  });
});

describe("PRIMARY_JS_ATHLETICS_TEMPLATE (KPJSSA Term One 2026 circular)", () => {
  it("has unique names, so every event is distinguishable in pickers", () => {
    const names = PRIMARY_JS_ATHLETICS_TEMPLATE.map((g) => g.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("creates 35 Primary and 70 Junior School events", () => {
    expect(primary).toHaveLength(35);
    expect(js).toHaveLength(70);
  });

  it("splits B/G events into a Boys and a Girls game", () => {
    for (const event of ["100M", "3000M", "Long Jump", "Javelin", "4x400M Relay"]) {
      expect(find(primary, `${event} Boys (Primary)`)?.gender).toBe("BOYS");
      expect(find(primary, `${event} Girls (Primary)`)?.gender).toBe("GIRLS");
    }
    expect(find(js, "5000M Boys (JS)")).toBeDefined();
    expect(find(primary, "5000M Boys (Primary)")).toBeUndefined();
  });

  it("keeps single-gender and mixed events as listed", () => {
    expect(find(js, "100M Hurdles Girls (JS)")?.gender).toBe("GIRLS");
    expect(find(js, "100M Hurdles Boys (JS)")).toBeUndefined();
    expect(find(js, "110M Hurdles Boys (JS)")?.gender).toBe("BOYS");
    expect(find(js, "110M Hurdles Girls (JS)")).toBeUndefined();
    expect(find(primary, "4x400M Mixed Relay Mixed (Primary)")?.gender).toBe("MIXED");
    expect(find(js, "Cross Country U15 3500M Boys (JS)")).toBeDefined();
    expect(find(js, "Cross Country U15 2500M Girls (JS)")).toBeDefined();
    expect(find(primary, "Cross Country U12 1200M Girls (Primary)")).toBeDefined();
  });

  it("times track, swimming and cross country, and scores field events", () => {
    expect(find(primary, "800M Girls (Primary)")?.isTimed).toBe(true);
    expect(find(js, "Swimming 50M Butterfly Boys (JS)")?.isTimed).toBe(true);
    expect(find(js, "Cross Country U15 2500M Girls (JS)")?.isTimed).toBe(true);
    expect(find(js, "Discus Girls (JS)")?.isTimed).toBe(false);
    expect(find(primary, "High Jump Boys (Primary)")?.isTimed).toBe(false);
  });

  it("creates the duplicated 50M Freestyle swimming event only once per gender", () => {
    expect(js.filter((g) => g.name.startsWith("Swimming 50M Freestyle "))).toHaveLength(2);
    expect(js.filter((g) => g.name.startsWith("Swimming "))).toHaveLength(26);
  });

  it("runs Rugby 7s and Basketball 5x5 as ball-game fixtures with the right sport", () => {
    const fixtureGames = PRIMARY_JS_ATHLETICS_TEMPLATE.filter((g) => g.category === "BALL_GAMES");
    expect(fixtureGames.map((g) => g.name).sort()).toEqual([
      "Basketball 5x5 Boys (JS)",
      "Basketball 5x5 Girls (JS)",
      "Rugby 7s Boys (JS)",
      "Rugby 7s Girls (JS)",
    ]);
    expect(find(js, "Rugby 7s Girls (JS)")?.sport).toBe("RUGBY");
    expect(find(js, "Basketball 5x5 Boys (JS)")?.sport).toBe("BASKETBALL");
    // Everything else is an athletics event with no fixture sport.
    for (const g of PRIMARY_JS_ATHLETICS_TEMPLATE.filter((g) => g.category !== "BALL_GAMES")) {
      expect(g.category).toBe("ATHLETICS");
      expect(g.sport).toBeNull();
    }
  });
});
