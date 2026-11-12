import { NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "jarvis_session";
const PROTECTED_ROUTES = ["/", "/assistant"];

/**
 * Optimistic fast-path gate checking session cookie existence on protected routes.
 * Full cryptographic + database session validation happens in the protected pages and API guards.
 */
export function proxy(request) {
  const { pathname } = request.nextUrl;
  const hasCookie = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  const isProtected = PROTECTED_ROUTES.some((route) =>
    route === "/" ? pathname === "/" : pathname.startsWith(route)
  );

  if (isProtected && !hasCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/assistant/:path*"],
};
