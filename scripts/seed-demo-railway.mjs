/**
 * Roda o seed de demonstração contra o Postgres do Railway sem você ter de garimpar
 * credencial: monta a URL pública a partir do TCP proxy do serviço e passa por env para
 * o processo filho. Nada de segredo é impresso.
 *
 * Uso (com o CLI do Railway já logado e o projeto linkado):
 *   node scripts/seed-demo-railway.mjs
 *
 * Por que existe: o DATABASE_URL do Railway aponta para postgres.railway.internal, que só
 * resolve dentro da rede deles. Para rodar da sua máquina, host e porta têm de ser trocados
 * pelos do proxy TCP — que é justamente o que este script faz.
 */
import { execFileSync, spawnSync } from "node:child_process";

const railway = process.platform === "win32" ? "railway.exe" : "railway";

function variablesOf(service) {
  const raw = execFileSync(railway, ["variables", "-s", service, "--json"], { encoding: "utf8", maxBuffer: 1 << 22 });
  return JSON.parse(raw);
}

const postgres = variablesOf("Postgres");
const web = variablesOf("referral-copilot-mvp");

if (!postgres.DATABASE_URL) throw new Error("Serviço Postgres sem DATABASE_URL. Confira `railway status` e o projeto linkado.");
const proxyHost = postgres.RAILWAY_TCP_PROXY_DOMAIN;
const proxyPort = postgres.RAILWAY_TCP_PROXY_PORT;
if (!proxyHost || !proxyPort) {
  throw new Error(`Sem proxy TCP no Postgres (RAILWAY_TCP_PROXY_DOMAIN/PORT). Chaves disponíveis: ${Object.keys(postgres).sort().join(", ")}`);
}

// Mantém usuário, senha e base da URL interna; troca só host e porta pelo proxy público.
const url = new URL(postgres.DATABASE_URL);
url.hostname = proxyHost;
url.port = String(proxyPort);

if (!web.APP_SECRET) throw new Error("Serviço web sem APP_SECRET: o convite dos membros é assinado com ela.");

console.log(`Alvo: ${url.hostname}:${url.port}${url.pathname} (credencial não é exibida)`);

const result = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["tsx", "scripts/seed-demo.ts"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url.toString(), APP_SECRET: web.APP_SECRET, SEED_CONFIRM: "yes" },
});
process.exit(result.status ?? 1);
