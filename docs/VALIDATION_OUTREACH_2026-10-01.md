# Validation outreach — 2026-10-01

## Scope

First outbound batch for the two Research Inbox leads currently in **Validate**.

This batch is intentionally small and research-first. It does not claim product demand, interviews, or willingness to pay. Replies must be reviewed manually before any evidence status changes.

## Research framing used

### Catalog / UPC

The generic "CSV cleanup" category is already crowded. Current solutions cover:
- deterministic CSV validation;
- GTIN/UPC normalization;
- marketplace preflight;
- category/attribute enrichment;
- human-reviewed cleanup services.

The outreach therefore tests a narrower workflow:
**recurring supplier-feed / pre-PIM cleanup with auditability and measurable import/rejection cost**.

Primary qualification signals:
- 10k+ SKUs;
- recurring supplier files;
- multiple channels or downstream systems;
- manual normalization/validation;
- import failures/rejections;
- recurring staff or outsourcing cost.

### KV-cache / agentic inference

vLLM/LMCache/Mooncake now cover substantial parts of:
- prefix caching;
- CPU/NVMe/off-node offload;
- distributed KV reuse;
- cross-node sharing;
- tiered storage;
- cache metrics.

The outreach therefore does **not** ask whether KV caching is useful. It tests whether a meaningful operational gap remains **after correct cache configuration**, specifically:
- deterministic persistence across restart/eviction;
- cross-instance session reuse;
- cache-aware routing/affinity;
- observability;
- retention/lifecycle operations.

## Sent — Catalog / UPC

1. OneStopSKU — sam@onestopsku.com
   - 10,000+ SKUs; Amazon/eBay/Walmart seller workflows.
   - Asked about recurring UPC/GTIN, duplicate, variant, attribute and import cleanup.

2. AKN Wholesale — info@aknwholesale.com
   - 10,000+ beauty/personal-care SKUs.
   - Asked about EAN/UPC, size/unit and category normalization.

3. Alliance Pet Distribution — info@alliancepetdistribution.com
   - 10,000+ SKUs; 2,000+ retailers.
   - Asked about supplier-data cleanup before retailer/ecommerce feeds.

4. US Wholesale Distribution — sales@uswholesaledistribution.com
   - 10,000+ products; multi-channel reseller customer base.
   - Asked about identifiers, variants, categories and supplier-field cleanup.

5. Z Distribution — sales@zdistribution.com
   - 20,000+ products across 100+ brands.
   - Asked about recurring pre-PIM/ERP/ecommerce normalization.

6. Import Export Trader — info@importexport-trader.com
   - 10,000+ products in EU B2B warehouse.
   - Asked about supplier files, EAN/UPC, duplicate and attribute cleanup.

7. Fragrance Distributors EU — sales@fragrancedistributors.eu
   - 20,000+ active SKUs / hundreds of brands.
   - Closest domain match to original fragrance UPC lead.
   - Asked about EAN/UPC, sizes, supplier-file differences and import errors.

8. Econstru — hello@econstru.com
   - 20,000+ construction products / complex technical specifications.
   - Asked about identifier, unit, technical-attribute and category normalization.

9. AT Beauty Group — info@atbeautygroup.com
   - 20,000+ products / 200+ brands / structured ecommerce feeds.
   - Asked about EAN/GTIN, variants and multi-supplier normalization.

10. Floria Tech — sales@floriatech.com
    - 10,000+ computer-parts SKUs.
    - Asked about model/part numbers, technical attributes, supplier files and category mapping.

## Sent — KV-cache / agentic inference

1. Inferact — contact@inferact.ai
   - Referenced vLLM AgentX work.
   - Asked what remains painful after vLLM/LMCache/Mooncake: persistence, cross-instance reuse, routing or observability.

2. Spheron — info@spheron.network
   - Referenced their LMCache + vLLM multi-node guide.
   - Asked what remains difficult after distributed cache sharing is working.

3. Cloud4U — support@cloud4u.com
   - Referenced their 2026 production vLLM deployment guidance.
   - Asked about session cache loss across eviction/restart/scaling and requested routing to inference engineering.

4. Nebius — support@nebius.com
   - Relevant production/custom inference operator.
   - Asked about long-context recompute after cache setup and requested routing to inference engineering.

5. CoreWeave — support@coreweave.com
   - Referenced public remote-KV / LMCache production work.
   - Asked specifically for residual operational gaps after distributed reuse is configured.

## Delivery correction

Two original catalog messages hard-bounced immediately:
- Alliance Pet Distribution — info@alliancepetdistribution.com
- Z Distribution — sales@zdistribution.com

They were replaced with:
- FIZON — lion@fizonparts.com (10,000+ mobile-parts SKUs)
- MTC Parts — info@mtcparts.com (10,000+ automotive parts)

Hard bounces are not counted as outreach attempts for validation-rate calculations.

## State at send time

- Catalog valid attempts: **10**
- Catalog hard bounces replaced: **2**
- KV-cache emails sent: **5**
- Interviews completed: **0**
- Paid commitments: **0**
- Evidence promotions caused by outreach: **0**

## Response handling

For each reply, record:
- company / role;
- current workflow;
- frequency;
- quantified time/cost/delay;
- existing tools;
- unresolved gap;
- willingness to share sample / benchmark;
- willingness to take a call;
- any paid-pilot signal.

Do not count:
- generic sales replies;
- autoresponders;
- marketing content;
- vendor claims about their own tool;
- "interesting idea" without a real workflow.

## Next move

Wait for replies before scaling either list.

Catalog success signal for this first batch:
- >=2 substantive replies, with at least one describing recurring manual cleanup or import friction.

KV-cache success signal:
- >=1 substantive engineering response identifying a residual problem after normal caching/offloading setup.

If either batch returns only generic/no responses, refine ICP/contact role before increasing volume.


## Replacement catalog contacts

11. FIZON — lion@fizonparts.com
    - 10,000+ mobile-parts SKUs.
    - Asked about model/part numbers, compatibility fields, duplicate SKUs and attribute normalization.

12. MTC Parts — info@mtcparts.com
    - 10,000+ automotive parts.
    - Asked about part-number cross-references, fitment attributes, duplicate SKUs and category normalization.
