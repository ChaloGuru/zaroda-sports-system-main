import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { GuideContent } from "@/components/guide/guide-content";

export const metadata: Metadata = {
  title: "User Guide | Zaroda Sports Management System",
  description:
    "A quick, interactive guide to running championships, registering schools and teams, managing fixtures and scores, and sharing results on Zaroda Sports.",
  alternates: { canonical: "https://zarodasports.live/guide" },
};

export default function GuidePage() {
  return (
    <div className="container py-16">
      <div className="mx-auto max-w-2xl text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <BookOpen className="h-6 w-6 text-primary" />
        </div>
        <h1 className="mt-4 text-3xl font-bold text-foreground sm:text-4xl">User Guide</h1>
        <p className="mt-3 text-muted">
          Everything you need to run a championship on Zaroda Sports, from setup to sharing final results. Tap a
          section to expand it.
        </p>
      </div>

      <div className="mx-auto mt-10 max-w-3xl">
        <GuideContent />
      </div>
    </div>
  );
}
