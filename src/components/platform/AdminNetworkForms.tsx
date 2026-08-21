"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const field="w-full rounded-xl border border-[var(--line)] bg-[#0b0d12] px-4 py-3 text-white placeholder:text-[#616876]";

const AREA_OPTIONS: Array<{ code:string; label:string }> = [
  { code:"eng_software", label:"Engenharia de Software" }, { code:"dados_ia", label:"Dados & IA/ML" },
  { code:"produto", label:"Produto" }, { code:"design", label:"Design" },
  { code:"growth_mkt", label:"Growth & Marketing" }, { code:"vendas", label:"Vendas & GTM" },
  { code:"financas", label:"Finanças & Investimentos" }, { code:"talent_rh", label:"RH & Talent" },
  { code:"consultoria", label:"Consultoria & Estratégia" }, { code:"juridico", label:"Jurídico" },
  { code:"operacoes", label:"Operações" }, { code:"academia", label:"Academia & Pesquisa" },
];

export function EditContact({ id, headline, profileContext, phone, areaOverride }: { id:string; headline:string|null; profileContext:string|null; phone:string|null; areaOverride:string|null }) {
  const router=useRouter();
  const [open,setOpen]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    const data=Object.fromEntries(new FormData(event.currentTarget)) as Record<string,string>;
    setLoading(true);setError("");
    const body={ id, headline:data.headline??"", profileContext:data.profileContext??"", phone:data.phone??"", areaOverride:data.areaOverride?data.areaOverride:null };
    const response=await fetch("/api/admin/network",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    if(!response.ok){setError("Não foi possível salvar. Confira o telefone (com DDI/DDD) e tente de novo.");setLoading(false);return;}
    setLoading(false);setOpen(false);router.refresh();
  }
  if(!open) return <button type="button" onClick={()=>setOpen(true)} className="mt-3 text-[10px] text-[#8ea7ff] underline underline-offset-2">Editar</button>;
  return <form onSubmit={submit} className="mt-3 grid gap-2 rounded-xl border border-[var(--line)] bg-[#0b0d12] p-3">
    <label className="text-[10px] text-[var(--muted)]">Headline / contexto<input name="headline" defaultValue={headline??""} className={`${field} mt-1 text-xs`} placeholder="Cargo · stack · empresa"/></label>
    <label className="text-[10px] text-[var(--muted)]">Histórico relevante<textarea name="profileContext" defaultValue={profileContext??""} rows={2} className={`${field} mt-1 resize-y text-xs`} placeholder="Formação, empresas, experiência internacional"/></label>
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="text-[10px] text-[var(--muted)]">Área<select name="areaOverride" defaultValue={areaOverride??""} className={`${field} mt-1 text-xs`}><option value="">Automática (inferida)</option>{AREA_OPTIONS.map(opt=><option key={opt.code} value={opt.code}>{opt.label}</option>)}</select></label>
      <label className="text-[10px] text-[var(--muted)]">WhatsApp<input name="phone" defaultValue={phone??""} inputMode="tel" className={`${field} mt-1 text-xs`} placeholder="+55 11… (vazio remove)"/></label>
    </div>
    {error&&<p role="alert" className="text-[10px] text-[var(--danger)]">{error}</p>}
    <div className="flex gap-2"><button disabled={loading} className="accent-button min-h-9 rounded-lg px-4 text-xs font-medium disabled:opacity-50">{loading?"Salvando…":"Salvar"}</button><button type="button" onClick={()=>setOpen(false)} className="min-h-9 rounded-lg border border-[var(--line)] px-4 text-xs text-[var(--muted)]">Cancelar</button></div>
  </form>;
}

/** Enriquecimento direcionado: pesquisa só os melhores ranqueados desta vaga. */
export function JobPublicDiscovery({jobId,available}:{jobId:string;available:number}){
  const router=useRouter();
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  const alvo=Math.min(10,available);
  async function run(){
    setLoading(true);setMessage("");
    try{
      const response=await fetch("/api/admin/network/enrich",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jobId,limit:alvo})});
      const data=await response.json();
      if(response.status===503){setMessage("Enriquecimento desligado nesta instância. Ligue ENRICHMENT_ENABLED=true para permitir a busca pública.");return;}
      if(!response.ok)throw new Error();
      setMessage(data.workflowId?`Pesquisando ${data.profiles} perfis em segundo plano; ${data.jobs} vagas serão reranqueadas ao fim.`:"Estes perfis já foram pesquisados nos últimos 7 dias.");
      router.refresh();
    }catch{setMessage("Não foi possível iniciar a fila agora. Nenhum dado existente foi alterado.");}
    finally{setLoading(false);}
  }
  if(!available)return null;
  return <div className="mb-6 rounded-2xl border border-[#405078] bg-[#101528] p-4 sm:p-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">Enriquecer os {alvo} mais bem ranqueados</p>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--muted)]">Pesquisa pública apenas de quem está no topo desta vaga, em vez de varrer a rede inteira. Roda em segundo plano e rerranqueia a vaga ao terminar.</p>
      </div>
      <button type="button" onClick={run} disabled={loading} className="accent-button min-h-12 shrink-0 rounded-xl px-5 text-sm font-medium disabled:opacity-50">{loading?"Criando pipeline…":"Enriquecer topo"}</button>
    </div>
    {message&&<p role="status" className="mt-3 text-xs text-[#aebfff]">{message}</p>}
    <p className="mt-3 text-[10px] leading-4 text-[var(--muted)]">Nome e URL de LinkedIn são enviados ao provedor de busca com retenção zero exigida. Perfil pesquisado nos últimos 7 dias é ignorado para não gastar duas vezes.</p>
  </div>;
}

export function PublicDiscovery(){const router=useRouter();const [loading,setLoading]=useState(false);const [message,setMessage]=useState("");async function run(){setLoading(true);setMessage("");try{const response=await fetch("/api/admin/network/enrich",{method:"POST"});const data=await response.json();if(!response.ok)throw new Error();setMessage(data.workflowId?`Orquestrador ativado: ${data.profiles} perfis serão pesquisados e ${data.jobs} vagas reranqueadas em segundo plano.`:"Todos os perfis já foram verificados nos últimos 30 dias.");router.refresh();}catch{setMessage("Não foi possível iniciar a fila agora. Nenhum dado existente foi alterado.");}finally{setLoading(false);}}return <div className="rounded-2xl border border-[#405078] bg-[#101528] p-4 sm:p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">Descoberta pública assistida por IA</p><p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--muted)]">O orquestrador pesquisa até 8 perfis em paralelo, valida fontes e atualiza as vagas sem bloquear esta tela.</p></div><button type="button" onClick={run} disabled={loading} className="accent-button min-h-12 shrink-0 rounded-xl px-5 text-sm font-medium disabled:opacity-50">{loading?"Criando pipeline…":"Encontrar informações"}</button></div>{message&&<p role="status" className="mt-3 text-xs text-[#aebfff]">{message}</p>}<p className="mt-3 text-[10px] leading-4 text-[var(--muted)]">Ao executar, nome e contexto profissional são enviados para busca pública com retenção zero exigida do provedor. CV continua totalmente opcional. Acompanhe custos, fontes e falhas em Inteligência.</p></div>}

export function ManualAdminContact(){const router=useRouter();const [loading,setLoading]=useState(false);const [error,setError]=useState("");async function submit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget;setLoading(true);setError("");const body={mode:"manual",...Object.fromEntries(new FormData(form))};const response=await fetch("/api/admin/network",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});if(!response.ok){setError("Confira o nome e o WhatsApp com DDD e código do país.");setLoading(false);return;}form.reset();setLoading(false);router.refresh();}return <form onSubmit={submit} className="grid gap-3 md:grid-cols-2"><label className="text-xs text-[var(--muted)]">Nome<input name="name" required className={`${field} mt-2`} placeholder="Carlos Almeida"/></label><label className="text-xs text-[var(--muted)]">WhatsApp<input name="phone" required inputMode="tel" className={`${field} mt-2`} placeholder="+55 11… ou +1 415…"/></label><label className="text-xs text-[var(--muted)] md:col-span-2">Contexto profissional<input name="headline" className={`${field} mt-2`} placeholder="Head of Engineering · Fintech"/></label><label className="text-xs text-[var(--muted)] md:col-span-2">Histórico relevante<textarea name="profileContext" rows={3} className={`${field} mt-2 resize-y`} placeholder="ITA · ex-McKinsey · experiência nos Estados Unidos"/><span className="mt-1 block text-[10px] leading-4">Formação, empresas anteriores e experiência internacional. Use somente informações profissionais verificáveis.</span></label>{error&&<p role="alert" className="text-sm text-[var(--danger)] md:col-span-2">{error}</p>}<button disabled={loading} className="accent-button min-h-12 rounded-xl px-5 text-sm font-medium md:w-fit">{loading?"Salvando…":"Adicionar contato"}</button></form>}
