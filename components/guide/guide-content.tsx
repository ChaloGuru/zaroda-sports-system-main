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
      "Sign up as a school or open-tournament organizer to get a free account. You'll immediately be able to create Base-level championships at no cost.",
      "Log in any time from the \"Log in\" link in the top navigation. Your dashboard is where you manage every championship you run.",
    ],
  },
  {
    title: "2. Creating a championship",
    body: [
      "From your dashboard, choose \"New championship\" and set its name, category (Athletics, Ball Games, Music, or Other Games), school level, county, location, and dates.",
      "Base level is always free. Zone, Sub-County, County, Regional, and National levels require a one-time payment per championship - see Pricing for rates.",
    ],
  },
  {
    title: "3. Registering schools and teams",
    body: [
      "For Athletics/Music events, add participating schools and their athletes under the Participants tab.",
      "For Ball Games/Other Games, register competing organizations as teams under the Teams tab - you can add several at once with \"Bulk add organizations\".",
    ],
  },
  {
    title: "4. Fixtures, scores, and standings",
    body: [
      "Use the Fixtures & Pooling tab to group teams into pools, generate a round-robin schedule, and record match scores.",
      "Standings update automatically and rank by total points, with tie-breakers applied. For multi-day championships, each fixture shows its match day.",
      "Once pool play finishes, advance the top teams from each pool into the knockout stage with one click - no manual re-entry needed.",
    ],
  },
  {
    title: "5. Roles for your officiating team",
    body: [
      "Assign championship-scoped roles so specific people can help run the event: Tournament Admin, Scorekeeper, Official, Game Coordinator (for a specific ball game like football), or an athletics chief official (Callroom Manager, Track Judge, Field Judge, Recorder).",
      "These roles automatically expire once the championship ends, so access doesn't linger indefinitely.",
    ],
  },
  {
    title: "6. Public results, rankings, and sharing",
    body: [
      "Anyone can view live results, standings, and the medal table from the public Rankings and Medal Table pages - no login required.",
      "Every results page can be printed, downloaded as a PDF, or shared with a ready-made message inviting other coordinators to try Zaroda Sports.",
    ],
  },
  {
    title: "7. Circulars and announcements",
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
