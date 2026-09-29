import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

type DemandClass = "repeatable_workflow" | "custom_build" | "generic_labor";

function classifyDemand(title: string, description: string, jobs: string): DemandClass {
  const narrative = (title + "\n" + description).toLowerCase();
  const skillText = jobs.toLowerCase();

  const genericLabor =
    /(logo design|graphic design|video edit|video production|animation|3d model|3d animation|voice ?over|transcription|translation|proofread|article writing|academic|research paper|tutoring|lessons?|trainer|instructor|resume|curriculum vitae|\bcv\b|story writer|creative writing|copywriter|email marketer|email marketing|sales closer|sales partner|sales representative|cold calling|affiliate marketing|social media campaign|seo services?|marketing freelancer|copy typing|virtual assistant|discord (?:server )?(?:builder|setup))/i.test(narrative);

  const staffingRequest =
    /(job description|we are seeking|we're seeking|we are hiring|we're hiring|hiring (?:a|an|freelance)|join (our|a) team|long[- ]term role|full[- ]time role|part[- ]time role|consultant role|commission[- ]based|commission only|independent contractor|sales agents?|generalist va|virtual assistant|take full ownership of .{0,40}workflow|(?:developer|specialist|expert|partner|assistant|consultant).{0,25}(?:required|needed))/i.test(narrative);

  const nonSoftwareOrMaintenance =
    /(siemens s7|plc\b|industrial automation line|motor control|firmware|embedded systems?|cobot|robotics hardware|weekly wordpress maintenance|wordpress maintenance|routine website maintenance)/i.test(narrative);

  const abusiveAutomation =
    /(automated .{0,40}(ad viewer|ad clicking)|stream .{0,40}(ads?|views?) every day|ticket[- ]buying bot|slot (?:picking|selection) automation|mass account creation|credential stuffing)/i.test(narrative);

  const strongOperationalPain =
    /(manual process|manually .{0,70}(every|each|repeat|copy|enter|check|send|update)|recurring|repetitive|every (day|week|month|order|time)|each (order|vendor|customer|file)|routine workflows?|day[- ]to[- ]day .{0,50}(manual|work|process)|reminder|notification|keep .{0,60} in sync|synchroni[sz]e|order confirmation|report generation|scheduled report|monitor(ing)? .{0,50}(changes|status|price|data|site)|business metrics|data across .{0,80}(dashboard|report))/i.test(narrative);

  const batchTransformation =
    /((batch|multiple|dozens|hundreds|thousands|collection) .{0,80}(csv|pdf|document|file|record|image).{0,120}(convert|extract|transfer|process|clean|organize|merge|classify|copy|type))|((convert|extract|transfer|process|clean|organize|merge|classify).{0,120}(batch|multiple|dozens|hundreds|thousands|collection).{0,80}(csv|pdf|document|file|record|image))/i.test(narrative);

  const operationalIntegration =
    /((connect|integrat|sync).{0,100}(crm|sharepoint|google sheets|whatsapp|shopify|woocommerce|etsy|squarespace|payment|inventory|orders?|leads?).{0,120}(automat|workflow|sync|update|route|confirm|notify|report))|((orders?|inventory|leads?|customer data).{0,100}(sync|automat|route|confirm|update).{0,100}(crm|sharepoint|google sheets|whatsapp|shopify|woocommerce|api))/i.test(narrative);

  const automationPain =
    /(automate|automation|power automate|zapier|make\.com|n8n|workflow automation|ai workflow)/i.test(narrative);

  const dataCollectionWorkflow =
    /(web scraping|data extraction|ocr|data mining).{0,120}(regular|recurring|daily|weekly|monthly|monitor|hundreds|thousands|multiple|list of|batch)/i.test(narrative);

  const explicitProductCommission =
    /(build|develop|create|complete|commission).{0,50}(website|web app|mobile app|app\b|platform|mvp|desktop app|browser extension|bot\b|server\b|system\b)|(?:website|web app|mobile app|platform|mvp|desktop app|browser extension|bot)\s+(?:development|developer|build)/i.test(narrative);

  const repeatableWorkflow =
    !genericLabor &&
    !staffingRequest &&
    !nonSoftwareOrMaintenance &&
    !abusiveAutomation &&
    (
      strongOperationalPain ||
      batchTransformation ||
      operationalIntegration ||
      dataCollectionWorkflow ||
      (automationPain && !explicitProductCommission)
    );

  const customBuild =
    explicitProductCommission ||
    /(website development|web development|mobile app development|full[- ]stack developer|redesign|restore .{0,30}(site|website)|fix .{0,30}(bug|site|website)|game development|shopify store|wordpress site|membership website|ecommerce site|security review|penetration test|api integration)/i.test(narrative)
    || /(web development|mobile app development|game development)/i.test(skillText);

  if (repeatableWorkflow) return "repeatable_workflow";
  if (genericLabor || staffingRequest || nonSoftwareOrMaintenance || abusiveAutomation) return "generic_labor";
  if (customBuild) return "custom_build";
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
      metadata: { collector_version: "freelancer-v1.3.3" },
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
          collector: "freelancer-v1.3.3",
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
          collector_version: "freelancer-v1.3.3",
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
