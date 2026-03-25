import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.SECRET_KEY || "dev-secret-change-in-prod"
);
const COOKIE_NAME = "iot-session";

const PROTECTED = ["/", "/admin", "/super"];
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

  // Protected pages — redirect to login
  if (PROTECTED.includes(pathname) && !user) {
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

  // Admin page — needs org context (permission checked at API level)
  if (pathname === "/admin" && user && !user.org_id && !user.is_super_admin) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/admin", "/super"],
};
