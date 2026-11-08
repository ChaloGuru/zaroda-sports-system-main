// Mock accounts across the competition ladder, for testing on a live database.
//
//   npx tsx prisma/mock-seed.ts          create the mock data
//   npx tsx prisma/mock-seed.ts --clean  remove everything it created
//
// Everything is marked so it can't be mistaken for real data: names start with
// "Mock" and every account's email ends in @mock.zaroda.test, which is also how
// --clean finds it. All accounts share one password: MOCK_PASSWORD if set,
// otherwise a generated one printed at the end.
//
// The geography is one consistent chain (see lib/jurisdiction.ts), so schools
// signing up in these areas meet the same bases and zones:
//
//   Nyanza region
//   ├─ Migori county
//   │  ├─ Uriri sub-county
//   │  │  ├─ Uriri Zone:  Uriri Base, Kanyawanga Base
//   │  │  └─ Oyani Zone:  Oyani Base
//   │  └─ Rongo sub-county
//   │     └─ Rongo Zone:  Kamagambo Base
//   └─ Kisumu county
//      └─ Kisumu Central sub-county
//         └─ Kondele Zone: Kondele Base

import { PrismaClient, Level, PackageTier, Role } from "@prisma/client";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { regionOfCounty } from "../lib/kenya-counties";
import { defaultGamesFor } from "../lib/default-games";
import { withLevelInName } from "../lib/utils";

const prisma = new PrismaClient();
const DOMAIN = "@mock.zaroda.test";
const mail = (local: string) => `${local}${DOMAIN}`;

interface MockSchool {
  name: string;
  knecCode: string;
  county: string;
  subcounty: string;
  zone: string;
  baseName: string;
  /** Pushed to its base's Inter School championship; false leaves the push to test by hand. */
  pushed: boolean;
  /** The highest level it has been promoted to (it appears on every list up to there). */
  reaches: Level;
}

// KNEC codes start with the county code (Migori 44, Kisumu 42); the 999 block keeps clear of real schools.
const SCHOOLS: MockSchool[] = [
  { name: "Mock Uriri Primary", knecCode: "44999001", county: "Migori", subcounty: "Uriri", zone: "Uriri Zone", baseName: "Uriri Base", pushed: true, reaches: "NATIONAL" },
  { name: "Mock Nyamaranya Primary", knecCode: "44999002", county: "Migori", subcounty: "Uriri", zone: "Uriri Zone", baseName: "Uriri Base", pushed: false, reaches: "BASE" },
  { name: "Mock Kanyawanga Primary", knecCode: "44999003", county: "Migori", subcounty: "Uriri", zone: "Uriri Zone", baseName: "Kanyawanga Base", pushed: true, reaches: "ZONE" },
  { name: "Mock Oyani Primary", knecCode: "44999004", county: "Migori", subcounty: "Uriri", zone: "Oyani Zone", baseName: "Oyani Base", pushed: true, reaches: "SUB_COUNTY" },
  { name: "Mock Kamagambo Primary", knecCode: "44999005", county: "Migori", subcounty: "Rongo", zone: "Rongo Zone", baseName: "Kamagambo Base", pushed: true, reaches: "COUNTY" },
  { name: "Mock Kondele Primary", knecCode: "42999006", county: "Kisumu", subcounty: "Kisumu Central", zone: "Kondele Zone", baseName: "Kondele Base", pushed: true, reaches: "REGIONAL" },
];

interface MockChampionship {
  key: string;
  name: string;
  level: Level;
  county: string;
  jurisdiction: string | null;
  location: string;
  /** Days from today to the first day; each runs three days. */
  startsIn: number;
}

// Each tier a fortnight after the one below it, as a real season runs.
const CHAMPIONSHIPS: MockChampionship[] = [
  { key: "base-uriri", name: "Mock Uriri", level: "BASE", county: "Migori", jurisdiction: "Uriri Base", location: "Uriri Primary grounds", startsIn: 7 },
  { key: "base-kanyawanga", name: "Mock Kanyawanga", level: "BASE", county: "Migori", jurisdiction: "Kanyawanga Base", location: "Kanyawanga grounds", startsIn: 7 },
  { key: "base-oyani", name: "Mock Oyani", level: "BASE", county: "Migori", jurisdiction: "Oyani Base", location: "Oyani grounds", startsIn: 7 },
  { key: "base-kamagambo", name: "Mock Kamagambo", level: "BASE", county: "Migori", jurisdiction: "Kamagambo Base", location: "Kamagambo grounds", startsIn: 7 },
  { key: "base-kondele", name: "Mock Kondele", level: "BASE", county: "Kisumu", jurisdiction: "Kondele Base", location: "Kondele grounds", startsIn: 7 },
  { key: "zone", name: "Mock Uriri", level: "ZONE", county: "Migori", jurisdiction: "Uriri Zone", location: "Uriri Stadium", startsIn: 21 },
  { key: "subcounty", name: "Mock Uriri", level: "SUB_COUNTY", county: "Migori", jurisdiction: "Uriri", location: "Uriri Stadium", startsIn: 35 },
  { key: "county", name: "Mock Migori", level: "COUNTY", county: "Migori", jurisdiction: null, location: "Migori Stadium", startsIn: 49 },
  { key: "regional", name: "Mock Nyanza", level: "REGIONAL", county: "Kisumu", jurisdiction: "Nyanza", location: "Moi Stadium Kisumu", startsIn: 63 },
  { key: "national", name: "Mock Kenya", level: "NATIONAL", county: "Nairobi", jurisdiction: null, location: "Nyayo Stadium", startsIn: 77 },
];

const LADDER: Level[] = ["BASE", "ZONE", "SUB_COUNTY", "COUNTY", "REGIONAL", "NATIONAL"];

/** The championship a school's entry sits on at a level, if its area holds one. */
function championshipFor(school: MockSchool, level: Level): MockChampionship | undefined {
  const own = { BASE: school.baseName, ZONE: school.zone, SUB_COUNTY: school.subcounty, REGIONAL: regionOfCounty(school.county) } as Record<string, string | null>;
  return CHAMPIONSHIPS.find((c) => {
    if (c.level !== level) return false;
    if (level === "NATIONAL") return true;
    if (level === "COUNTY") return c.county === school.county;
    return c.jurisdiction === own[level];
  });
}

const day = (offset: number) => {
  const d = new Date();
  d.setUTCHours(6, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};

async function clean() {
  const users = await prisma.user.findMany({ where: { email: { endsWith: DOMAIN } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const tenants = await prisma.tenant.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
  const championships = await prisma.championship.findMany({ where: { tenantId: { in: tenants.map((t) => t.id) } }, select: { id: true } });
  const championshipIds = championships.map((c) => c.id);
  const links = await prisma.championshipSchool.findMany({ where: { championshipId: { in: championshipIds } }, select: { schoolId: true } });

  // Subscriptions hold their championship, so they go first; deleting a
  // championship takes its games, roles and school links with it.
  await prisma.$transaction([
    prisma.championshipSubscription.deleteMany({ where: { tenantId: { in: tenants.map((t) => t.id) } } }),
    prisma.championship.deleteMany({ where: { id: { in: championshipIds } } }),
    prisma.school.deleteMany({ where: { id: { in: links.map((l) => l.schoolId) } } }),
    prisma.user.deleteMany({ where: { id: { in: userIds } } }),
  ]);
  console.log(`Removed ${userIds.length} mock accounts, ${championshipIds.length} championships and ${links.length} school entries.`);
}

async function seed() {
  const existing = await prisma.user.count({ where: { email: { endsWith: DOMAIN } } });
  if (existing > 0) {
    console.log(`Mock data is already there (${existing} accounts). Run with --clean first to start over.`);
    return;
  }
  const taken = await prisma.schoolAccount.findMany({ where: { knecCode: { in: SCHOOLS.map((s) => s.knecCode) } }, select: { knecCode: true } });
  if (taken.length > 0) throw new Error(`KNEC codes already in use: ${taken.map((t) => t.knecCode).join(", ")}`);

  const password = process.env.MOCK_PASSWORD ?? `Mock${randomBytes(6).toString("hex")}7`;
  const passwordHash = await bcrypt.hash(password, 12);

  // The organizer running every tier, and two officials.
  const owner = await prisma.user.create({
    data: { email: mail("organizer"), passwordHash, name: "Mock Organizer", phone: "0700000001", roles: { create: { role: Role.TENANT_OWNER } } },
  });
  const tenant = await prisma.tenant.create({
    data: {
      organizationName: "Mock Nyanza Schools Sports",
      contactName: "Mock Organizer",
      email: mail("organizer"),
      phone: "0700000001",
      accountType: "SCHOOL",
      county: "Migori",
      subcounty: "Uriri",
      gameCategory: "ATHLETICS",
      userId: owner.id,
    },
  });
  const admin = await prisma.user.create({ data: { email: mail("admin"), passwordHash, name: "Mock Tournament Admin", phone: "0700000002" } });
  const scorer = await prisma.user.create({ data: { email: mail("scorer"), passwordHash, name: "Mock Scorekeeper", phone: "0700000003" } });

  const plans = await prisma.subscriptionPlan.findMany({ where: { packageTier: PackageTier.ESSENTIAL } });
  const ids = new Map<string, string>();

  for (const c of CHAMPIONSHIPS) {
    const championship = await prisma.championship.create({
      data: {
        tenantId: tenant.id,
        name: withLevelInName(c.name, c.level),
        level: c.level,
        schoolLevel: "PRIMARY_JS",
        category: "ATHLETICS",
        county: c.county,
        jurisdiction: c.jurisdiction,
        location: c.location,
        startDate: day(c.startsIn),
        endDate: day(c.startsIn + 2),
        isPublished: true,
        createdBy: owner.id,
      },
    });
    ids.set(c.key, championship.id);

    await prisma.game.createMany({
      data: defaultGamesFor(championship).map((g) => ({ championshipId: championship.id, ...g })),
    });
    await prisma.userRole.createMany({
      data: [
        { userId: admin.id, role: Role.TOURNAMENT_ADMIN, championshipId: championship.id },
        { userId: scorer.id, role: Role.SCOREKEEPER, championshipId: championship.id },
      ],
    });

    // Above Inter School a championship is paid for: mark it paid, as if by M-Pesa.
    const plan = plans.find((p) => p.level === c.level);
    if (c.level !== "BASE" && plan) {
      await prisma.championshipSubscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          championshipId: championship.id,
          status: "ACTIVE",
          trialEndsAt: new Date(),
          paidAt: new Date(),
          amountPaidKes: plan.priceKes,
          paystackReference: `MOCK-${c.key.toUpperCase()}`,
        },
      });
    }
  }

  // Schools sign themselves up; each then sits on the list of every tier it has reached.
  for (const [i, s] of SCHOOLS.entries()) {
    const region = regionOfCounty(s.county) ?? "";
    const user = await prisma.user.create({
      data: { email: mail(`school${i + 1}`), passwordHash, name: `${s.name} Teacher`, phone: `07000001${String(i + 1).padStart(2, "0")}` },
    });
    const account = await prisma.schoolAccount.create({
      data: { knecCode: s.knecCode, schoolName: s.name, baseName: s.baseName, zone: s.zone, subcounty: s.subcounty, county: s.county, region, userId: user.id },
    });

    const levels = s.pushed ? LADDER.slice(0, LADDER.indexOf(s.reaches) + 1) : [];
    for (const level of levels) {
      const c = championshipFor(s, level);
      if (!c) continue;
      for (const schoolLevel of ["PRIMARY", "JS"] as const) {
        const school = await prisma.school.create({
          data: { name: s.name, schoolLevel, county: s.county, subcounty: s.subcounty, zone: s.zone, region },
        });
        await prisma.championshipSchool.create({
          data: {
            championshipId: ids.get(c.key)!,
            schoolId: school.id,
            // The school's own account holds its Inter School entry; above that it arrived by promotion.
            schoolAccountId: level === "BASE" ? account.id : null,
          },
        });
      }
    }
  }

  console.log("Mock data created.\n");
  console.log(`Password for every account: ${password}${process.env.MOCK_PASSWORD ? " (from MOCK_PASSWORD)" : " (shown only now)"}\n`);
  console.log(`  ${mail("organizer")}  tenant owner of all ${CHAMPIONSHIPS.length} championships`);
  console.log(`  ${mail("admin")}      tournament admin on each`);
  console.log(`  ${mail("scorer")}     scorekeeper on each`);
  for (const [i, s] of SCHOOLS.entries()) {
    const status = s.pushed ? `pushed, reaches ${s.reaches}` : "signed up, not pushed yet";
    console.log(`  ${mail(`school${i + 1}`)}    ${s.name} (${s.knecCode}, ${s.baseName}) - ${status}`);
  }
}

(process.argv.includes("--clean") ? clean() : seed())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
