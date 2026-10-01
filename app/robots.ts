import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api", "/my-account", "/dashboard", "/ksef/join"],
    },
    sitemap: "https://zarodasports.live/sitemap.xml",
  };
}
