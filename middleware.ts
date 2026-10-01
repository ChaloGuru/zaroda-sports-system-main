import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

    if (pathname.startsWith("/admin")) {
      const isSuperAdmin = token?.roles?.some((r) => r.role === "SUPER_ADMIN");
      if (!isSuperAdmin) {
        return NextResponse.redirect(new URL("/dashboard", req.url));
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      // A revoked session leaves a token with no id (see lib/auth.ts jwt callback).
      authorized: ({ token }) => !!token?.id,
    },
    pages: { signIn: "/login" },
  },
);

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
