import type { Metadata } from "next";
import { Archivo, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "@/components/providers";
import { THEME_INIT_SCRIPT } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-heading",
  display: "swap",
});
const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-mono",
  display: "swap",
});

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
    <html lang="en" className={cn(archivo.variable, ibmPlexSans.variable, ibmPlexMono.variable)}>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
