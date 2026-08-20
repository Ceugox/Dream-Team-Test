export type JobStatus = "draft" | "active" | "closed";
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
