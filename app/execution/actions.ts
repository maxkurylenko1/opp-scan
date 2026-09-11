"use server";

import { revalidatePath } from "next/cache";
import { isAdminSession } from "@/lib/auth/admin";
import { getAdminClient } from "@/lib/supabase/admin";
import { generateOutreachDrafts } from "@/lib/outreach/generate";

const STAGES = new Set(["prospect","contacted","replied","qualified","paid","delivered","lost"]);
const DISCOVERY_STATES = new Set(["suggested","approved","dismissed"]);
const OUTREACH_STATES = new Set(["approved","rejected"]);

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

export async function discoverProspects() {
  const supabase = await requireAdmin();
  const { error } = await supabase.rpc("discover_validation_prospects", {
    p_limit_per_experiment: 20,
    p_min_score: 60,
  });
  if (error) throw error;
  revalidatePath("/execution");
}

export async function generateAllOutreach() {
  await requireAdmin();
  await generateOutreachDrafts(20, { autoOnly: false });
  revalidatePath("/execution");
}

export async function generateContactOutreach(form: FormData) {
  await requireAdmin();
  const contactId = String(form.get("contactId") || "");
  if (!contactId) throw new Error("Missing contactId");
  await generateOutreachDrafts(1, { force: true, contactId });
  revalidatePath("/execution");
}

export async function setOutreachState(form: FormData) {
  const supabase = await requireAdmin();
  const contactId = String(form.get("contactId") || "");
  const outreachState = String(form.get("outreachState") || "");
  if (!contactId || !OUTREACH_STATES.has(outreachState)) throw new Error("Invalid outreach state");

  const payload: Record<string, unknown> = {
    outreach_state: outreachState,
    outreach_approved_at: outreachState === "approved" ? new Date().toISOString() : null,
  };
  if (outreachState === "approved") payload.discovery_state = "approved";

  const { error } = await supabase.from("validation_contacts").update(payload).eq("id", contactId);
  if (error) throw error;
  revalidatePath("/execution");
}

export async function setDiscoveryState(form: FormData) {
  const supabase = await requireAdmin();
  const contactId = String(form.get("contactId") || "");
  const discoveryState = String(form.get("discoveryState") || "");
  if (!contactId || !DISCOVERY_STATES.has(discoveryState)) throw new Error("Invalid discovery state");

  const payload: Record<string, unknown> = { discovery_state: discoveryState };
  if (discoveryState === "dismissed") {
    payload.outreach_state = "rejected";
    payload.outreach_approved_at = null;
  }

  const { error } = await supabase
    .from("validation_contacts")
    .update(payload)
    .eq("id", contactId);
  if (error) throw error;
  revalidatePath("/execution");
}

export async function updateContact(form: FormData) {
  const supabase = await requireAdmin();
  const contactId = String(form.get("contactId") || "");
  const stage = String(form.get("stage") || "prospect");
  if (!contactId || !STAGES.has(stage)) throw new Error("Invalid contact update");

  const amountRaw = String(form.get("amountPaid") || "").trim();
  let amountPaid: number | null = amountRaw ? Number(amountRaw) : null;
  if (amountPaid != null && (!Number.isFinite(amountPaid) || amountPaid < 0)) throw new Error("Invalid amount");

  if ((stage === "paid" || stage === "delivered") && amountPaid == null) {
    const { data: contact, error: contactError } = await supabase
      .from("validation_contacts")
      .select("experiment_id,experiments!inner(offer_price)")
      .eq("id", contactId)
      .single();
    if (contactError) throw contactError;
    const experiment = Array.isArray((contact as any).experiments) ? (contact as any).experiments[0] : (contact as any).experiments;
    amountPaid = experiment?.offer_price == null ? 0 : Number(experiment.offer_price);
  }

  const payload: Record<string, unknown> = {
    stage,
    amount_paid: amountPaid ?? 0,
    currency: text(form, "currency")?.slice(0, 3).toUpperCase() || null,
    notes: text(form, "notes"),
  };
  if (stage !== "prospect") payload.discovery_state = "approved";

  const { error } = await supabase.from("validation_contacts").update(payload).eq("id", contactId);
  if (error) throw error;
  revalidatePath("/execution");
  revalidatePath("/");
}

export async function recalculateExperiment(form: FormData) {
  const supabase = await requireAdmin();
  const experimentId = String(form.get("experimentId") || "");
  if (!experimentId) throw new Error("Missing experimentId");
  const { error } = await supabase.rpc("refresh_experiment_execution", { p_experiment_id: experimentId });
  if (error) throw error;
  revalidatePath("/execution");
  revalidatePath("/");
}
