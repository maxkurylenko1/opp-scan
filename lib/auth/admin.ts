import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { config } from "@/lib/config";

export const ADMIN_COOKIE = "opp_scan_admin";
const PURPOSE = "opp-scan-admin-v1";

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function sessionValue() {
  if (!config.cronSecret) return "";
  return createHmac("sha256", config.cronSecret).update(PURPOSE).digest("hex");
}

export function verifyAdminPassword(value: string) {
  return Boolean(config.cronSecret && value && safeEqual(value, config.cronSecret));
}

export function verifyAdminCookie(value: string | undefined | null) {
  const expected = sessionValue();
  return Boolean(expected && value && safeEqual(value, expected));
}

export function getAdminCookieValue() {
  return sessionValue();
}

export async function isAdminSession() {
  const store = await cookies();
  return verifyAdminCookie(store.get(ADMIN_COOKIE)?.value);
}
