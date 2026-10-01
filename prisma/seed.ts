import { PrismaClient, Level, PackageTier, Role } from "@prisma/client";
import { randomBytes } from "crypto";
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

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Super admin ${email} already exists, skipping.`);
    return;
  }

  // Never fall back to a fixed, publicly known default password - generate
  // a random one (shown once below) if none was supplied.
  const providedPassword = process.env.SEED_SUPER_ADMIN_PASSWORD;
  const password = providedPassword ?? `${randomBytes(12).toString("base64url")}A1`;

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: "Zaroda Super Admin",
      roles: { create: { role: Role.SUPER_ADMIN } },
    },
  });

  if (providedPassword) {
    console.log(`Seeded super admin user: ${user.email} (password from SEED_SUPER_ADMIN_PASSWORD)`);
  } else {
    console.log(`Seeded super admin user: ${user.email} with generated password: ${password}`);
    console.log("This password is shown only once - store it securely or change it after first sign-in.");
  }
}

async function main() {
  await seedSubscriptionPlans();
  await seedSuperAdmin();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
