"use server";

import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/auth/admin";
import { runManualScan } from "@/lib/scans/run";

export async function runManualScanAction() {
  if (!(await isAdminSession())) throw new Error("Unauthorized");
  const result = await runManualScan();
  redirect(`/admin/scans/${result.id}`);
}
