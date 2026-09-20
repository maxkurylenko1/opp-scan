"use server";

import { revalidatePath } from "next/cache";
import { isAdminSession } from "@/lib/auth/admin";
import { generateOpportunityBriefs } from "@/lib/opportunities/build-brief";

export async function refreshOpportunityBrief(form: FormData) {
  if (!(await isAdminSession())) throw new Error("Unauthorized");
  const opportunityId = String(form.get("opportunityId") || "");
  if (!opportunityId) throw new Error("Missing opportunityId");
  await generateOpportunityBriefs(1, true, [opportunityId]);
  revalidatePath(`/opportunities/${opportunityId}`);
}
