import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.SECRET_KEY || "dev-secret-change-in-prod"
);
const COOKIE_NAME = "iot-session";

const AUTH_PAGES = ["/login"];

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(COOKIE_NAME)?.value;

  let user = null;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, SECRET);
      user = payload;
    } catch {
      // Invalid/expired token
    }
  }

  // Public routes — no auth needed
  if (pathname.startsWith("/public/")) {
    return NextResponse.next();
  }

  // Determine if this is an org page (needs auth + org)
  const isOrgPage = pathname === "/" ||
    pathname.startsWith("/-/") ||
    pathname.startsWith("/d/") ||
    pathname.startsWith("/a/") ||
    pathname.startsWith("/my/");

  // Protected pages — redirect to login
  if ((isOrgPage || pathname === "/super") && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Login page — redirect if already logged in
  if (AUTH_PAGES.includes(pathname) && user) {
    if (user.is_super_admin) {
      return NextResponse.redirect(new URL("/super", request.url));
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Super admin page — only super_admin
  if (pathname === "/super" && user && !user.is_super_admin) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Org pages — need org context, super admin goes to /super
  if (isOrgPage && user) {
    if (user.is_super_admin) {
      return NextResponse.redirect(new URL("/super", request.url));
    }
    if (!user.org_id) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/", "/login", "/super",
    "/-/:path*",
    "/d/:path*",
    "/a/:path*",
    "/my/:path*",
    "/public/:path*",
  ],
};
