import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api", "/my-account", "/dashboard", "/ksef/join", "/ksef/register", "/ksef/school", "/account/setup"],
    },
    sitemap: "https://zarodasports.live/sitemap.xml",
  };
}
