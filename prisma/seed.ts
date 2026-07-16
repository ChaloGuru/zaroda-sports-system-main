import { PrismaClient, Level, PackageTier, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ESSENTIAL_PLANS: Array<{ displayName: string; level: Level; priceKes: number }> = [
  { displayName: "Essential - Zone", level: Level.ZONE, priceKes: 580 },
  { displayName: "Essential - Sub-County", level: Level.SUB_COUNTY, priceKes: 1160 },
  { displayName: "Essential - County", level: Level.COUNTY, priceKes: 2320 },
  { displayName: "Essential - Regional", level: Level.REGIONAL, priceKes: 3480 },
  { displayName: "Essential - National", level: Level.NATIONAL, priceKes: 5800 },
  { displayName: "Essential - Open Tournament", level: Level.OPEN_TOURNAMENT, priceKes: 5800 },
];

async function seedSubscriptionPlans() {
  for (const plan of ESSENTIAL_PLANS) {
    await prisma.subscriptionPlan.upsert({
      where: { packageTier_level: { packageTier: PackageTier.ESSENTIAL, level: plan.level } },
      update: { displayName: plan.displayName, priceKes: plan.priceKes, isActive: true },
      create: {
        displayName: plan.displayName,
        packageTier: PackageTier.ESSENTIAL,
        level: plan.level,
        priceKes: plan.priceKes,
        isActive: true,
      },
    });
  }
  console.log(`Seeded ${ESSENTIAL_PLANS.length} Essential subscription plans.`);
}

async function seedSuperAdmin() {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL ?? "admin@zaroda.sport";
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD ?? "ChangeMe123!";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Super admin ${email} already exists, skipping.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: "Zaroda Super Admin",
      roles: { create: { role: Role.SUPER_ADMIN } },
    },
  });

  console.log(`Seeded super admin user: ${user.email} (default password: ${password} - change immediately)`);
}

async function seedSampleSchools() {
  const count = await prisma.school.count();
  if (count > 0) {
    console.log("Schools already seeded, skipping.");
    return;
  }

  await prisma.school.createMany({
    data: [
      { name: "Starehe Boys Centre", zone: "Starehe", subcounty: "Starehe", county: "Nairobi", region: "Nairobi Region" },
      { name: "Alliance High School", zone: "Kikuyu", subcounty: "Kikuyu", county: "Kiambu", region: "Central Region" },
      { name: "Kisumu Girls High School", zone: "Kisumu Central", subcounty: "Kisumu Central", county: "Kisumu", region: "Nyanza Region" },
      { name: "Mombasa Secondary School", zone: "Mvita", subcounty: "Mvita", county: "Mombasa", region: "Coast Region" },
      { name: "Nakuru High School", zone: "Nakuru Town East", subcounty: "Nakuru Town East", county: "Nakuru", region: "Rift Valley Region" },
    ],
  });
  console.log("Seeded sample schools.");
}

async function main() {
  await seedSubscriptionPlans();
  await seedSuperAdmin();
  await seedSampleSchools();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
