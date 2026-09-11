import type { OpportunityView } from "@/lib/types";

export const demoOpportunities: OpportunityView[] = [
  { id: "demo-1", title: "Workflow exception monitor", thesis: "Teams repeatedly lose time manually detecting failed automations and reconciling missing steps.", status: "research", opportunityScore: 82, confidenceScore: 68, targetCustomer: "Small ops teams", timeToValidationDays: 4 },
  { id: "demo-2", title: "Browser-side QA assistant", thesis: "Agencies need faster repeatable checks for client sites without maintaining heavyweight test suites.", status: "watch", opportunityScore: 76, confidenceScore: 57, targetCustomer: "Web agencies", timeToValidationDays: 5 },
];
