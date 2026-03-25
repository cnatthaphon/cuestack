import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.SECRET_KEY || "dev-secret-change-in-prod"
);
const COOKIE_NAME = "iot-session";

// Pages that require auth
const PROTECTED = ["/", "/admin"];
// Pages that should redirect to / if already logged in
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

  // Protected pages — redirect to login if no valid session
  if (PROTECTED.includes(pathname) && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Login page — redirect to dashboard if already logged in
  if (AUTH_PAGES.includes(pathname) && user) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Admin page — only admin role (ASVS V4.1.1)
  if (pathname === "/admin" && user && user.role !== "admin") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/admin"],
};
