# Validation prospects — first wave (2026-09-30)

These are **research / interview targets**, not evidence of pain by themselves. Inclusion means the organization publicly matches the ICP strongly enough to justify qualification. Do not send outreach without explicit authorization. Do not treat a reply, interview or payment as completed until it actually happens.

## Track A — high-volume catalog / UPC cleanup

Goal: validate the narrower pre-PIM cleanup workflow with operators managing large multi-channel catalogs.

| Priority | Organization | Public fit signal | Why useful | Public route |
|---|---|---|---|---|
| A | Kyra's Deals | 20k+ SKUs managed across multiple ecommerce/retail platforms | Multi-channel catalog operations close to the hypothesis; likely recurring mapping/content cleanup | https://www.kyrasdealsllc.com/ |
| A | OneStopSKU | 10k+ SKUs; supplies Amazon, eBay and Walmart resellers; UPC-rich invoices | Strong identifier/marketplace workflow and reachable wholesale operation | https://onestopsku.com/ |
| A | AKN Wholesale | 10k+ cosmetics products across 60+ brands | Beauty catalog closely matches the original fragrance/UPC lead | https://www.aknwholesale.com/ |
| A | EDUkid | 10k+ products; 22 exclusive brands; XML product feed; CEE distribution | Large structured feed, multiple markets, geographically accessible | https://edukid.shop/ |
| A | KMT Distribution | 30k+ SKUs; 10k+ retailers | Large catalog and reseller distribution; likely recurring product-data operations | https://www.kmtdis.com/ |
| B | Alliance Pet Distribution | 10k+ SKUs; 2k+ retailers | Large multi-brand catalog and wholesale workflow | https://alliancepetdistribution.com/ |
| B | Casey's Distributing | 50k+ SKUs; 2k+ retailers; BigCommerce wholesale hub | Very strong scale, but likely more mature tooling and therefore useful counter-evidence | https://www.bigcommerce.co.uk/case-study/caseys-distributing/ |
| B | YOVO | 50k+ SKUs and 500+ retail partners | High catalog scale; qualify whether source-data cleanup is recurring | https://www.theyovo.com/wholesale |
| B | Royalty Distributors | 10k+ SKUs / 1k+ brands | Broad supplier catalog; useful for recurring feed normalization questions | https://royaltydistributors.com/ |
| B | US Wholesale Distribution | 10k+ products across Amazon/Walmart/Shopify channels | Explicit multi-channel workflow; public sales contact exists | https://uswholesaledistribution.com/ |

### First qualification question

Do **not** pitch software first.

Ask whether they regularly receive supplier/product files that require manual cleanup before publishing/importing: duplicate variants, UPC/GTIN validation, category/attribute mapping, unit normalization, or marketplace rejection fixes.

Priority becomes high only if the answer includes:
- recurring monthly/weekly cleanup;
- 10k+ active SKUs;
- measurable staff time or outsourcing cost;
- multiple channels or supplier feeds.

---

## Track B — agentic KV-cache persistence / control

Goal: learn whether a standalone managed layer has a budget **after** correct vLLM/LMCache/SGLang configuration.

### Buyer / operator targets

| Priority | Organization | Public fit signal | Why useful | Public route |
|---|---|---|---|---|
| A | cloudscale.ch | Public 2026 engineering write-up on self-hosting coding LLMs on owned GPU infrastructure | Accessible operator with coding-agent/self-hosting context and real infrastructure complexity | https://www.cloudscale.ch/en/engineering-blog/2026/05/04/self-hosting-coding-llms |
| A | Cohere | Benchmarked remote KV caching for the North platform on vLLM + CoreWeave | Real production workload and cache economics; strong counter-evidence / budget interview | https://blog.lmcache.ai/en/2025/10/29/breaking-the-memory-barrier-how-lmcache-and-coreweave-power-efficient-llm-inference-for-cohere/ |
| A | CoreWeave | Production remote-KV integration with Cohere / LMCache | Direct operator of the infrastructure boundary we are testing | same public case study above |
| A | Inferact | Co-authors vLLM AgentX and vLLM production-quality work | Deep agentic-serving practitioner; useful for validating whether a standalone gap exists | https://vllm.ai/blog/2026-09-08-vllm-agentx |
| B | Red Hat AI | Public vLLM long-context work and production adoption | Large-scale operator; harder to reach but excellent counter-evidence | https://vllm.ai/blog/2026-08-07-decode-context-parallelism |
| B | Saturn Cloud | Publicly describes cross-replica KV/cache/control-plane problems as operator responsibility | Useful mid-market infrastructure perspective | https://saturncloud.io/blog/what-an-llm-inference-stack-actually-looks-like/ |
| B | Spheron | Publishes multi-node LMCache/vLLM deployment guidance and GPU-cloud operations | Smaller infrastructure provider, potentially easier interview target | https://www.spheron.network/blog/deploy-lmcache-vllm-kv-cache-sharing-gpu-cloud/ |
| B | Cloud4U | Current production vLLM deployment/cost-optimization guidance | Infrastructure operator / consultant with exposure to multiple customer deployments | https://www.cloud4u.com/blog/vllm-production-deployment/ |

### Ecosystem interviews — not buyer evidence

These are valuable for falsifying the thesis but should **not** be counted as buyer validation:

- LMCache / TensorMesh community — production KV-cache implementation expertise.
- vLLM maintainers/community — architecture and current roadmap.
- oMLX maintainers/users — deterministic per-session cache-artifact request.
- oh-my-pi maintainers/users — cache-inefficient agent compaction report.

### First qualification question

Ask for the actual workload before discussing a product:

- inference engine;
- average / P90 context length;
- multi-turn/session duration;
- number of replicas;
- what causes cache loss;
- measured cache hit rate / TTFT;
- what they already run (LMCache, Mooncake, prefix cache, SSD tiering).

A prospect is high priority only if they can identify a **remaining** expensive failure after normal cache configuration.

---

## Portfolio execution order

For the next validation cycle:

1. Bookkeeping: continue as the most mature human-validation track, but stop broad-volume outreach.
2. Catalog/UPC: start 10 high-fit discovery contacts from the list above.
3. KV-cache: start with 5–8 practitioner conversations; do not lead with a product pitch.

No Build decision should happen until the paid-validation thresholds in VALIDATION_PLAYBOOK_V1.md are met.
