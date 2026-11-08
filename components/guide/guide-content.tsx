"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface GuideSection {
  title: string;
  body: string[];
}

const SECTIONS: GuideSection[] = [
  {
    title: "1. Getting started",
    body: [
      "Sign up as a school or open-tournament organizer to get a free account. You'll immediately be able to create Inter School-level championships at no cost.",
      "Log in any time from the \"Log in\" link in the top navigation. Your dashboard is where you manage every championship you run.",
    ],
  },
  {
    title: "2. Creating a championship",
    body: [
      "From your dashboard, choose \"New championship\" and set its name, category (Athletics, Ball Games, Music, or Other Games), school level, county, location, and dates.",
      "Inter School level is always free. Zone, Sub-County, County, Regional, and National levels require a one-time payment per championship - see Pricing for rates.",
      "In the championship's settings, \"Area covered\" sets the base, zone, sub-county or region the championship belongs to. For an Inter School championship, enter the base name so schools at that base can find it; left blank, every school in the county can join. Changing the area later keeps all the championship's data.",
      "Promotions follow the area: a school can't be promoted into a championship outside its own zone, sub-county, county or region.",
    ],
  },
  {
    title: "3. Signing up as a school",
    body: [
      "Schools joining a championship sign up with their KNEC code from the \"Sign up with your KNEC code\" link on the Log in or Sign up page. The KNEC code must start with your county's code and can only be used by one school.",
      "Fill in your school's place from the top down: county (which sets your region), sub-county, zone, then Inter School base. The sub-county must be one in your county. The zone field suggests the zones already known in your sub-county, and the base field the bases known in your zone - pick yours from the list if it's there.",
      "Each base belongs to one zone and each zone to one sub-county. Once a school has signed up, its base and zone set that chain for the county: if you put a known base in a different zone, or a known zone in a different sub-county, signup is refused and tells you where it belongs.",
      "Names don't have to be typed exactly the same: \"Oruba\", \"Oruba Base\" and \"ORUBA INTER SCHOOL BASE\" are treated as the same base, and capitals, spacing and punctuation are ignored. The same goes for county names.",
      "Your dashboard lists the Inter School championships open to your school - those in your county for your base, or with no base set. Choose \"Push school\" to join one, then \"Register learners\".",
      "On the championship's page, \"Registered learners\" lists every learner you have registered and the activities each is entered in. To assign them: under \"Enter learners in races\", choose an event and press Add next to each learner - each is saved straight away; for ball games, under \"Ball game teams\", press \"Enter team\" for the game, then open the team's list and add your learners. Learners need a photo first, and each event offers only learners of its gender and level (Primary or JS).",
      "A school can register up to 200 learners, counting Primary and Junior School together. Every learner needs a photo, and age limits are checked against the learner's level when they are registered.",
      "Each learner's face is checked against the learners already registered in the championship. A photo whose face matches another learner registered under different details is refused, with the bib it matches - a learner can only be registered once. For twins, ask the tournament admin to register the second one. If the face in a photo can't be read, retake it closer and in good light.",
      "To delete a learner registered by mistake, press the bin next to them - they are removed from their activities too. A learner in an event that has been seeded or started, or on a team whose list has been approved, can only be deleted by the tournament admin, and after the registration deadline only the tournament admin can delete. A learner who has been challenged or disqualified is never deleted.",
    ],
  },
  {
    title: "4. Registering schools and teams",
    body: [
      "For Athletics/Music events, add participating schools and their athletes under the Participants tab. Learners are registered first, then entered into individual events; personal bests are collected when entering a race.",
      "Registered learners can still be entered after registration closes. An individual event locks once it has been seeded, or at its first result if it is never seeded. A school's own account and its team managers can enter its learners in races and ball-game teams.",
      "For Ball Games/Other Games, register competing organizations as teams under the Teams tab - you can add several at once with \"Bulk add organizations\".",
      "A Tournament Admin or Game Coordinator vets each team's list and approves it, which locks the list. Locks cover one event or team, so a learner can still be entered in others.",
    ],
  },
  {
    title: "5. Fixtures, scores, and standings",
    body: [
      "Use the Fixtures & Pooling tab to group teams into pools, generate a round-robin schedule, and record match scores.",
      "Standings update automatically and rank by total points, with tie-breakers applied. For multi-day championships, each fixture shows its match day.",
      "Once pool play finishes, advance the top teams from each pool into the knockout stage with one click - no manual re-entry needed.",
      "Each sport has its own points scale for win/draw/loss (e.g. football is 3/1/0, chess is 2/1/0). For chess, table tennis, and badminton - scored as boards or games won rather than goals - enter the boards/games each team won as the match score; standings then apply that sport's points scale the same way as any other ball game.",
    ],
  },
  {
    title: "6. Roles for your officiating team",
    body: [
      "Assign championship-scoped roles so specific people can help run the event: Tournament Admin, Scorekeeper, Official, Game Coordinator (for a specific ball game like football), or an athletics chief official (Callroom Manager, Track Judge, Field Judge, Recorder).",
      "These roles automatically expire once the championship ends, so access doesn't linger indefinitely.",
    ],
  },
  {
    title: "7. Public results, rankings, and sharing",
    body: [
      "Anyone can view live results, standings, and the medal table from the public Rankings and Medal Table pages - no login required.",
      "Every results page can be printed, downloaded as a PDF, or shared with a ready-made message inviting other coordinators to try Zaroda Sports.",
    ],
  },
  {
    title: "8. Circulars and announcements",
    body: [
      "Check the Circulars page for official announcements, which can include a downloadable PDF attachment alongside the written notice.",
    ],
  },
];

function GuideItem({ section, defaultOpen }: { section: GuideSection; defaultOpen: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <span className="font-semibold text-foreground">{section.title}</span>
        <ChevronDown className={cn("h-5 w-5 shrink-0 text-primary transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-2 border-t border-border bg-surface-raised px-5 py-4">
          {section.body.map((paragraph, i) => (
            <p key={i} className="text-sm text-muted">
              {paragraph}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function GuideContent() {
  return (
    <div className="space-y-3">
      {SECTIONS.map((section, i) => (
        <GuideItem key={section.title} section={section} defaultOpen={i === 0} />
      ))}
    </div>
  );
}
