import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "@/lib/config";

export const ADMIN_COOKIE = "opp_scan_admin";
const PURPOSE = "opp-scan-admin-v1";

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

export function adminSessionValue() {
  if (!config.cronSecret) return "";
  return createHmac("sha256", config.cronSecret).update(PURPOSE).digest("hex");
}

export function isValidAdminCookie(value?: string | null) {
  const expected = adminSessionValue();
  return Boolean(expected && value && safeEqual(value, expected));
}

export function isValidAdminSecret(value?: string | null) {
  return Boolean(config.cronSecret && value && safeEqual(value, config.cronSecret));
}
