import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

type DemandClass = "repeatable_workflow" | "custom_build" | "generic_labor";

function classifyDemand(title: string, description: string, jobs: string): DemandClass {
  const text = (title + "\n" + description + "\n" + jobs).toLowerCase();

  const repeatableWorkflow =
    /(automat(e|ion|ic)|workflow|power automate|zapier|make\.com|n8n|webhook|api integration|system integration|sync|synchroni[sz]e|dashboard|reporting|report generation|reminder|notification|monitor(ing)?|scrap(e|ing)|data extraction|ocr|batch (of )?(files|documents|images|records)|multiple (files|documents|records)|every (day|week|month|order|time)|each (order|vendor|customer|file)|recurring|repetitive|manual process|manually .{0,60}(every|each|repeat)|crm|google sheets|sharepoint|csv .{0,40}(excel|sheet)|pdf .{0,40}(word|excel|text)|document .{0,40}(convert|extract|process)|order confirmation|lead .{0,30}(enrich|collect|extract)|business metrics)/i.test(text);

  const oneOffCreativeOrLabor =
    /(logo design|graphic design|video edit|video production|animation|3d model|3d animation|voice ?over|transcription|translation|proofread|article writing|academic|research paper|tutoring|sales representative|cold calling|affiliate marketing|social media campaign|seo services?|marketing freelancer|data entry only|copy typing|virtual assistant)/i.test(text);

  const customBuild =
    /(build (a|an|the)? ?(website|web app|app|platform|game)|website development|web development|mobile app development|full[- ]stack developer|redesign|restore .{0,30}(site|website)|fix .{0,30}(bug|site|website)|firmware|embedded|game development|shopify store|wordpress site|membership website|ecommerce site|security review|penetration test)/i.test(text);

  if (repeatableWorkflow && !oneOffCreativeOrLabor) return "repeatable_workflow";
  if (customBuild || oneOffCreativeOrLabor) return oneOffCreativeOrLabor ? "generic_labor" : "custom_build";
  return "custom_build";
}

async function sha256(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async () => {
  const { data: source, error: sourceError } = await db.from("sources").upsert({
    key: "freelancer",
    name: "Freelancer",
    kind: "marketplace",
    enabled: true,
    base_url: "https://www.freelancer.com",
  }, { onConflict: "key" }).select("id").single();

  if (sourceError) {
    return new Response(JSON.stringify({ ok: false, error: sourceError.message }), { status: 500 });
  }

  const { data: run } = await db.from("collection_runs")
    .insert({
      source_id: source.id,
      collector: "freelancer",
      status: "running",
      metadata: { collector_version: "freelancer-v1.3" },
    })
    .select("id")
    .single();

  try {
    // Freelancer's project API supports full_description; use the buyer's actual
    // workflow text instead of relying only on the shortened preview.
    const endpoint =
      "https://www.freelancer.com/api/projects/0.1/projects/active/?limit=100&compact=true&job_details=true&full_description=true";
    const res = await fetch(endpoint, { headers: { "User-Agent": "OpportunityRadar/1.3" } });
    if (!res.ok) throw new Error("Freelancer " + res.status);

    const payload = await res.json();
    const relevant =
      /(javascript|typescript|react|next|node|python|api|software|web scraping|automation|workflow|power automate|zapier|n8n|chrome|browser|extension|ai |artificial intelligence|machine learning|chatgpt|llm|saas|shopify|wordpress|data processing|data extraction|ocr|devops|aws|docker|postgres|database|crm|sharepoint|google sheets)/i;

    const projects = (payload.result?.projects || [])
      .filter((p: any) => {
        const jobs = (p.jobs || []).map((j: any) => j.name || "").join(" ");
        const description = p.description || p.preview_description || "";
        return relevant.test((p.title || "") + " " + description + " " + jobs);
      })
      .slice(0, 60);

    let inserted = 0;
    const classCounts: Record<DemandClass, number> = {
      repeatable_workflow: 0,
      custom_build: 0,
      generic_labor: 0,
    };

    for (const p of projects) {
      const sign = p.currency?.sign || p.currency?.code || "$";
      const min = p.budget?.minimum ?? null;
      const max = p.budget?.maximum ?? null;
      const budget = min != null || max != null ? "Budget: " + sign + (min ?? "?") + "-" + sign + (max ?? "?") + ". " : "";
      const jobs = (p.jobs || []).map((j: any) => j.name).filter(Boolean).join(", ");
      const description = p.description || p.preview_description || "";
      const demandClass = classifyDemand(p.title || "", description, jobs);
      classCounts[demandClass]++;

      const body = (budget + description + "\nSkills: " + jobs).trim();
      const url = "https://www.freelancer.com/projects/" + (p.seo_url || p.id);
      const contentHash = await sha256((p.title || "") + "|" + body + "|" + url);
      const timestamp = p.time_submitted || p.submitdate || Math.floor(Date.now() / 1000);

      const { data, error } = await db.from("raw_items").upsert({
        source_id: source.id,
        external_id: String(p.id),
        source_url: url,
        author: null,
        title: p.title || "Freelance software project",
        body,
        published_at: new Date(timestamp * 1000).toISOString(),
        raw_payload: {
          budget: p.budget,
          currency: p.currency,
          jobs: p.jobs,
          urgent: p.urgent,
          bid_stats: p.bid_stats,
          collector: "freelancer-v1.3",
          evidence_role: "service_spend",
          demand_class: demandClass,
          full_description: Boolean(p.description),
        },
        content_hash: contentHash,
      }, { onConflict: "source_id,external_id", ignoreDuplicates: true })
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (data?.id) inserted++;
    }

    if (run?.id) {
      await db.from("collection_runs").update({
        status: "success",
        finished_at: new Date().toISOString(),
        records_seen: projects.length,
        records_inserted: inserted,
        metadata: {
          collector_version: "freelancer-v1.3",
          role: "service_spend",
          demand_classes: classCounts,
        },
      }).eq("id", run.id);
    }

    await db.from("sources").update({ last_success_at: new Date().toISOString() }).eq("id", source.id);

    return new Response(JSON.stringify({
      ok: true,
      seen: projects.length,
      inserted,
      demandClasses: classCounts,
    }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    if (run?.id) {
      await db.from("collection_runs").update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_text: error,
      }).eq("id", run.id);
    }
    return new Response(JSON.stringify({ ok: false, error }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
