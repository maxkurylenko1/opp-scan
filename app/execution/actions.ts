"use server";

import { revalidatePath } from "next/cache";
import { isAdminSession } from "@/lib/auth/admin";
import { getAdminClient } from "@/lib/supabase/admin";

const STAGES = new Set(["new","contacted","replied","qualified","paid","delivered","lost"]);

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

export async function addLead(form: FormData) {
  const supabase = await requireAdmin();
  const experimentId = String(form.get("experimentId") || "");
  if (!experimentId) throw new Error("Missing experimentId");

  const name = text(form, "name") || text(form, "contactDetail") || "Unnamed prospect";
  const { error } = await supabase.from("validation_leads").insert({
    experiment_id: experimentId,
    name,
    source: text(form, "source"),
    profile_url: text(form, "profileUrl"),
    contact_detail: text(form, "contactDetail"),
    notes: text(form, "notes"),
    status: "new",
  });
  if (error) throw error;
  revalidatePath("/execution");
}

export async function updateLead(form: FormData) {
  const supabase = await requireAdmin();
  const leadId = String(form.get("leadId") || "");
  const status = String(form.get("status") || "new");
  if (!leadId || !STAGES.has(status)) throw new Error("Invalid lead update");

  const amountRaw = String(form.get("paidAmount") || "").trim();
  let paidAmount: number | null = amountRaw ? Number(amountRaw) : null;
  if (paidAmount != null && (!Number.isFinite(paidAmount) || paidAmount < 0)) throw new Error("Invalid amount");

  if ((status === "paid" || status === "delivered") && paidAmount == null) {
    const { data: lead, error: leadError } = await supabase
      .from("validation_leads")
      .select("experiment_id,experiments!inner(offer_price)")
      .eq("id", leadId)
      .single();
    if (leadError) throw leadError;
    const experiment = Array.isArray((lead as any).experiments) ? (lead as any).experiments[0] : (lead as any).experiments;
    paidAmount = experiment?.offer_price == null ? null : Number(experiment.offer_price);
  }

  const { error } = await supabase.from("validation_leads").update({
    status,
    paid_amount: paidAmount,
    paid_currency: text(form, "currency")?.slice(0, 3).toUpperCase() || null,
    notes: text(form, "notes"),
  }).eq("id", leadId);
  if (error) throw error;
  revalidatePath("/execution");
  revalidatePath("/");
}

export async function recalculateExperiment(form: FormData) {
  const supabase = await requireAdmin();
  const experimentId = String(form.get("experimentId") || "");
  if (!experimentId) throw new Error("Missing experimentId");
  const { error } = await supabase.rpc("radar_refresh_experiment_execution", { p_experiment_id: experimentId });
  if (error) throw error;
  revalidatePath("/execution");
  revalidatePath("/");
}
