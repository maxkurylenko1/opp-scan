"use server";

import { revalidatePath } from "next/cache";
import { isAdminSession } from "@/lib/auth/admin";
import { getAdminClient } from "@/lib/supabase/admin";

const STAGES = new Set(["prospect","contacted","replied","qualified","paid","delivered","lost"]);
const DISCOVERY_STATES = new Set(["suggested","approved","dismissed"]);

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

export async function setDiscoveryState(form: FormData) {
  const supabase = await requireAdmin();
  const contactId = String(form.get("contactId") || "");
  const discoveryState = String(form.get("discoveryState") || "");
  if (!contactId || !DISCOVERY_STATES.has(discoveryState)) throw new Error("Invalid discovery state");

  const { error } = await supabase
    .from("validation_contacts")
    .update({ discovery_state: discoveryState })
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
