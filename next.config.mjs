import path from "node:path";
import { fileURLToPath } from "node:url";

const isDev = process.env.NODE_ENV !== "production";

// 'unsafe-inline' scripts are needed for Next.js's inline bootstrap and the
// theme-init / Meta Pixel snippets in app/layout.tsx; the policy still blocks
// scripts from any other origin, plugins, framing and <base> hijacking.
// 'unsafe-eval' is only needed by the dev server's hot reloading.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://connect.facebook.net`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://connect.facebook.net https://www.facebook.com",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the project root - otherwise Next.js picks up a stray lockfile in a
  // parent directory and traces files from there.
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // KSEF moved to its own app; send old links there.
  async redirects() {
    return [
      { source: "/ksef/:path*", destination: "https://ksef.zarodasports.live/", permanent: false },
      { source: "/admin/ksef/:path*", destination: "https://ksef.zarodasports.live/", permanent: false },
      { source: "/dashboard/ksef-judging/:path*", destination: "https://ksef.zarodasports.live/judging", permanent: false },
    ];
  },
};

export default nextConfig;
