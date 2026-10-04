import type { Metadata } from "next";

// Link preview for the open registration link (WhatsApp etc.). Deliberately
// static - no database lookup and a ready-made image - because WhatsApp only
// waits a few seconds, and a cold start that wakes the database can take
// longer than that, leaving a bare-domain preview.
const TITLE = "Zaroda KSEF – School Registration";
const DESCRIPTION = "Register your school for the Kenya Science and Engineering Fair and enter its projects.";
const IMAGE = { url: "/images/ksef-registration-og.jpg", width: 1200, height: 630, alt: "Zaroda KSEF school registration" };

export async function generateMetadata(props: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await props.params;
  return {
    title: TITLE,
    description: DESCRIPTION,
    // Shared on purpose, but there's no reason for search engines to list it.
    robots: { index: false, follow: false },
    openGraph: { title: TITLE, description: DESCRIPTION, siteName: "Zaroda KSEF", type: "website", url: `/ksef/register/${token}`, images: [IMAGE] },
    twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [IMAGE.url] },
  };
}

export default function KsefRegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
