import Link from "next/link";
import { CreateJobForm } from "@/components/platform/AdminForms";
import { PageHeader } from "@/components/platform/AppShell";
import { jobStatusLabel } from "@/lib/platform/jobLifecycle";
import { listJobs } from "@/lib/platform/repository";

export default async function JobsPage({searchParams}:{searchParams:Promise<{nova?:string}>}){
  const [jobs,params]=await Promise.all([listJobs(),searchParams]);
  const showForm=params.nova==="1"||jobs.length===0;
  return <><PageHeader eyebrow="Portfólio de talentos" title="Vagas" description="Conduza cada vaga do rascunho à contratação e ative as redes certas." action={!showForm?<Link href="/admin/vagas?nova=1" className="accent-button min-h-12 content-center rounded-xl px-5 py-3 text-center text-sm font-medium">+ Nova vaga</Link>:undefined}/>{showForm&&<section className="mb-7 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5 md:p-6"><h2 className="mb-5 text-lg font-medium">Nova vaga</h2><CreateJobForm/></section>}<section className="grid gap-4 lg:grid-cols-2">{jobs.map(job=><Link key={job.id} href={`/admin/vagas/${job.id}`} className="group rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 transition hover:border-[#5064a1] sm:p-5"><div className="flex items-start justify-between gap-3 sm:gap-4"><div className="min-w-0"><span className="rounded-full bg-[#182441] px-2.5 py-1 text-[10px] text-[#9eb2ff]">{jobStatusLabel(job.status)}</span><h2 className="mt-4 text-lg font-medium break-words">{job.title}</h2><p className="mt-1 text-sm text-[var(--muted)] break-words">{job.company}{job.location?` · ${job.location}`:""}</p></div><div className="shrink-0 text-right"><p className="text-2xl">{job.referralCount}</p><p className="text-[10px] text-[var(--muted)]">indicações</p></div></div><p className="mt-5 line-clamp-3 text-xs leading-5 text-[#aeb4c0]">{job.description}</p><p className="mt-4 text-xs text-[#9eb2ff]">Abrir central da vaga →</p></Link>)}</section></>;
}
