import { isAdminSession } from "@/lib/auth/admin";

// In addition to SameSite=strict on the existing admin cookie, reject a
// cross-origin POST. All research mutations are server-side, never public RPC.
export async function authorizedResearchWrite(request: Request) {
  if (!(await isAdminSession())) return false;
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site") return false;
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export function researchRedirect(request: Request, message: string) {
  return new URL(`/research?message=${encodeURIComponent(message)}`, request.url);
}
