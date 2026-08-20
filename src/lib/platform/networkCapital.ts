export type EducationTier = "A" | "B" | "C" | "D";
export type NetworkCapitalInference = { score:number; educationTier:EducationTier|null; evidence:string[]; confidence:number; ruleVersion:string };

// A inferência descreve capital de rede com evidência verificável; instituição de ensino
// nunca é usada como decisão automática de contratação, apenas como sinal explicável.
export const NETWORK_CAPITAL_RULE_VERSION = "2026-08-20.2";

const tiers: Array<{ tier:EducationTier; score:number; pattern:RegExp; label:string }> = [
  {tier:"A",score:.75,pattern:/\b(ita|instituto tecnol[oó]gico de aeron[aá]utica|ime|instituto militar de engenharia)\b/i,label:"Formação Tier A (ITA/IME)"},
  {tier:"B",score:.6,pattern:/\b(usp|universidade de s[aã]o paulo|unicamp|universidade estadual de campinas)\b/i,label:"Formação Tier B (USP/UNICAMP)"},
  {tier:"C",score:.42,pattern:/\b(universidade federal|ufmg|ufrj|ufrgs|ufsc|ufpe|ufpr|ufba|ufscar|unifesp|unb)\b/i,label:"Formação Tier C (universidade federal)"},
  {tier:"D",score:.36,pattern:/\b(insper|inteli|intelli|instituto de tecnologia e lideran[cç]a|link school of business)\b/i,label:"Formação Tier D (Insper/Inteli/Link School)"},
];

export function inferNetworkCapital(input:{headline:string|null;profileContext:string|null}):NetworkCapitalInference{
  const text=[input.headline,input.profileContext].filter(Boolean).join(" · ");
  if(!text.trim())return {score:0,educationTier:null,evidence:[],confidence:0,ruleVersion:NETWORK_CAPITAL_RULE_VERSION};
  const evidence:string[]=[];
  let score=0;
  let educationTier:EducationTier|null=null;
  const education=tiers.find(item=>item.pattern.test(text));
  if(education){educationTier=education.tier;score=Math.max(score,education.score);evidence.push(education.label);}
  if(/\bmba\b.{0,80}\b(harvard|stanford)\b|\b(harvard|stanford)\b.{0,80}\bmba\b/i.test(text)){
    score=Math.max(score,.9);evidence.push("MBA em Harvard/Stanford");
  }
  if(/\b(forma[cç][aã]o internacional|education abroad|study abroad|degree abroad|university of|college of|business school)\b/i.test(text)){
    score=Math.max(score,.45);evidence.push("Formação internacional explicitamente informada");
  }
  if(/\b(mckinsey|boston consulting group|bcg|bain(?:\s*&\s*company)?)\b/i.test(text)){
    score=Math.max(score,.7);evidence.push("Experiência em consultoria Big Three");
  }
  if(/\b(btg(?:\s+pactual)?|xp(?:\s+inc\.?|\s+investimentos)?|goldman sachs)\b/i.test(text)){
    score=Math.max(score,.65);evidence.push("Experiência em instituição reconhecida do mercado financeiro");
  }
  if(/\b(experi[eê]ncia internacional|mercado internacional|exterior|estados unidos|united states|europe|europa|reino unido|united kingdom|singapore|canada|canad[aá])\b/i.test(text)){
    score=Math.min(1,score+.2);evidence.push("Exposição internacional explicitamente informada");
  }
  if(/\b(promoted|promovid[oa]|promo[cç][aã]o)\b/i.test(text)){
    score=Math.max(score,.5);evidence.push("Progressão de carreira explicitamente registrada");
  }
  if(/\b(head|director|diretor[a]?|vp|vice[- ]president[e]?|chief|cto|ceo|cfo|coo|founder|fundador[a]?|partner|s[oó]ci[oa])\b/i.test(text)){
    score=Math.max(score,.45);evidence.push("Posição de liderança informada no perfil");
  }
  const skillsMatch=text.match(/skills:\s*([^·]+)/i);
  if(skillsMatch&&skillsMatch[1].split(",").filter(item=>item.trim()).length>=5){
    score=Math.min(1,score+.05);evidence.push("Base ampla de skills declaradas");
  }
  const confidence=evidence.length?(input.profileContext?.trim()?0.86:0.62):0;
  return {score,educationTier,evidence:Array.from(new Set(evidence)),confidence,ruleVersion:NETWORK_CAPITAL_RULE_VERSION};
}
