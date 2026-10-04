import type { Metadata } from "next";
import { registrationEdition } from "./edition";

export async function generateMetadata(props: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await props.params;
  const edition = await registrationEdition(token);
  const title = edition ? `Zaroda KSEF – ${edition.name} School Registration` : "Zaroda KSEF – School Registration";
  const closes = edition?.registrationClosesAt
    ? ` Registration closes ${edition.registrationClosesAt.toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Nairobi" })}.`
    : "";
  const description = `Register your school for ${edition?.name ?? "the Kenya Science and Engineering Fair"} and enter its projects.${closes}`;
  return {
    title,
    description,
    // Shared on purpose, but there's no reason for search engines to list it.
    robots: { index: false, follow: false },
    openGraph: { title, description, siteName: "Zaroda KSEF", type: "website", url: `/ksef/register/${token}` },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function KsefRegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
