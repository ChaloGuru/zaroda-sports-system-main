import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Trophy, Medal, Timer, ShieldCheck, ArrowRight, Users, MapPin, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { formatDate, todayUtcRange } from "@/lib/utils";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Zaroda Sports Management System | Championship & Athletics Management for Kenyan Schools",
  description:
    "Run school championships and athletics meets from registration to final rankings - built for Kenyan zones, sub-counties, counties, and national tournaments.",
  // Explicit canonical + JSON-LD WebSite/Organization schema below tell
  // search engines the homepage - not /guide or any other page - is the
  // primary entity for brand-name searches like "Zaroda Sports".
  alternates: { canonical: "https://zarodasports.live/" },
};

const WEBSITE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Zaroda Sports",
  alternateName: "Zaroda Sports Management System",
  url: "https://zarodasports.live/",
};

const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Zaroda Sports",
  url: "https://zarodasports.live/",
  logo: "https://zarodasports.live/images/logo.png",
};

export default async function LandingPage() {
  const { startOfTodayUtc, startOfTomorrowUtc } = todayUtcRange();
  const [ongoingChampionships, upcomingChampionships] = await Promise.all([
    prisma.championship.findMany({
      where: { isPublished: true, startDate: { lt: startOfTomorrowUtc }, endDate: { gte: startOfTodayUtc } },
      orderBy: { startDate: "asc" },
      include: { tenant: { select: { organizationName: true } } },
    }),
    prisma.championship.findMany({
      where: { isPublished: true, startDate: { gte: startOfTomorrowUtc } },
      orderBy: { startDate: "asc" },
      take: 6,
      include: { tenant: { select: { organizationName: true } } },
    }),
  ]);

  return (
    <div>
      {/* eslint-disable-next-line react/no-danger */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_JSON_LD) }} />
      {/* eslint-disable-next-line react/no-danger */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSON_LD) }} />

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
            Run your championship like a pro from team registration to final champions digitally
          </h1>
          <p className="max-w-2xl text-lg text-white/90 drop-shadow-[0_2px_10px_rgba(6,15,46,0.9)]">
            Zaroda Sports Management System is your ultimate championship manager, handling team registration,
            call-room check-ins, live result capture for table standings, and team progression and rankings
            automatically for ball games, athletics, and other competitions.
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
          <Image
            src="/images/logo.png"
            alt="Zaroda Sports Management System"
            width={216}
            height={144}
            className="mt-4 h-20 w-auto drop-shadow-[0_2px_16px_rgba(6,15,46,0.9)]"
          />
        </div>
      </section>

      {ongoingChampionships.length > 0 && (
        <section className="border-b border-border bg-surface-raised py-14">
          <div className="container">
            <h2 className="text-center text-2xl font-extrabold text-foreground">Ongoing Championships</h2>
            <p className="mx-auto mt-2 max-w-2xl text-center text-muted">
              Tap a championship below to view live results, standings, and rankings.
            </p>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {ongoingChampionships.map((c) => (
                <Link key={c.id} href={`/championship/${c.id}`}>
                  <Card className="h-full border-2 border-primary/40 transition-colors hover:border-primary">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary">{c.level.replace("_", " ")}</Badge>
                        <Badge variant="outline">{c.schoolLevel.replace("_", " ")}</Badge>
                      </div>
                      <CardTitle className="mt-2 font-extrabold">{c.name}</CardTitle>
                      <CardDescription className="font-semibold">{c.tenant.organizationName}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm font-medium text-foreground">
                      <p className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" /> {c.location}, {c.county}
                      </p>
                      <p className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" /> {formatDate(c.startDate)} - {formatDate(c.endDate)}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {upcomingChampionships.length > 0 && (
        <section className="border-b border-border py-14">
          <div className="container">
            <h2 className="text-center text-2xl font-extrabold text-foreground">Upcoming Championships</h2>
            <p className="mx-auto mt-2 max-w-2xl text-center text-muted">
              Championships coming up soon - tap one to see its details.
            </p>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {upcomingChampionships.map((c) => (
                <Link key={c.id} href={`/championship/${c.id}`}>
                  <Card className="h-full border-2 border-accent/40 transition-colors hover:border-accent">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary">{c.level.replace("_", " ")}</Badge>
                        <Badge variant="outline">{c.schoolLevel.replace("_", " ")}</Badge>
                      </div>
                      <CardTitle className="mt-2 font-extrabold">{c.name}</CardTitle>
                      <CardDescription className="font-semibold">{c.tenant.organizationName}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm font-medium text-foreground">
                      <p className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" /> {c.location}, {c.county}
                      </p>
                      <p className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" /> {formatDate(c.startDate)} - {formatDate(c.endDate)}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

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
