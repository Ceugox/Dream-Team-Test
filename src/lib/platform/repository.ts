import type { PoolClient } from "pg";
import { createInviteToken, hashInviteToken } from "./auth";
import { DEFAULT_ORGANIZATION_ID, query, transaction } from "./db";
import type { Invitation, Job, Member, Referral, ReferralStatus } from "./types";
import { createPerson, type Person } from "@/lib/domain/person";
import { parseHeadline } from "@/lib/enrichment/headline";
import { parseJobDescription } from "@/lib/matching/jobParser";
import { rankCandidates } from "@/lib/matching/scoreRegistry";

const orgId = DEFAULT_ORGANIZATION_ID;

export async function listJobs(): Promise<Job[]> {
  return query<Job>(`SELECT j.id, j.title, j.company, j.location, j.description, j.status,
    j.created_at::text AS "createdAt", count(r.id)::int AS "referralCount"
    FROM jobs j LEFT JOIN referrals r ON r.job_id = j.id
    WHERE j.organization_id = $1 GROUP BY j.id ORDER BY j.created_at DESC`, [orgId]);
}

export async function createJob(input: { title: string; company: string; location?: string; description: string }): Promise<string> {
  const rows = await query<{ id: string }>(`INSERT INTO jobs (organization_id,title,company,location,description,status)
    VALUES ($1,$2,$3,$4,$5,'active') RETURNING id`, [orgId, input.title, input.company, input.location || null, input.description]);
  return rows[0].id;
}

export async function listInvitations(): Promise<Invitation[]> {
  return query<Invitation>(`SELECT id,email,status,expires_at::text AS "expiresAt",created_at::text AS "createdAt"
    FROM invitations WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 50`, [orgId]);
}

export async function createInvitation(email?: string): Promise<{ id: string; token: string }> {
  const token = createInviteToken();
  const rows = await query<{ id: string }>(`INSERT INTO invitations (organization_id,token_hash,email,expires_at)
    VALUES ($1,$2,$3,now()+interval '7 days') RETURNING id`, [orgId, hashInviteToken(token), email?.trim().toLowerCase() || null]);
  return { id: rows[0].id, token };
}

export async function getInvitation(token: string): Promise<{ id: string; email: string | null; status: string; expiresAt: string } | null> {
  const rows = await query<{ id: string; email: string | null; status: string; expiresAt: string }>(`SELECT id,email,status,expires_at::text AS "expiresAt"
    FROM invitations WHERE token_hash=$1 AND organization_id=$2`, [hashInviteToken(token), orgId]);
  return rows[0] ?? null;
}

export async function acceptInvitation(token: string, input: { name: string; email: string }): Promise<{ memberId: string; organizationId: string }> {
  return transaction(async (client: PoolClient) => {
    const invitationResult = await client.query<{ id: string; email: string | null; status: string; expires_at: Date }>(`SELECT id,email,status,expires_at
      FROM invitations WHERE token_hash=$1 AND organization_id=$2 FOR UPDATE`, [hashInviteToken(token), orgId]);
    const invitation = invitationResult.rows[0];
    if (!invitation || invitation.status !== "pending" || invitation.expires_at.getTime() < Date.now()) throw new Error("INVITATION_INVALID");
    const email = input.email.trim().toLowerCase();
    if (invitation.email && invitation.email !== email) throw new Error("EMAIL_MISMATCH");
    const memberResult = await client.query<{ id: string }>(`INSERT INTO members (organization_id,invitation_id,name,email)
      VALUES ($1,$2,$3,$4) ON CONFLICT (organization_id,email) DO UPDATE SET name=excluded.name,last_seen_at=now() RETURNING id`,
      [orgId, invitation.id, input.name.trim(), email]);
    await client.query(`INSERT INTO member_sources (member_id) VALUES ($1) ON CONFLICT (member_id) DO NOTHING`, [memberResult.rows[0].id]);
    await client.query(`UPDATE invitations SET status='accepted',accepted_at=now() WHERE id=$1`, [invitation.id]);
    return { memberId: memberResult.rows[0].id, organizationId: orgId };
  });
}

export async function listMembers(): Promise<Member[]> {
  return query<Member>(`SELECT m.id,m.name,m.email,m.created_at::text AS "createdAt",
    s.linkedin_status AS "linkedinStatus",s.linkedin_count AS "linkedinCount",
    s.google_contacts_status AS "contactsStatus",s.google_calendar_status AS "calendarStatus"
    FROM members m LEFT JOIN member_sources s ON s.member_id=m.id
    WHERE m.organization_id=$1 ORDER BY m.created_at DESC`, [orgId]);
}

export async function getMember(memberId: string): Promise<Member | null> {
  const rows = await query<Member>(`SELECT m.id,m.name,m.email,m.created_at::text AS "createdAt",
    s.linkedin_status AS "linkedinStatus",s.linkedin_count AS "linkedinCount",
    s.google_contacts_status AS "contactsStatus",s.google_calendar_status AS "calendarStatus"
    FROM members m LEFT JOIN member_sources s ON s.member_id=m.id WHERE m.id=$1 AND m.organization_id=$2`, [memberId, orgId]);
  return rows[0] ?? null;
}

export async function updateLinkedInSource(memberId: string, count: number): Promise<void> {
  await query(`UPDATE member_sources SET linkedin_status='connected',linkedin_count=$1,updated_at=now() WHERE member_id=$2`, [count, memberId]);
}

export async function replaceNetworkContacts(memberId: string, contacts: Array<{name:string;headline:string;profileUrl:string}>): Promise<void> {
  await transaction(async client => {
    await client.query(`DELETE FROM network_contacts WHERE member_id=$1`, [memberId]);
    for (const contact of contacts) {
      await client.query(`INSERT INTO network_contacts (member_id,name,headline,linkedin_url) VALUES ($1,$2,$3,$4)
        ON CONFLICT (member_id,linkedin_url) DO UPDATE SET name=excluded.name,headline=excluded.headline`, [memberId,contact.name,contact.headline||null,contact.profileUrl]);
    }
    await client.query(`UPDATE member_sources SET linkedin_status='connected',linkedin_count=$1,updated_at=now() WHERE member_id=$2`, [contacts.length,memberId]);
  });
}

export type RankedOpportunity = { job: Job; candidates: Array<Person & { referralEvidence:string[] }> };
export async function listRankedOpportunities(memberId: string): Promise<RankedOpportunity[]> {
  const [jobs,contacts] = await Promise.all([
    listJobs(),
    query<{name:string;headline:string|null;linkedinUrl:string}>(`SELECT name,headline,linkedin_url AS "linkedinUrl" FROM network_contacts WHERE member_id=$1`,[memberId]),
  ]);
  const people = contacts.map(contact => {
    const parsed = parseHeadline(contact.headline);
    return createPerson({id:`linkedin:${contact.linkedinUrl}`,name:contact.name,headline:contact.headline,linkedinUrl:contact.linkedinUrl,currentRole:parsed.role,currentCompany:parsed.company,sources:["linkedin"]});
  });
  return jobs.filter(job=>job.status==="active").map(job=>({job,candidates:rankCandidates(people,parseJobDescription(`${job.title} - ${job.company} - ${job.location??"Remoto"}\n${job.description}`,job.title)).slice(0,5)}));
}

export async function updateGoogleSource(memberId: string, source: "contacts" | "calendar"): Promise<void> {
  const column = source === "contacts" ? "google_contacts_status" : "google_calendar_status";
  await query(`UPDATE member_sources SET ${column}='connected',updated_at=now() WHERE member_id=$1`, [memberId]);
}

export async function listReferrals(): Promise<Referral[]> {
  return query<Referral>(`SELECT r.id,r.job_id AS "jobId",j.title AS "jobTitle",r.member_id AS "memberId",m.name AS "memberName",
    r.candidate_name AS "candidateName",r.candidate_headline AS "candidateHeadline",r.linkedin_url AS "linkedinUrl",
    r.relationship_note AS "relationshipNote",r.status,r.created_at::text AS "createdAt"
    FROM referrals r JOIN jobs j ON j.id=r.job_id JOIN members m ON m.id=r.member_id
    WHERE r.organization_id=$1 ORDER BY r.created_at DESC`, [orgId]);
}

export async function submitReferral(memberId: string, input: { jobId: string; candidateName: string; candidateHeadline?: string | null; linkedinUrl?: string | null; relationshipNote?: string }): Promise<void> {
  const result = await query<{ id: string }>(`INSERT INTO referrals (organization_id,job_id,member_id,candidate_name,candidate_headline,linkedin_url,relationship_note,consented_fields)
    SELECT $1,j.id,$3,c.name,c.headline,c.linkedin_url,$5,$6::jsonb
    FROM jobs j JOIN network_contacts c ON c.member_id=$3 AND c.linkedin_url=$4
    WHERE j.id=$2 AND j.organization_id=$1 AND j.status='active'
    ON CONFLICT (job_id,member_id,linkedin_url) WHERE linkedin_url IS NOT NULL
    DO UPDATE SET relationship_note=excluded.relationship_note,updated_at=now()
    RETURNING id`, [orgId,input.jobId,memberId,input.linkedinUrl||null,input.relationshipNote||null,JSON.stringify({name:true,headline:!!input.candidateHeadline,linkedin:!!input.linkedinUrl,note:!!input.relationshipNote})]);
  if (result.length === 0) throw new Error("REFERRAL_NOT_ALLOWED");
}

export async function updateReferralStatus(id: string, status: ReferralStatus): Promise<void> {
  await query(`UPDATE referrals SET status=$1,updated_at=now() WHERE id=$2 AND organization_id=$3`, [status,id,orgId]);
}

export async function dashboardMetrics(): Promise<{ activeJobs: number; members: number; pendingInvites: number; referrals: number }> {
  const rows = await query<{ activeJobs: number; members: number; pendingInvites: number; referrals: number }>(`SELECT
    (SELECT count(*)::int FROM jobs WHERE organization_id=$1 AND status='active') AS "activeJobs",
    (SELECT count(*)::int FROM members WHERE organization_id=$1) AS members,
    (SELECT count(*)::int FROM invitations WHERE organization_id=$1 AND status='pending' AND expires_at>now()) AS "pendingInvites",
    (SELECT count(*)::int FROM referrals WHERE organization_id=$1) AS referrals`, [orgId]);
  return rows[0];
}
