import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Trophy, Medal, Timer, ShieldCheck, ArrowRight, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Zaroda Sports Management System | Championship & Athletics Management for Kenyan Schools",
  description:
    "Run school championships and athletics meets from registration to final rankings - built for Kenyan zones, sub-counties, counties, and national tournaments.",
};

async function getStats() {
  const [tenants, championships, participants] = await Promise.all([
    prisma.tenant.count(),
    prisma.championship.count({ where: { isPublished: true } }),
    prisma.participant.count(),
  ]);
  return { tenants, championships, participants };
}

export default async function LandingPage() {
  const stats = await getStats();

  return (
    <div>
      <section className="relative overflow-hidden border-b border-border">
        <Image
          src="/images/hero.png"
          alt="Young athletes in Zaroda Sports jerseys competing in basketball and football"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        {/* Navy wash - keeps the photo visible while still grounding the section in the brand color */}
        <div className="absolute inset-0 bg-gradient-to-b from-navy/90 via-navy/70 to-navy/40" />
        {/* Subtle diagonal sheen for a glass-like highlight across the photo */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent" />

        <div className="container relative flex flex-col items-center gap-6 py-24 text-center">
          <span className="rounded-full border border-white/30 bg-white/15 px-4 py-1 text-sm font-medium text-white backdrop-blur-sm">
            Built for Kenyan school &amp; open championships
          </span>
          <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight text-white drop-shadow-[0_2px_16px_rgba(6,15,46,0.9)] sm:text-6xl">
            Run your championship from bib numbers to final rankings
          </h1>
          <p className="max-w-2xl text-lg text-white/90 drop-shadow-[0_2px_10px_rgba(6,15,46,0.9)]">
            Zaroda Sports Management System handles registration, call-room check-ins, live results capture, and
            public standings for athletics, ball games, music, and other competitions - starting completely free.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button size="lg" asChild>
              <Link href="/signup">
                Start free with Base <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="secondary" asChild>
              <Link href="/pricing">See Essential pricing</Link>
            </Button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-8 text-center">
            <div>
              <p className="font-mono text-3xl font-bold tabular-nums text-white">{stats.tenants}</p>
              <p className="text-sm text-white/70">Organizations</p>
            </div>
            <div>
              <p className="font-mono text-3xl font-bold tabular-nums text-white">{stats.championships}</p>
              <p className="text-sm text-white/70">Championships</p>
            </div>
            <div>
              <p className="font-mono text-3xl font-bold tabular-nums text-white">{stats.participants}</p>
              <p className="text-sm text-white/70">Participants</p>
            </div>
          </div>
        </div>
      </section>

      <section className="container py-20">
        <h2 className="text-center text-2xl font-bold text-foreground">Free Base tier, pay only when you level up</h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-muted">
          Every school or organizer gets unlimited Base-level championships at no cost, forever. Unlock Zone through
          National with an affordable one-time Essential subscription per level.
        </p>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <FeatureCard
            icon={<Trophy className="h-6 w-6 text-primary" />}
            title="Full event lifecycle"
            description="Registration, heats, lane seeding, call-room check-in, and results capture in one place."
          />
          <FeatureCard
            icon={<Timer className="h-6 w-6 text-primary" />}
            title="Athletics & ball games"
            description="Time parsing, bib ranges, and sport-specific standings for football, basketball, rugby & more."
          />
          <FeatureCard
            icon={<Medal className="h-6 w-6 text-primary" />}
            title="Public rankings"
            description="County/regional-style standings, medal tables, and printable PDF result sheets."
          />
          <FeatureCard
            icon={<ShieldCheck className="h-6 w-6 text-primary" />}
            title="Role-based access"
            description="Tenant owners, tournament admins, scorekeepers and officials each see only what they should."
          />
        </div>
      </section>

      <section className="border-t border-border bg-surface-raised py-20">
        <div className="container flex flex-col items-center gap-6 text-center">
          <Users className="h-10 w-10 text-primary" />
          <h2 className="text-2xl font-bold text-foreground">Ready to run your first championship?</h2>
          <p className="max-w-xl text-muted">
            Sign up as a school or an open-tournament organizer. Your first Base championship is free and never
            counts against any quota.
          </p>
          <Button size="lg" asChild>
            <Link href="/signup">Create your free account</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-md bg-navy-light/40">{icon}</div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent />
    </Card>
  );
}
