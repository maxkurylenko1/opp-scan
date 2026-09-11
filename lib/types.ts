export type OpportunityView = {
  id: string;
  title: string;
  thesis: string;
  status: string;
  opportunityScore: number;
  confidenceScore: number;
  targetCustomer?: string | null;
  timeToValidationDays?: number | null;
  whyNow?: string | null;
  biggestRisk?: string | null;
  mvpScope?: string | null;
  acquisitionChannel?: string | null;
  validationExperiment?: string | null;
};
