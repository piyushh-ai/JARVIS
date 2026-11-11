import { NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "jarvis_session";

/**
 * Optimistic fast-path gate checking session cookie existence on /.
 * Full cryptographic + database session validation happens in the protected page and API guards.
 */
export function proxy(request) {
  const { pathname } = request.nextUrl;
  const hasCookie = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (pathname === "/" && !hasCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", "/");
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};

