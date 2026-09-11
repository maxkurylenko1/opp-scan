import { config } from "@/lib/config";
import { getAdminClient } from "@/lib/supabase/admin";

const MODEL = "gpt-5.6-luna";
const VALIDATION_VERSION = "validation-v1.5";

type ValidationPlan = {
  hypothesis: string;
  method: string;
  audience: string;
  target_sample_size: number;
  success_metric: string;
  success_threshold: string;
  failure_threshold: string;
  stop_condition: string;
  success_paid_target: number;
  success_delivered_target: number;
  failure_max_paid: number;
  max_days: number;
  channel: string;
  offer: string;
  offer_price: number | null;
  offer_currency: string | null;
  outreach_message: string;
  followup_message: string;
  notes: string;
};

function extractOutputText(response: any) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) return response.output_text;
  for (const item of response?.output || []) {
    if (item?.type !== "message") continue;
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  throw new Error("OpenAI response did not contain output text");
}

async function callPlanner(opportunity: any, competitors: any[]) {
  if (!config.openAiKey) throw new Error("OPENAI_API_KEY is not configured");

  const competitorSummary = competitors.length
    ? competitors.map((c) => {
        const price = c.price_min != null || c.price_max != null
          ? `${c.currency || ""} ${c.price_min ?? "?"}${c.price_max != null && c.price_max !== c.price_min ? `-${c.price_max}` : ""}${c.billing_period ? ` / ${c.billing_period}` : ""}`.trim()
          : "price unknown";
        return `- ${c.name}: ${price}`;
      }).join("\n")
    : "- No verified competitors/prices yet";

  const prompt = `Create ONE concrete paid validation experiment for this product opportunity.\n\nOpportunity: ${opportunity.title}\nThesis: ${opportunity.thesis}\nPain: ${opportunity.pain_summary || "unknown"}\nWhy now: ${opportunity.why_now || "unknown"}\nPricing hypothesis: ${opportunity.pricing_hypothesis || "none"}\nAcquisition channel: ${opportunity.acquisition_channel || "unknown"}\nBiggest risk: ${opportunity.biggest_risk || "unknown"}\nOpportunity score: ${opportunity.opportunity_score}/100\nConfidence: ${opportunity.confidence_score}/100\n\nVerified competitors/pricing:\n${competitorSummary}\n\nRules:\n- Optimize for learning willingness-to-pay, not compliments or survey opinions.\n- Prefer a paid concierge/manual pilot before building software.\n- The experiment must be runnable by one technical founder in <=14 days and usually <=7 days.\n- Use a realistic offer price grounded in the pricing evidence. If there is not enough basis for a price, use null rather than inventing precision.\n- target_sample_size means number of qualified prospects contacted or offered the pilot, not anonymous traffic.\n- success_threshold must be observable and binary enough to make a decision.\n- failure_threshold must clearly say when NOT to build.\n- success_paid_target is the minimum number of paid customers needed to pass.\n- success_delivered_target is the minimum number of successfully delivered paid pilots needed to pass.\n- failure_max_paid is the maximum paid customers allowed after the full target_sample_size is contacted for an automatic fail.\n- outreach_message must be concise, human, and ready to send; no hype, no fake claims, no pretending the product already exists.\n- followup_message should be one short follow-up after no reply.\n- stop_condition protects time/money from endless validation.\n- Do not recommend building an MVP before attempting the paid offer.`;

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      hypothesis: { type: "string" }, method: { type: "string" }, audience: { type: "string" },
      target_sample_size: { type: "integer", minimum: 5, maximum: 50 },
      success_metric: { type: "string" }, success_threshold: { type: "string" }, failure_threshold: { type: "string" }, stop_condition: { type: "string" },
      success_paid_target: { type: "integer", minimum: 1, maximum: 10 },
      success_delivered_target: { type: "integer", minimum: 0, maximum: 10 },
      failure_max_paid: { type: "integer", minimum: 0, maximum: 9 },
      max_days: { type: "integer", minimum: 1, maximum: 14 },
      channel: { type: "string" }, offer: { type: "string" }, offer_price: { type: ["number", "null"], minimum: 0 }, offer_currency: { type: ["string", "null"] },
      outreach_message: { type: "string" }, followup_message: { type: "string" }, notes: { type: "string" },
    },
    required: ["hypothesis","method","audience","target_sample_size","success_metric","success_threshold","failure_threshold","stop_condition","success_paid_target","success_delivered_target","failure_max_paid","max_days","channel","offer","offer_price","offer_currency","outreach_message","followup_message","notes"],
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.openAiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, store: false, reasoning: { effort: "low" }, input: prompt, max_output_tokens: 1900, text: { verbosity: "low", format: { type: "json_schema", name: "paid_validation_plan", strict: true, schema } } }),
  });
  if (!response.ok) throw new Error(`OpenAI validation planner failed: ${response.status} ${await response.text()}`);
  const body = await response.json();
  return JSON.parse(extractOutputText(body)) as ValidationPlan;
}

export async function generateValidationPlans(limit = 3, force = false) {
  const supabase = getAdminClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const { data: opportunities, error } = await supabase
    .from("opportunities")
    .select("id,title,thesis,pain_summary,why_now,pricing_hypothesis,acquisition_channel,biggest_risk,opportunity_score,confidence_score,status,theme_id")
    .not("theme_id", "is", null)
    .in("status", ["research", "validate"])
    .gte("confidence_score", 55)
    .gte("opportunity_score", 45)
    .order("opportunity_score", { ascending: false })
    .limit(Math.max(1, Math.min(limit * 3, 20)));
  if (error) throw error;

  const selected: any[] = [];
  for (const opportunity of opportunities || []) {
    const { data: existing, error: existingError } = await supabase
      .from("experiments")
      .select("id,verdict")
      .eq("opportunity_id", opportunity.id)
      .eq("validation_version", VALIDATION_VERSION)
      .maybeSingle();
    if (existingError) throw existingError;

    let contactCount = 0;
    if (existing?.id) {
      const { count, error: contactsError } = await supabase
        .from("validation_contacts")
        .select("id", { count: "exact", head: true })
        .eq("experiment_id", existing.id);
      if (contactsError) throw contactsError;
      contactCount = count || 0;
    }

    if (contactCount > 0) continue;
    if (force || !existing) selected.push(opportunity);
    if (selected.length >= Math.max(1, Math.min(limit, 5))) break;
  }

  const generated: any[] = [];
  for (const opportunity of selected) {
    const { data: competitors, error: competitorError } = await supabase
      .from("competitors")
      .select("name,price_min,price_max,currency,billing_period")
      .eq("opportunity_id", opportunity.id)
      .order("observed_at", { ascending: false })
      .limit(8);
    if (competitorError) throw competitorError;

    const plan = await callPlanner(opportunity, competitors || []);
    const currency = plan.offer_currency ? plan.offer_currency.slice(0, 3).toUpperCase() : null;
    const failureMaxPaid = Math.min(plan.failure_max_paid, Math.max(0, plan.success_paid_target - 1));

    const payload = {
      opportunity_id: opportunity.id,
      validation_version: VALIDATION_VERSION,
      hypothesis: plan.hypothesis.slice(0, 2000), method: plan.method.slice(0, 4000), audience: plan.audience.slice(0, 2000),
      target_sample_size: plan.target_sample_size, success_metric: plan.success_metric.slice(0, 1000), success_threshold: plan.success_threshold.slice(0, 1000),
      failure_threshold: plan.failure_threshold.slice(0, 1000), stop_condition: plan.stop_condition.slice(0, 1000),
      success_paid_target: plan.success_paid_target, success_delivered_target: plan.success_delivered_target, failure_max_paid: failureMaxPaid,
      success_paid_count: plan.success_paid_target, success_delivered_count: plan.success_delivered_target,
      failure_contact_limit: plan.target_sample_size, failure_paid_below_count: failureMaxPaid + 1,
      execution_state: "not_started",
      max_days: plan.max_days, channel: plan.channel.slice(0, 500), offer: plan.offer.slice(0, 3000), offer_price: plan.offer_price, offer_currency: currency,
      outreach_message: plan.outreach_message.slice(0, 3000), followup_message: plan.followup_message.slice(0, 2000), notes: plan.notes.slice(0, 3000),
      verdict: "pending", generated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };

    const { data: experiment, error: upsertError } = await supabase.from("experiments").upsert(payload, { onConflict: "opportunity_id,validation_version" }).select("id").single();
    if (upsertError) throw upsertError;

    const summary = `${plan.method} Success: ${plan.success_threshold} Failure: ${plan.failure_threshold}`.slice(0, 4000);
    const { error: opportunityError } = await supabase.from("opportunities").update({ validation_experiment: summary, updated_at: new Date().toISOString() }).eq("id", opportunity.id);
    if (opportunityError) throw opportunityError;

    generated.push({ opportunityId: opportunity.id, experimentId: experiment.id, title: opportunity.title, price: plan.offer_price, currency, sampleSize: plan.target_sample_size, maxDays: plan.max_days });
  }

  return { model: MODEL, validationVersion: VALIDATION_VERSION, generated: generated.length, experiments: generated };
}
