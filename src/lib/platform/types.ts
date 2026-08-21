export type JobStatus = "draft" | "open" | "screening" | "interviewing" | "offer" | "filled" | "paused" | "cancelled";
export type ReferralStatus = "submitted" | "reviewing" | "contacted" | "declined" | "hired";

export type Job = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  description: string;
  status: JobStatus;
  createdAt: string;
  referralCount: number;
};

export type JobIntelligence = {
  summary: string; coreSkills: string[]; adjacentRoles: string[]; industries: string[];
  seniority: string; missingInformation: string[];
};

export type Invitation = {
  id: string;
  email: string | null;
  status: "pending" | "accepted" | "revoked";
  expiresAt: string;
  createdAt: string;
};

export type Member = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  linkedinStatus: string;
  linkedinCount: number;
  contactsStatus: string;
  calendarStatus: string;
};

export type Referral = {
  id: string;
  jobId: string;
  jobTitle: string;
  memberId: string;
  memberName: string;
  candidateName: string;
  candidateHeadline: string | null;
  linkedinUrl: string | null;
  relationshipNote: string | null;
  status: ReferralStatus;
  createdAt: string;
};

export type Administrator = { id: string; name: string; email: string; createdAt: string };
export type AdminSourceConnection = {
  provider: "google" | "linkedin"; accountEmail: string | null; status: "connected" | "error" | "revoked";
  contactCount: number; connectedAt: string;
};
export type AdminNetworkContact = {
  id: string; administratorId: string; ownerName: string; name: string; headline: string | null;
  linkedinUrl: string | null; phone: string | null; source: string; createdAt: string; profileContext: string | null;
  networkCapitalScore: number; networkCapitalEvidence: string[]; networkCapitalConfidence: number;
  publicEnrichmentStatus: "pending" | "enriched" | "unconfirmed" | "failed";
  publicIdentityConfidence: number; publicSources: Array<{url:string;title:string;excerpt:string|null}>; publicEnrichedAt: string | null;
  areaOverride: string | null;
};
export type RecommendationKind = "candidate_fit" | "connector_fit";
export type NetworkRecommendation = {
  id: string; jobId: string; contactId: string; administratorId: string; ownerName: string;
  contactName: string; headline: string | null; phone: string | null; kind: RecommendationKind;
  score: number; evidence: string[]; confidence: number; aiInsight: string | null;
  aiConfidence: number | null; inferenceModel: string | null;
};
export type OutreachStatus = "prepared" | "opened" | "manually_confirmed_sent" | "replied" | "referred" | "no_response" | "cancelled";
export type OutreachRequest = {
  id: string; jobId: string; recommendationId: string; contactName: string; phone: string;
  kind: RecommendationKind; message: string; status: OutreachStatus; whatsappUrl: string; createdAt: string;
};
