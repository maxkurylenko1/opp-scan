import { NextResponse } from "next/server";
import { ADMIN_COOKIE, getAdminCookieValue, verifyAdminPassword } from "@/lib/auth/admin";

export async function POST(request: Request) {
  const form = await request.formData();
  const password = String(form.get("password") || "");
  if (!verifyAdminPassword(password)) {
    return NextResponse.redirect(new URL("/admin?error=1", request.url), 303);
  }

  const response = NextResponse.redirect(new URL("/execution", request.url), 303);
  response.cookies.set(ADMIN_COOKIE, getAdminCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
