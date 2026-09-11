"use server";

import { revalidatePath } from "next/cache";
import { isAdminSession } from "@/lib/auth/admin";
import { getAdminClient } from "@/lib/supabase/admin";

const STAGES = new Set(["prospect","contacted","replied","qualified","paid","delivered","lost"]);

async function requireAdmin() {
  if (!(await isAdminSession())) throw new Error("Unauthorized");
  const supabase = getAdminClient();
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

function text(form: FormData, key: string) {
  const value = String(form.get(key) || "").trim();
  return value || null;
}

export async function addContact(form: FormData) {
  const supabase = await requireAdmin();
  const experimentId = String(form.get("experimentId") || "");
  if (!experimentId) throw new Error("Missing experimentId");

  const { error } = await supabase.from("validation_contacts").insert({
    experiment_id: experimentId,
    name: text(form, "name"),
    handle: text(form, "handle"),
    company: text(form, "company"),
    source_kind: text(form, "sourceKind"),
    source_url: text(form, "sourceUrl"),
    notes: text(form, "notes"),
    stage: "prospect",
  });
  if (error) throw error;
  revalidatePath("/execution");
}

export async function updateContact(form: FormData) {
  const supabase = await requireAdmin();
  const contactId = String(form.get("contactId") || "");
  const stage = String(form.get("stage") || "prospect");
  if (!contactId || !STAGES.has(stage)) throw new Error("Invalid contact update");

  const amountRaw = String(form.get("amountPaid") || "").trim();
  const amountPaid = amountRaw ? Number(amountRaw) : 0;
  if (!Number.isFinite(amountPaid) || amountPaid < 0) throw new Error("Invalid amount");

  const { error } = await supabase.from("validation_contacts").update({
    stage,
    amount_paid: amountPaid,
    currency: text(form, "currency"),
    notes: text(form, "notes"),
  }).eq("id", contactId);
  if (error) throw error;
  revalidatePath("/execution");
}

export async function setExperimentVerdict(form: FormData) {
  const supabase = await requireAdmin();
  const experimentId = String(form.get("experimentId") || "");
  const verdict = String(form.get("verdict") || "pending");
  if (!experimentId || !new Set(["pending","pass","fail","inconclusive"]).has(verdict)) throw new Error("Invalid verdict");

  const { error } = await supabase.from("experiments").update({ verdict, ended_at: verdict === "pending" ? null : new Date().toISOString() }).eq("id", experimentId);
  if (error) throw error;
  if (verdict !== "pending") {
    const { error: applyError } = await supabase.rpc("apply_experiment_verdict", { p_experiment_id: experimentId });
    if (applyError) throw applyError;
  }
  revalidatePath("/execution");
  revalidatePath("/");
}
