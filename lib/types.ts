export type CompetitorView = {
  name: string;
  url?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
  currency?: string | null;
  billingPeriod?: string | null;
  strengths?: string[];
  weaknesses?: string[];
  evidenceUrl?: string | null;
};

export type MarketEvidenceView = {
  claimType: string;
  sourceUrl?: string | null;
  excerpt?: string | null;
  evidenceWeight: number;
};

export type OpportunityView = {
  id: string;
  title: string;
  thesis: string;
  status: string;
  origin?: "theme" | "exact";
  opportunityScore: number;
  confidenceScore: number;
  targetCustomer?: string | null;
  timeToValidationDays?: number | null;
  whyNow?: string | null;
  biggestRisk?: string | null;
  mvpScope?: string | null;
  acquisitionChannel?: string | null;
  validationExperiment?: string | null;
  pricingHypothesis?: string | null;
  marketSummary?: string | null;
  marketResearchedAt?: string | null;
  competitors?: CompetitorView[];
  marketEvidence?: MarketEvidenceView[];
};
