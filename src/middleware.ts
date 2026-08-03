import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { ROLES } from "@/lib/rbac";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

const publicPaths = ["/login", "/api/auth", "/api/dev", "/api/share"];
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

  // Block mutating APIs when Learning Mode / Practice company pairing is invalid.
  const method = request.method.toUpperCase();
  const isMutating = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  const isLearningApi = pathname.startsWith("/api/learning");
  const isAuthApi = pathname.startsWith("/api/auth");
  if (
    isMutating &&
    pathname.startsWith("/api/") &&
    !isLearningApi &&
    !isAuthApi
  ) {
    const companies = session.user.companies ?? [];
    const active = companies.find((c) => c.id === session.user.activeCompanyId);
    const isPractice =
      Boolean(active?.isPractice) || active?.code === "LEARN";
    const learningMode = Boolean(session.user.learningMode);

    if (learningMode && !isPractice) {
      return NextResponse.json(
        {
          code: "LEARNING_MODE_PRODUCTION_BLOCKED",
          message:
            "Learning Mode is on but you are not on the Practice company.",
        },
        { status: 403 },
      );
    }
    if (!learningMode && isPractice) {
      return NextResponse.json(
        {
          code: "PRACTICE_REQUIRES_LEARNING_MODE",
          message: "Practice company requires Learning Mode.",
        },
        { status: 403 },
      );
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
