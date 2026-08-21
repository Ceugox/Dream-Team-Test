import type { PoolClient } from "pg";
import { z } from "zod";
import { createInviteToken, hashInviteToken } from "./auth";
import { DEFAULT_ORGANIZATION_ID, query, transaction } from "./db";
import type { AdminNetworkContact, AdminNetworkInsight, AdminSourceConnection, Administrator, Invitation, Job, JobIntelligence, JobStatus, Member, NetworkRecommendation, OutreachRequest, OutreachStatus, RecommendationKind, Referral, ReferralStatus } from "./types";
import { AREA_CODES, areaLabel, inferArea, inferJobArea } from "./areaClassifier";
import { buildWhatsAppUrl, normalizePhone } from "./whatsapp";
import { createPerson, type Person } from "@/lib/domain/person";
import { parseHeadline } from "@/lib/enrichment/headline";
import { parseJobDescription } from "@/lib/matching/jobParser";
import { rankCandidates } from "@/lib/matching/scoreRegistry";
import { buildAdminRecommendations } from "./adminMatching";
import { inferJobIntelligence, inferMatchRanking } from "@/lib/inference/matching";
import { inferStructured, isInferenceConfigured } from "@/lib/inference/openrouter";
import { discoverPublicProfile } from "@/lib/enrichment/publicProfile";
import { inferNetworkCapital } from "./networkCapital";

const orgId = DEFAULT_ORGANIZATION_ID;

export async function listJobs(): Promise<Job[]> {
  return query<Job>(`SELECT j.id, j.title, j.company, j.location, j.description, j.status,
    j.created_at::text AS "createdAt", count(r.id)::int AS "referralCount"
    FROM jobs j LEFT JOIN referrals r ON r.job_id = j.id
    WHERE j.organization_id = $1 GROUP BY j.id ORDER BY j.created_at DESC`, [orgId]);
}

export async function createJob(input: { title: string; company: string; location?: string; description: string; status?: "draft" | "open" }): Promise<string> {
  const rows = await query<{ id: string }>(`INSERT INTO jobs (organization_id,title,company,location,description,status)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [orgId, input.title, input.company, input.location || null, input.description, input.status ?? "open"]);
  return rows[0].id;
}

export async function getJob(id: string): Promise<Job | null> {
  const rows = await query<Job>(`SELECT j.id,j.title,j.company,j.location,j.description,j.status,j.created_at::text AS "createdAt",
    count(r.id)::int AS "referralCount" FROM jobs j LEFT JOIN referrals r ON r.job_id=j.id
    WHERE j.id=$1 AND j.organization_id=$2 GROUP BY j.id`, [id,orgId]);
  return rows[0] ?? null;
}

export type StoredJobIntelligence = { analysis: JobIntelligence; model: string; updatedAt: string };

export async function getJobIntelligence(jobId: string): Promise<StoredJobIntelligence | null> {
  const rows = await query<StoredJobIntelligence>(`SELECT analysis,model,updated_at::text AS "updatedAt"
    FROM job_inferences WHERE job_id=$1 AND organization_id=$2`, [jobId,orgId]);
  return rows[0] ?? null;
}

async function recordInferenceRun(jobId: string, purpose: "job_analysis" | "match_rerank", model: string, usage: { promptTokens:number; completionTokens:number }): Promise<void> {
  await query(`INSERT INTO inference_runs (organization_id,job_id,purpose,model,prompt_tokens,completion_tokens)
    VALUES ($1,$2,$3,$4,$5,$6)`, [orgId,jobId,purpose,model,usage.promptTokens,usage.completionTokens]);
}

async function getOrCreateJobIntelligence(job: Job, signal?: AbortSignal): Promise<(StoredJobIntelligence & { usage:{promptTokens:number;completionTokens:number} }) | null> {
  const stored = await getJobIntelligence(job.id);
  if (stored) return {...stored,usage:{promptTokens:0,completionTokens:0}};
  if (!isInferenceConfigured()&&!process.env.GEMINI_API_KEY?.trim()) return null;
  const inferred = await inferJobIntelligence(job,signal);
  const rows = await query<StoredJobIntelligence>(`INSERT INTO job_inferences (job_id,organization_id,model,analysis)
    VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT (job_id) DO UPDATE SET model=excluded.model,analysis=excluded.analysis,updated_at=now()
    RETURNING analysis,model,updated_at::text AS "updatedAt"`, [job.id,orgId,inferred.model,JSON.stringify(inferred.data)]);
  await recordInferenceRun(job.id,"job_analysis",inferred.model,inferred.usage);
  return {...rows[0],usage:inferred.usage};
}

export async function analyzeJob(jobId:string,signal?:AbortSignal):Promise<{model:string;promptTokens:number;completionTokens:number;cached:boolean}>{
  const existing=await getJobIntelligence(jobId);if(existing)return {model:existing.model,promptTokens:0,completionTokens:0,cached:true};
  const job=await getJob(jobId);if(!job)throw new Error("JOB_NOT_FOUND");
  const intelligence=await getOrCreateJobIntelligence(job,signal);if(!intelligence)throw new Error("INFERENCE_NOT_CONFIGURED");
  return {model:intelligence.model,promptTokens:intelligence.usage.promptTokens,completionTokens:intelligence.usage.completionTokens,cached:false};
}

export async function updateJobStatus(id: string, status: JobStatus): Promise<void> {
  await query(`UPDATE jobs SET status=$1,updated_at=now() WHERE id=$2 AND organization_id=$3`, [status,id,orgId]);
}

export async function listInvitations(): Promise<Invitation[]> {
  // "expired" sai do banco: calcular na renderização chamaria Date.now() durante o render.
  return query<Invitation>(`SELECT id,email,status,expires_at::text AS "expiresAt",created_at::text AS "createdAt",
    (expires_at<now()) AS expired
    FROM invitations WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 50`, [orgId]);
}

export async function createInvitation(email?: string): Promise<{ id: string; token: string }> {
  const token = createInviteToken();
  const rows = await query<{ id: string }>(`INSERT INTO invitations (organization_id,token_hash,email,expires_at)
    VALUES ($1,$2,$3,now()+interval '7 days') RETURNING id`, [orgId, hashInviteToken(token), email?.trim().toLowerCase() || null]);
  return { id: rows[0].id, token };
}

export async function revokeInvitation(id: string): Promise<boolean> {
  const rows = await query<{ id: string }>(`UPDATE invitations SET status='revoked' WHERE id=$1 AND organization_id=$2 AND status='pending' RETURNING id`, [id, orgId]);
  return rows.length > 0;
}

export async function deleteInvitation(id: string): Promise<boolean> {
  // members.invitation_id é ON DELETE SET NULL: excluir um convite aceito mantém o membro.
  const rows = await query<{ id: string }>(`DELETE FROM invitations WHERE id=$1 AND organization_id=$2 RETURNING id`, [id, orgId]);
  return rows.length > 0;
}

export async function regenerateInvitationToken(id: string): Promise<string | null> {
  // O token só existe em claro na criação; regenerar rotaciona o hash e renova a validade.
  const token = createInviteToken();
  const rows = await query<{ id: string }>(`UPDATE invitations SET token_hash=$1,expires_at=now()+interval '7 days' WHERE id=$2 AND organization_id=$3 AND status='pending' RETURNING id`, [hashInviteToken(token), id, orgId]);
  return rows.length ? token : null;
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

export async function upsertNetworkContacts(memberId: string, contacts: Array<{name:string;headline?:string|null;profileUrl:string}>): Promise<void> {
  if (!contacts.length) return;
  await transaction(async client => {
    for (const contact of contacts) {
      await client.query(`INSERT INTO network_contacts (member_id,name,headline,linkedin_url) VALUES ($1,$2,$3,$4)
        ON CONFLICT (member_id,linkedin_url) DO UPDATE SET name=excluded.name,headline=coalesce(excluded.headline,network_contacts.headline)`, [memberId,contact.name,contact.headline||null,contact.profileUrl]);
    }
    await client.query(`UPDATE member_sources SET linkedin_status='connected',linkedin_count=(SELECT count(*) FROM network_contacts WHERE member_id=$1),updated_at=now() WHERE member_id=$1`, [memberId]);
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
  // Mesma inferência de área usada do lado do admin, injetada aqui para a camada de matching
  // continuar sem depender da plataforma.
  const areaByPerson=new Map(people.map(person=>[person.id,inferArea({headline:person.headline,profileContext:null}).area]));
  return jobs.filter(job=>job.status==="open").map(job=>{
    const profile=parseJobDescription(`${job.title} - ${job.company} - ${job.location??"Remoto"}\n${job.description}`,job.title);
    const jobArea=inferJobArea(profile);
    const sameArea=(person:{id:string})=>{const area=areaByPerson.get(person.id);return jobArea&&area?jobArea===area:null;};
    return {job,candidates:rankCandidates(people,profile,{sameArea}).slice(0,5)};
  });
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
    WHERE j.id=$2 AND j.organization_id=$1 AND j.status='open'
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
    (SELECT count(*)::int FROM jobs WHERE organization_id=$1 AND status='open') AS "activeJobs",
    (SELECT count(*)::int FROM members WHERE organization_id=$1) AS members,
    (SELECT count(*)::int FROM invitations WHERE organization_id=$1 AND status='pending' AND expires_at>now()) AS "pendingInvites",
    (SELECT count(*)::int FROM referrals WHERE organization_id=$1) AS referrals`, [orgId]);
  return rows[0];
}

export async function upsertAdministrator(input: { name: string; email: string }): Promise<Administrator> {
  const rows = await query<Administrator>(`INSERT INTO administrators (organization_id,name,email) VALUES ($1,$2,$3)
    ON CONFLICT (organization_id,email) DO UPDATE SET name=excluded.name,last_seen_at=now()
    RETURNING id,name,email,created_at::text AS "createdAt"`, [orgId,input.name.trim(),input.email.trim().toLowerCase()]);
  return rows[0];
}

export async function getAdministrator(id: string): Promise<Administrator | null> {
  const rows = await query<Administrator>(`SELECT id,name,email,created_at::text AS "createdAt" FROM administrators WHERE id=$1 AND organization_id=$2`, [id,orgId]);
  return rows[0] ?? null;
}

export async function listAdminNetworkContacts(administratorId?: string): Promise<AdminNetworkContact[]> {
  return query<AdminNetworkContact>(`SELECT c.id,c.administrator_id AS "administratorId",a.name AS "ownerName",c.name,c.headline,
    c.linkedin_url AS "linkedinUrl",c.phone,c.source,c.created_at::text AS "createdAt",c.profile_context AS "profileContext",
    c.network_capital_score AS "networkCapitalScore",c.network_capital_evidence AS "networkCapitalEvidence",c.network_capital_confidence AS "networkCapitalConfidence",
    c.public_enrichment_status AS "publicEnrichmentStatus",c.public_identity_confidence AS "publicIdentityConfidence",
    c.public_sources AS "publicSources",c.public_enriched_at::text AS "publicEnrichedAt",c.area_override AS "areaOverride"
    FROM admin_network_contacts c JOIN administrators a ON a.id=c.administrator_id
    WHERE c.organization_id=$1 AND ($2::uuid IS NULL OR c.administrator_id=$2)
    ORDER BY c.created_at DESC`, [orgId,administratorId ?? null]);
}

export async function listAdminSourceConnections(administratorId: string): Promise<AdminSourceConnection[]> {
  return query<AdminSourceConnection>(`SELECT provider,account_email AS "accountEmail",status,contact_count AS "contactCount",
    connected_at::text AS "connectedAt" FROM admin_source_connections
    WHERE organization_id=$1 AND administrator_id=$2 ORDER BY provider`, [orgId,administratorId]);
}

export async function replaceGoogleAdminNetworkContacts(administratorId: string, input: {
  accountId: string | null; accountEmail: string | null; scopes: string[];
  contacts: Array<{name:string;headline:string|null;phone:string|null;profileContext:string|null}>;
}): Promise<number> {
  return transaction(async client => {
    await client.query(`DELETE FROM admin_network_contacts WHERE organization_id=$1 AND administrator_id=$2 AND source='google'`, [orgId,administratorId]);
    let inserted=0;
    for(const contact of input.contacts){
      const phone=contact.phone ? normalizePhone(contact.phone) : null;
      const capital=inferNetworkCapital({headline:contact.headline,profileContext:contact.profileContext});
      await client.query(`INSERT INTO admin_network_contacts
        (organization_id,administrator_id,name,headline,phone,source,profile_context,network_capital_score,network_capital_evidence,network_capital_confidence)
        VALUES ($1,$2,$3,$4,$5,'google',$6,$7,$8::jsonb,$9)`,
        [orgId,administratorId,contact.name,contact.headline,phone,contact.profileContext,capital.score,JSON.stringify(capital.evidence),capital.confidence]);
      inserted++;
    }
    await client.query(`INSERT INTO admin_source_connections
      (organization_id,administrator_id,provider,external_account_id,account_email,status,contact_count,scopes,connected_at,updated_at)
      VALUES ($1,$2,'google',$3,$4,'connected',$5,$6,now(),now())
      ON CONFLICT (administrator_id,provider) DO UPDATE SET external_account_id=excluded.external_account_id,
      account_email=excluded.account_email,status='connected',contact_count=excluded.contact_count,scopes=excluded.scopes,
      connected_at=now(),updated_at=now()`, [orgId,administratorId,input.accountId,input.accountEmail,inserted,input.scopes]);
    return inserted;
  });
}

export async function replaceLinkedInAdminNetworkContacts(administratorId: string, input: {
  accountId: string | null; accountEmail: string | null; scopes: string[];
  contacts: Array<{name:string;headline:string|null;linkedinUrl?:string|null;phone:null;profileContext:string}>;
}): Promise<number> {
  return transaction(async client => {
    await client.query(`DELETE FROM admin_network_contacts WHERE organization_id=$1 AND administrator_id=$2 AND source='linkedin'`, [orgId,administratorId]);
    let inserted=0;
    for(const contact of input.contacts){
      const capital=inferNetworkCapital({headline:contact.headline,profileContext:contact.profileContext});
      await client.query(`INSERT INTO admin_network_contacts
        (organization_id,administrator_id,name,headline,linkedin_url,phone,source,profile_context,network_capital_score,network_capital_evidence,network_capital_confidence)
        VALUES ($1,$2,$3,$4,$5,NULL,'linkedin',$6,$7,$8::jsonb,$9)`,
        [orgId,administratorId,contact.name,contact.headline,contact.linkedinUrl??null,contact.profileContext,capital.score,JSON.stringify(capital.evidence),capital.confidence]);
      inserted++;
    }
    await client.query(`INSERT INTO admin_source_connections
      (organization_id,administrator_id,provider,external_account_id,account_email,status,contact_count,scopes,connected_at,updated_at)
      VALUES ($1,$2,'linkedin',$3,$4,'connected',$5,$6,now(),now())
      ON CONFLICT (administrator_id,provider) DO UPDATE SET external_account_id=excluded.external_account_id,
      account_email=excluded.account_email,status='connected',contact_count=excluded.contact_count,scopes=excluded.scopes,
      connected_at=now(),updated_at=now()`, [orgId,administratorId,input.accountId,input.accountEmail,inserted,input.scopes]);
    return inserted;
  });
}

export async function enrichAdminNetworkContacts(administratorId: string, limit = 4): Promise<{processed:number;enriched:number;unconfirmed:number;failed:number}> {
  if (!isInferenceConfigured()) throw new Error("OPENROUTER_NOT_CONFIGURED");
  const contacts = await query<Pick<AdminNetworkContact,"id"|"name"|"headline"|"linkedinUrl"|"profileContext">>(`SELECT id,name,headline,linkedin_url AS "linkedinUrl",profile_context AS "profileContext"
    FROM admin_network_contacts WHERE organization_id=$1 AND administrator_id=$2
    AND (public_enriched_at IS NULL OR public_enriched_at < now()-interval '30 days')
    ORDER BY (CASE WHEN profile_context IS NULL THEN 0 ELSE 1 END),created_at DESC LIMIT $3`, [orgId,administratorId,Math.max(1,Math.min(limit,4))]);
  let enriched=0,unconfirmed=0,failed=0;
  await Promise.all(contacts.map(async contact=>{try{const result=await enrichAdminNetworkContact(administratorId,contact.id);if(result.status==="enriched")enriched++;else unconfirmed++;}catch{failed++;}}));
  return {processed:contacts.length,enriched,unconfirmed,failed};
}

export async function enrichAdminNetworkContact(administratorId:string,contactId:string,signal?:AbortSignal):Promise<{status:"enriched"|"unconfirmed";model:string;promptTokens:number;completionTokens:number;sources:number}>{
  const rows=await query<Pick<AdminNetworkContact,"id"|"name"|"headline"|"linkedinUrl"|"profileContext">>(`SELECT id,name,headline,linkedin_url AS "linkedinUrl",profile_context AS "profileContext" FROM admin_network_contacts WHERE id=$1 AND administrator_id=$2 AND organization_id=$3`,[contactId,administratorId,orgId]);
  const contact=rows[0];if(!contact)throw new Error("CONTACT_NOT_FOUND");
  try{
    const discovery=await discoverPublicProfile(contact,signal);const sources=discovery.sources.slice(0,8).map(source=>({...source,excerpt:source.excerpt?.slice(0,700)??null}));
    if(!discovery.confirmed){await query(`UPDATE admin_network_contacts SET public_enrichment_status='unconfirmed',public_identity_confidence=$1,public_sources=$2::jsonb,public_enriched_at=now(),updated_at=now() WHERE id=$3 AND administrator_id=$4`,[discovery.identityConfidence,JSON.stringify(sources),contact.id,administratorId]);return {status:"unconfirmed",model:discovery.model,promptTokens:discovery.usage.promptTokens,completionTokens:discovery.usage.completionTokens,sources:sources.length};}
    const discoveredContext=[...discovery.education,...discovery.experience,...discovery.internationalExperience,discovery.summary].filter(Boolean).join(" · ");const profileContext=[contact.profileContext,discoveredContext&&`Descoberta pública: ${discoveredContext}`].filter(Boolean).join(" · ").slice(0,12000)||null;const headline=contact.headline||discovery.headline;const capital=inferNetworkCapital({headline,profileContext});
    await query(`UPDATE admin_network_contacts SET headline=$1,profile_context=$2,network_capital_score=$3,network_capital_evidence=$4::jsonb,network_capital_confidence=$5,public_enrichment_status='enriched',public_identity_confidence=$6,public_sources=$7::jsonb,public_enriched_at=now(),updated_at=now() WHERE id=$8 AND administrator_id=$9`,[headline,profileContext,capital.score,JSON.stringify(capital.evidence),Math.min(capital.confidence,discovery.identityConfidence),discovery.identityConfidence,JSON.stringify(sources),contact.id,administratorId]);
    return {status:"enriched",model:discovery.model,promptTokens:discovery.usage.promptTokens,completionTokens:discovery.usage.completionTokens,sources:sources.length};
  }catch(error){await query(`UPDATE admin_network_contacts SET public_enrichment_status='failed',updated_at=now() WHERE id=$1 AND administrator_id=$2`,[contact.id,administratorId]);throw error;}
}

export async function replaceAdminNetworkContacts(administratorId: string, contacts: Array<{ name:string; headline?:string|null; linkedinUrl?:string|null; phone?:string|null; source?:string; profileContext?:string|null; networkCapitalScore?:number; networkCapitalEvidence?:string[]; networkCapitalConfidence?:number }>): Promise<void> {
  await transaction(async client => {
    for (const contact of contacts) {
      if (contact.linkedinUrl) await client.query(`INSERT INTO admin_network_contacts
        (organization_id,administrator_id,name,headline,linkedin_url,phone,source,profile_context,network_capital_score,network_capital_evidence,network_capital_confidence) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
        ON CONFLICT (administrator_id,linkedin_url) WHERE linkedin_url IS NOT NULL DO UPDATE SET
        name=excluded.name,headline=coalesce(excluded.headline,admin_network_contacts.headline),phone=coalesce(excluded.phone,admin_network_contacts.phone),
        profile_context=CASE WHEN length(coalesce(excluded.profile_context,''))>length(coalesce(admin_network_contacts.profile_context,'')) THEN excluded.profile_context ELSE admin_network_contacts.profile_context END,
        network_capital_score=greatest(excluded.network_capital_score,admin_network_contacts.network_capital_score),
        network_capital_evidence=case when jsonb_array_length(excluded.network_capital_evidence)>0 then excluded.network_capital_evidence else admin_network_contacts.network_capital_evidence end,
        network_capital_confidence=greatest(excluded.network_capital_confidence,admin_network_contacts.network_capital_confidence),updated_at=now()`,
        [orgId,administratorId,contact.name,contact.headline||null,contact.linkedinUrl,contact.phone||null,contact.source??"linkedin",contact.profileContext??null,contact.networkCapitalScore??0,JSON.stringify(contact.networkCapitalEvidence??[]),contact.networkCapitalConfidence??0]);
      else await client.query(`INSERT INTO admin_network_contacts
        (organization_id,administrator_id,name,headline,phone,source,profile_context,network_capital_score,network_capital_evidence,network_capital_confidence) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
        [orgId,administratorId,contact.name,contact.headline||null,contact.phone||null,contact.source??"linkedin",contact.profileContext??null,contact.networkCapitalScore??0,JSON.stringify(contact.networkCapitalEvidence??[]),contact.networkCapitalConfidence??0]);
    }
  });
}

export async function addAdminNetworkContact(administratorId: string, contact: { name:string; headline?:string; linkedinUrl?:string; phone?:string; profileContext?:string; networkCapitalScore?:number; networkCapitalEvidence?:string[]; networkCapitalConfidence?:number }): Promise<void> {
  await query(`INSERT INTO admin_network_contacts (organization_id,administrator_id,name,headline,linkedin_url,phone,source,profile_context,network_capital_score,network_capital_evidence,network_capital_confidence)
    VALUES ($1,$2,$3,$4,$5,$6,'manual',$7,$8,$9::jsonb,$10)`, [orgId,administratorId,contact.name,contact.headline||null,contact.linkedinUrl||null,contact.phone||null,contact.profileContext||null,contact.networkCapitalScore??0,JSON.stringify(contact.networkCapitalEvidence??[]),contact.networkCapitalConfidence??0]);
}

export async function updateAdminContactPhone(administratorId: string, id: string, phone: string): Promise<void> {
  await query(`UPDATE admin_network_contacts SET phone=$1,updated_at=now() WHERE id=$2 AND administrator_id=$3 AND organization_id=$4`, [phone,id,administratorId,orgId]);
}

export async function updateAdminNetworkContact(administratorId: string, id: string, fields: { headline?:string|null; profileContext?:string|null; phone?:string|null; areaOverride?:string|null; networkCapitalScore?:number; networkCapitalEvidence?:string[]; networkCapitalConfidence?:number }): Promise<void> {
  const sets:string[]=[]; const values:unknown[]=[];
  const put=(assign:(placeholder:string)=>string, value:unknown)=>{values.push(value);sets.push(assign(`$${values.length}`));};
  if("headline" in fields) put(p=>`headline=${p}`, fields.headline??null);
  if("profileContext" in fields) put(p=>`profile_context=${p}`, fields.profileContext??null);
  if("phone" in fields) put(p=>`phone=${p}`, fields.phone??null);
  if("areaOverride" in fields) put(p=>`area_override=${p}`, fields.areaOverride??null);
  if("networkCapitalScore" in fields) put(p=>`network_capital_score=${p}`, fields.networkCapitalScore??0);
  if("networkCapitalEvidence" in fields) put(p=>`network_capital_evidence=${p}::jsonb`, JSON.stringify(fields.networkCapitalEvidence??[]));
  if("networkCapitalConfidence" in fields) put(p=>`network_capital_confidence=${p}`, fields.networkCapitalConfidence??0);
  if(!sets.length) return;
  values.push(id,administratorId,orgId);
  await query(`UPDATE admin_network_contacts SET ${sets.join(",")},updated_at=now() WHERE id=$${values.length-2} AND administrator_id=$${values.length-1} AND organization_id=$${values.length}`, values);
}

// Insight agregado da rede: estatísticas determinísticas + narrativa opcional da LLM.
// Roda no worker (background) após o sync. Barato: envia só agregados, nunca a rede inteira.
export async function generateAdminNetworkInsights(administratorId: string, signal?: AbortSignal): Promise<{ contactsCount:number; source:string; model:string|null; promptTokens:number; completionTokens:number }> {
  const contacts = await listAdminNetworkContacts(administratorId);
  const counts = new Map<string,number>();
  const areaOf = (c: AdminNetworkContact) => c.areaOverride ?? inferArea({ headline: c.headline, profileContext: c.profileContext }).area;
  for (const c of contacts) { const code = areaOf(c); if (code) counts.set(code, (counts.get(code) ?? 0) + 1); }
  const areaDistribution = AREA_CODES.map(code => ({ code, label: areaLabel(code) ?? code, count: counts.get(code) ?? 0 })).filter(a => a.count > 0).sort((a,b) => b.count - a.count);
  const phoneCoverage = contacts.length ? contacts.filter(c => c.phone).length / contacts.length : 0;
  const topConnectors = [...contacts].sort((a,b) => b.networkCapitalScore - a.networkCapitalScore).slice(0,10)
    .map(c => ({ name: c.name, area: areaLabel(areaOf(c)) ?? "—", capital: Math.round(c.networkCapitalScore*100) }));

  const topAreas = areaDistribution.slice(0,3).map(a => `${a.label} (${a.count})`);
  const missing = AREA_CODES.map(code => ({ code, label: areaLabel(code) ?? code })).filter(a => !counts.get(a.code)).map(a => a.label);
  let summary: string | null = `Rede com ${contacts.length} contatos. Áreas predominantes: ${topAreas.join(", ") || "—"}. Cobertura de telefone: ${Math.round(phoneCoverage*100)}%.`;
  let highlights: string[] = topAreas.map(a => `Forte em ${a}`);
  let gaps: string[] = missing.slice(0,5).map(a => `Sub-representado: ${a}`);
  let source = "deterministic"; let model: string | null = null; let promptTokens = 0; let completionTokens = 0;

  if (isInferenceConfigured() && contacts.length) {
    try {
      const result = await inferStructured({
        signal,
        schemaName: "network_insights",
        schema: { type:"object", additionalProperties:false, required:["summary","highlights","gaps"], properties:{ summary:{ type:"string" }, highlights:{ type:"array", items:{ type:"string" } }, gaps:{ type:"array", items:{ type:"string" } } } },
        validator: z.object({ summary: z.string(), highlights: z.array(z.string()).max(6), gaps: z.array(z.string()).max(6) }),
        system: "Você é analista de rede profissional. Com base APENAS nos dados agregados fornecidos (distribuição por área, cobertura de telefone, principais conectores por capital de rede), escreva em PT-BR: summary = 1 parágrafo curto sobre composição e força da rede; highlights = 3 a 5 pontos fortes objetivos; gaps = 3 a 5 lacunas/áreas sub-representadas para priorizar no networking. Não invente nomes nem dados fora do payload.",
        // Sem nomes no payload: o insight é agregado, então não enviamos PII ao provedor.
        payload: { contactsCount: contacts.length, areaDistribution: areaDistribution.map(a => ({ area: a.label, count: a.count })), phoneCoveragePct: Math.round(phoneCoverage*100), topConnectorCapital: topConnectors.map(t => ({ area: t.area, capital: t.capital })) },
        maxTokens: 700,
      });
      summary = result.data.summary; highlights = result.data.highlights; gaps = result.data.gaps;
      source = "llm"; model = result.model; promptTokens = result.usage.promptTokens; completionTokens = result.usage.completionTokens;
    } catch { /* mantém o insight determinístico */ }
  }

  await query(`INSERT INTO admin_network_insights (administrator_id,organization_id,contacts_count,area_distribution,phone_coverage,summary,highlights,gaps,source,model,prompt_tokens,completion_tokens,created_at)
    VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,now())
    ON CONFLICT (administrator_id) DO UPDATE SET organization_id=EXCLUDED.organization_id,contacts_count=EXCLUDED.contacts_count,area_distribution=EXCLUDED.area_distribution,phone_coverage=EXCLUDED.phone_coverage,summary=EXCLUDED.summary,highlights=EXCLUDED.highlights,gaps=EXCLUDED.gaps,source=EXCLUDED.source,model=EXCLUDED.model,prompt_tokens=EXCLUDED.prompt_tokens,completion_tokens=EXCLUDED.completion_tokens,created_at=now()`,
    [administratorId,orgId,contacts.length,JSON.stringify(areaDistribution),phoneCoverage,summary,JSON.stringify(highlights),JSON.stringify(gaps),source,model,promptTokens,completionTokens]);
  return { contactsCount: contacts.length, source, model, promptTokens, completionTokens };
}

export async function getAdminNetworkInsights(administratorId: string): Promise<AdminNetworkInsight | null> {
  const rows = await query<AdminNetworkInsight>(`SELECT contacts_count AS "contactsCount",area_distribution AS "areaDistribution",phone_coverage AS "phoneCoverage",summary,highlights,gaps,source,model,created_at::text AS "createdAt"
    FROM admin_network_insights WHERE administrator_id=$1 AND organization_id=$2`,[administratorId,orgId]);
  return rows[0] ?? null;
}

export async function replaceJobRecommendations(jobId: string, recommendations: Array<{ contactId:string; administratorId:string; kind:RecommendationKind; score:number; confidence:number; evidence:string[]; aiInsight?:string|null; aiConfidence?:number|null; inferenceModel?:string|null }>): Promise<void> {
  await transaction(async client => {
    // Upsert em vez de DELETE+INSERT: o id da recomendação precisa sobreviver ao refresh, senão
    // outreach_requests.recommendation_id (ON DELETE CASCADE) leva embora o histórico de contato.
    for (const item of recommendations) await client.query(`INSERT INTO network_recommendations
      (organization_id,job_id,contact_id,administrator_id,kind,score,confidence,evidence,ai_insight,ai_confidence,inference_model)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)
      ON CONFLICT (job_id,contact_id,kind) DO UPDATE SET administrator_id=EXCLUDED.administrator_id,
        score=EXCLUDED.score,confidence=EXCLUDED.confidence,evidence=EXCLUDED.evidence,
        ai_insight=EXCLUDED.ai_insight,ai_confidence=EXCLUDED.ai_confidence,
        inference_model=EXCLUDED.inference_model,updated_at=now()`, [orgId,jobId,item.contactId,item.administratorId,item.kind,item.score,item.confidence,JSON.stringify(item.evidence),item.aiInsight??null,item.aiConfidence??null,item.inferenceModel??null]);
    // Descarta quem saiu do ranking, mas nunca uma recomendação com outreach já preparado.
    await client.query(`DELETE FROM network_recommendations AS r
      WHERE r.job_id=$1 AND r.organization_id=$2
        AND NOT EXISTS (SELECT 1 FROM unnest($3::uuid[],$4::text[]) AS keep(contact_id,kind)
          WHERE keep.contact_id=r.contact_id AND keep.kind=r.kind)
        AND NOT EXISTS (SELECT 1 FROM outreach_requests o WHERE o.recommendation_id=r.id)`,
      [jobId,orgId,recommendations.map(item=>item.contactId),recommendations.map(item=>item.kind)]);
  });
}

// Ranking determinístico puro, sem LLM: garante que a vaga nunca nasce vazia. A fila
// refina depois com o rerank, que faz upsert por (job_id,contact_id,kind) e não apaga nada.
export async function seedJobRecommendations(jobId: string): Promise<number> {
  const job=await getJob(jobId);if(!job||job.status!=="open")return 0;
  const recommendations=buildAdminRecommendations(job,await listAdminNetworkContacts());
  await replaceJobRecommendations(jobId,recommendations);
  return recommendations.length;
}

export async function refreshAdminRecommendations(jobId: string, signal?: AbortSignal): Promise<number> {
  const job=await getJob(jobId);if(!job||job.status!=="open")return 0;
  // Escopo deliberado: vaga é da organização, então o ranking considera a rede de todos os
  // administradores dela (a UI chama isso de "rede coletiva"). O GET de /api/admin/network é
  // que é por dono, porque lá o admin edita os contatos dele. Não unificar sem decidir o produto.
  const contacts=await listAdminNetworkContacts();
  let recommendations=buildAdminRecommendations(job,contacts);
  if(isInferenceConfigured())try{
    const intelligence=await getOrCreateJobIntelligence(job,signal);
    if(intelligence&&recommendations.length){
      const contactsById=new Map(contacts.map(contact=>[contact.id,contact]));
      const candidates=recommendations.slice(0,30).map(item=>{const contact=contactsById.get(item.contactId);return {id:item.contactId,kind:item.kind,headline:contact?.headline??null,professionalContext:contact?.profileContext??null,networkCapitalEvidence:contact?.networkCapitalEvidence??[],baseScore:item.score,deterministicEvidence:item.evidence};});
      const inferred=await inferMatchRanking(job,intelligence.analysis,candidates,signal);
      const inferredById=new Map(inferred.data.map(item=>[`${item.id}:${item.kind}`,item]));
      recommendations=recommendations.map(item=>{
        const ai=inferredById.get(`${item.contactId}:${item.kind}`);if(!ai)return item;
        const missing=ai.missingInformation.length?` Informação faltante: ${ai.missingInformation.join("; ")}.`:"";
        return {...item,score:item.score*.65+ai.score*.35,confidence:item.confidence*.6+ai.confidence*.4,evidence:Array.from(new Set([...item.evidence,...ai.evidence])).slice(0,5),aiInsight:`${ai.insight}${missing}`,aiConfidence:ai.confidence,inferenceModel:inferred.model};
      }).sort((a,b)=>b.score-a.score);
      await recordInferenceRun(job.id,"match_rerank",inferred.model,inferred.usage);
    }
  }catch{/* O ranking determinístico permanece disponível quando a inferência falha. */}
  await replaceJobRecommendations(jobId,recommendations);
  return recommendations.length;
}

export async function listJobRecommendations(jobId: string): Promise<NetworkRecommendation[]> {
  return query<NetworkRecommendation>(`SELECT nr.id,nr.job_id AS "jobId",nr.contact_id AS "contactId",nr.administrator_id AS "administratorId",
    a.name AS "ownerName",c.name AS "contactName",c.headline,c.phone,nr.kind,nr.score,nr.evidence,nr.confidence,
    nr.ai_insight AS "aiInsight",nr.ai_confidence AS "aiConfidence",nr.inference_model AS "inferenceModel"
    FROM network_recommendations nr JOIN admin_network_contacts c ON c.id=nr.contact_id JOIN administrators a ON a.id=nr.administrator_id
    WHERE nr.job_id=$1 AND nr.organization_id=$2 ORDER BY nr.kind,nr.score DESC`, [jobId,orgId]);
}

export async function createOutreachRequests(adminId: string, jobId: string, items: Array<{ recommendationId:string; phone:string; kind:RecommendationKind; message:string }>): Promise<void> {
  await transaction(async client => {
    for (const item of items) {
      await client.query(`INSERT INTO outreach_requests (organization_id,job_id,recommendation_id,created_by,phone,kind,message)
        SELECT $1,$2,nr.id,$3,$4,$5,$6 FROM network_recommendations nr
        WHERE nr.id=$7 AND nr.job_id=$2 AND nr.organization_id=$1
        ON CONFLICT (job_id,recommendation_id,kind) DO UPDATE SET phone=excluded.phone,message=excluded.message,updated_at=now()`,
        [orgId,jobId,adminId,item.phone,item.kind,item.message,item.recommendationId]);
    }
  });
}

export async function listOutreachRequests(jobId: string): Promise<OutreachRequest[]> {
  const rows = await query<Omit<OutreachRequest,"whatsappUrl">>(`SELECT o.id,o.job_id AS "jobId",o.recommendation_id AS "recommendationId",
    c.name AS "contactName",o.phone,o.kind,o.message,o.status,o.created_at::text AS "createdAt"
    FROM outreach_requests o JOIN network_recommendations nr ON nr.id=o.recommendation_id JOIN admin_network_contacts c ON c.id=nr.contact_id
    WHERE o.job_id=$1 AND o.organization_id=$2 ORDER BY o.created_at DESC`, [jobId,orgId]);
  return rows.map(row=>({...row,whatsappUrl:buildWhatsAppUrl(row.phone,row.message)}));
}

export async function updateOutreach(id: string, adminId: string, input: { message?:string; status?:OutreachStatus }): Promise<void> {
  await transaction(async client => {
    const result = await client.query(`UPDATE outreach_requests SET message=coalesce($1,message),status=coalesce($2,status),updated_at=now()
      WHERE id=$3 AND organization_id=$4 AND created_by=$5 RETURNING id`, [input.message??null,input.status??null,id,orgId,adminId]);
    if (result.rowCount && input.status) await client.query(`INSERT INTO outreach_events (outreach_id,actor_id,event) VALUES ($1,$2,$3)`, [id,adminId,input.status]);
  });
}
