"use client";

import * as React from "react";
import { Quote, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface PublicTestimonial {
  id: string;
  authorName: string;
  authorRole: string;
  organizationName: string | null;
  message: string;
  rating: number | null;
  championshipsRun: number;
}

/** Featured, publicly-shareable testimonials on the landing page. Renders nothing until there are any. */
export function TestimonialsSection({ testimonials }: { testimonials: PublicTestimonial[] }) {
  // Lets a visitor manually drag/swipe through the auto-scrolling row - pause
  // the animation the moment they touch it so a manual scroll doesn't fight
  // the transform running on the same element every frame.
  const [held, setHeld] = React.useState(false);

  if (testimonials.length === 0) return null;

  return (
    <section className="border-t border-border bg-surface-raised py-20">
      <div className="container">
        <div className="mb-12 text-center">
          <p className="mb-2 text-sm font-bold uppercase tracking-widest text-gold">In their words</p>
          <h2 className="text-2xl font-extrabold text-foreground sm:text-3xl">What organizers and officials are saying</h2>
        </div>

        {testimonials.length > 3 ? (
          // Many testimonials - an endless auto-scrolling row reads better than
          // a grid that keeps growing taller. The track is the list rendered
          // twice back-to-back and scrolled exactly 50%, so the loop is seamless.
          <div
            className="overflow-x-auto overflow-y-hidden mask-[linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]"
            onPointerDown={() => setHeld(true)}
          >
            <div
              className="marquee-track flex w-max items-start gap-6 pb-2"
              style={
                {
                  "--marquee-duration": `${testimonials.length * 6}s`,
                  animationPlayState: held ? "paused" : undefined,
                } as React.CSSProperties
              }
            >
              {[...testimonials, ...testimonials].map((t, i) => (
                <TestimonialCard
                  key={`${t.id}-${i}`}
                  testimonial={t}
                  className="w-80 shrink-0"
                  aria-hidden={i >= testimonials.length || undefined}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="grid items-start gap-6 md:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((t) => (
              <TestimonialCard key={t.id} testimonial={t} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function TestimonialCard({
  testimonial: t,
  className,
  ...props
}: { testimonial: PublicTestimonial; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Card className={cn("flex flex-col", className)} {...props}>
      <CardContent className="flex flex-col py-6">
        <Quote className="mb-3 h-6 w-6 text-gold" />
        <p className="text-sm leading-relaxed text-foreground">&ldquo;{t.message}&rdquo;</p>
        {t.rating && (
          <div className="mt-4 flex" aria-label={`${t.rating} out of 5`}>
            {Array.from({ length: 5 }).map((_, n) => (
              <Star key={n} className={cn("h-3.5 w-3.5", n < t.rating! ? "fill-gold text-gold" : "text-border")} />
            ))}
          </div>
        )}
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-sm font-bold text-foreground">{t.authorName}</p>
          <p className="text-xs text-muted">
            {t.authorRole}
            {t.organizationName ? ` · ${t.organizationName}` : ""}
          </p>
          {t.championshipsRun > 0 && (
            <p className="mt-1 text-[11px] font-semibold text-green-600 dark:text-green-400">
              ✓ Verified: {t.championshipsRun} championship{t.championshipsRun === 1 ? "" : "s"} run on Zaroda Sports
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
