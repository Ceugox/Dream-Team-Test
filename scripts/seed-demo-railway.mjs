/**
 * Roda o seed de demonstração contra o Postgres do Railway sem você ter de garimpar
 * credencial: monta a URL pública a partir do proxy TCP do serviço e passa por env para o
 * processo filho. Nada de segredo é impresso.
 *
 * Uso (com o CLI do Railway logado e o projeto linkado):
 *   node scripts/seed-demo-railway.mjs            # roda o seed
 *   node scripts/seed-demo-railway.mjs --dry-run  # só resolve e mostra o alvo
 *
 * Por que existe: o DATABASE_URL do Railway aponta para postgres.railway.internal, que só
 * resolve dentro da rede deles, e este projeto não expõe DATABASE_PUBLIC_URL. Para rodar da
 * sua máquina, host e porta têm de ser trocados pelos do proxy TCP.
 */
import { spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";
// O CLI do Railway instalado via npm é um shim (.cmd/.ps1), não um .exe — e o Node recusa
// executar .cmd sem shell. Daí a lista de candidatos e o shell no Windows.
const CANDIDATES = isWindows ? ["railway.cmd", "railway"] : ["railway"];

function runRailway(args) {
  let lastError = "";
  for (const command of CANDIDATES) {
    const result = spawnSync(command, args, { encoding: "utf8", shell: isWindows, maxBuffer: 1 << 22 });
    if (!result.error && result.status === 0) return result.stdout;
    lastError = result.error?.message || result.stderr || `saiu com código ${result.status}`;
  }
  throw new Error(`Não consegui executar o CLI do Railway (${CANDIDATES.join(", ")}): ${lastError}`);
}

function variablesOf(service) {
  const raw = runRailway(["variables", "-s", service, "--json"]);
  try { return JSON.parse(raw); }
  catch { throw new Error(`Resposta inesperada do CLI para o serviço "${service}". Confira \`railway status\` e o projeto linkado.`); }
}

const postgres = variablesOf("Postgres");
const web = variablesOf("referral-copilot-mvp");

if (!postgres.DATABASE_URL) throw new Error("Serviço Postgres sem DATABASE_URL.");
const proxyHost = postgres.RAILWAY_TCP_PROXY_DOMAIN;
const proxyPort = postgres.RAILWAY_TCP_PROXY_PORT;
if (!proxyHost || !proxyPort) {
  throw new Error(`Sem proxy TCP no Postgres (RAILWAY_TCP_PROXY_DOMAIN/PORT). Chaves disponíveis: ${Object.keys(postgres).sort().join(", ")}`);
}
if (!web.APP_SECRET) throw new Error("Serviço web sem APP_SECRET: o convite dos membros é assinado com ela.");

// Mantém usuário, senha e base da URL interna; troca só host e porta pelos do proxy público.
const url = new URL(postgres.DATABASE_URL);
url.hostname = proxyHost;
url.port = String(proxyPort);

console.log(`Alvo: ${url.hostname}:${url.port}${url.pathname} (credencial não é exibida)`);

if (process.argv.includes("--dry-run")) {
  console.log("Dry run: variáveis resolvidas com sucesso, nada foi escrito.");
  process.exit(0);
}

// node --import tsx evita o shim do npx, que tem o mesmo problema de .cmd no Windows.
const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/seed-demo.ts"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url.toString(), APP_SECRET: web.APP_SECRET, SEED_CONFIRM: "yes" },
});
process.exit(result.status ?? 1);
