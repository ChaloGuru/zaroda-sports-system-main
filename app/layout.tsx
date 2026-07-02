import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

const TITLE = "Zaroda Sports Management System | Championship & Athletics Management for Kenyan Schools";
const DESCRIPTION =
  "Zaroda Sports helps Kenyan schools manage championships, athletics meets, and ball games - registration, live results, rankings, and medal tables in one place.";

export const metadata: Metadata = {
  metadataBase: new URL("https://zarodasports.live"),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://zarodasports.live",
    siteName: "Zaroda Sports",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
