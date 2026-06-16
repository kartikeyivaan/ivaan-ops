import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { ROLES } from "@/lib/rbac";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

const publicPaths = ["/login", "/api/auth", "/api/dev"];
const passwordChangePaths = ["/change-password", "/api/users/me/password", "/api/users/me/password-status"];

export default auth((request) => {
  const { pathname } = request.nextUrl;
  const session = request.auth;

  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  if (!session?.user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const isPasswordFlow =
    pathname.startsWith("/change-password") ||
    pathname.startsWith("/api/users/me/password") ||
    pathname.startsWith("/api/users/me/password-status");

  if (isPasswordFlow) {
    return NextResponse.next();
  }

  if (session.user.passwordChangeRequired) {
    const allowed = passwordChangePaths.some((path) => pathname.startsWith(path));
    if (!allowed) {
      return NextResponse.redirect(new URL("/change-password", request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/change-password")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (pathname.startsWith("/admin")) {
    const isAdmin = session.user.roles?.includes(ROLES.SUPER_ADMIN);
    if (!isAdmin && !pathname.startsWith("/admin/warehouses")) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  if (!session.user.activeCompanyId && !pathname.startsWith("/select-company")) {
    return NextResponse.redirect(new URL("/select-company", request.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
