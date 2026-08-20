import Link from "next/link";
import { notFound } from "next/navigation";
import { JobWorkspace } from "@/components/platform/JobWorkspace";
import { PageHeader } from "@/components/platform/AppShell";
import { getJob, listJobRecommendations, listOutreachRequests } from "@/lib/platform/repository";

export default async function JobDetailPage({params}:{params:Promise<{id:string}>}){const {id}=await params;const [job,recommendations,outreach]=await Promise.all([getJob(id),listJobRecommendations(id),listOutreachRequests(id)]);if(!job)notFound();return <><Link href="/admin/vagas" className="mb-5 inline-flex min-h-11 items-center text-xs text-[#9eb2ff]">← Voltar para vagas</Link><PageHeader eyebrow="Central da vaga" title={job.title} description={`${job.company}${job.location?` · ${job.location}`:""} — encontre candidatos e as pessoas certas para pedir uma indicação.`}/><JobWorkspace job={job} recommendations={recommendations} outreach={outreach}/></>}
