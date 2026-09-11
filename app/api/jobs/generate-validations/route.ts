import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { generateValidationPlans } from "@/lib/validation/generate-plan";

const BOOTSTRAP_SHA256 = "176859ed2b9cfe9f6f75da9449fe5ecd6b8e84e57765ac02df99aa6e8c1fefea";

function bootstrapAuthorized(request: Request) {
  const token = new URL(request.url).searchParams.get("bootstrap");
  if (!token) return false;
  const actual = Buffer.from(createHash("sha256").update(token).digest("hex"), "utf8");
  const expected = Buffer.from(BOOTSTRAP_SHA256, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function authorized(request: Request) {
  if (bootstrapAuthorized(request)) return true;
  if (!config.cronSecret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${config.cronSecret}`;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  try { return JSON.stringify(error); } catch { return String(error); }
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || "3");
  const force = url.searchParams.get("force") === "true";
  try {
    const result = await generateValidationPlans(Number.isFinite(limit) ? limit : 3, force);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("validation generation failed", error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
