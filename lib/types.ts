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

export type OpportunityBriefRisk = {
  risk: string;
  severity: "low" | "medium" | "high";
  mitigation: string;
};

export type OpportunityBriefView = {
  readiness: "research_only" | "validate_first" | "build_candidate";
  productType?: string | null;
  buildSummary: string;
  primaryUser?: string | null;
  coreJob?: string | null;
  whyItCanWork?: string | null;
  evidenceBasis?: string | null;
  mvpFeatures: string[];
  userFlow: string[];
  nonGoals: string[];
  technicalApproach?: string | null;
  risks: OpportunityBriefRisk[];
  unknowns: string[];
  buildDaysMin?: number | null;
  buildDaysMax?: number | null;
  validationDays?: number | null;
  firstMilestone?: string | null;
  successDefinition?: string | null;
  generatedAt?: string | null;
};

export type ValidationPlanView = {
  id: string;
  hypothesis: string;
  method: string;
  audience?: string | null;
  targetSampleSize?: number | null;
  successMetric?: string | null;
  successThreshold?: string | null;
  failureThreshold?: string | null;
  stopCondition?: string | null;
  successPaidTarget?: number | null;
  successDeliveredTarget?: number | null;
  failureMaxPaid?: number | null;
  maxDays?: number | null;
  channel?: string | null;
  offer?: string | null;
  offerPrice?: number | null;
  offerCurrency?: string | null;
  outreachMessage?: string | null;
  followupMessage?: string | null;
  verdict?: string | null;
  notes?: string | null;
  contactedCount?: number;
  repliedCount?: number;
  qualifiedCount?: number;
  paidCount?: number;
  deliveredCount?: number;
  lostCount?: number;
  revenueAmount?: number;
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
  validationPlan?: ValidationPlanView | null;
  buildBrief?: OpportunityBriefView | null;
};
