import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export interface LegalSection {
  id: string;
  title: string;
  body: React.ReactNode;
}

/** A plain, readable page for the Privacy Policy and Terms of Use, with a contents list. */
export function LegalPage({
  icon: Icon,
  title,
  intro,
  updated,
  sections,
}: {
  icon: LucideIcon;
  title: string;
  intro: React.ReactNode;
  updated: string;
  sections: LegalSection[];
}) {
  return (
    <div className="container py-12 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <h1 className="mt-4 text-3xl font-bold text-foreground sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated {updated}</p>
        <div className="mt-6 text-base leading-relaxed text-foreground">{intro}</div>

        <nav aria-label="Contents" className="mt-8 rounded-lg border border-border bg-surface p-5">
          <p className="text-sm font-semibold text-foreground">Contents</p>
          <ol className="mt-2 grid list-decimal gap-1 pl-5 text-sm sm:grid-cols-2">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-primary hover:underline">
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-10">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <h2 className="text-xl font-bold text-foreground">
                {i + 1}. {s.title}
              </h2>
              <div className="mt-3 space-y-3 text-[0.95rem] leading-relaxed text-foreground [&_a]:text-primary [&_a]:underline [&_li]:mt-1 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5">
                {s.body}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-12 border-t border-border pt-6 text-sm text-muted">
          See also our <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link> and{" "}
          <Link href="/terms" className="text-primary hover:underline">Terms of Use</Link>. Questions? Use the{" "}
          <Link href="/contacts" className="text-primary hover:underline">contact form</Link>, WhatsApp{" "}
          <a href="https://wa.me/254781230805" className="text-primary hover:underline">0781230805</a> or call{" "}
          <a href="tel:+254724282065" className="text-primary hover:underline">0724282065</a>.
        </p>
      </div>
    </div>
  );
}
