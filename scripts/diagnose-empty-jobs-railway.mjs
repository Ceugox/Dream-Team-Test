/**
 * Roda o diagnóstico de vagas sem sugestões contra o Postgres do Railway.
 * READ-ONLY: o script filho só faz SELECT. Mesma resolução de URL do seed-demo-railway.mjs.
 *
 * Uso (com o CLI do Railway logado e o projeto linkado):
 *   node scripts/diagnose-empty-jobs-railway.mjs
 */
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Tudo roda a partir da raiz do projeto: o CLI do Railway depende do link no diretório,
// e o tsx resolve do node_modules local — assim o wrapper funciona de qualquer cwd.
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const isWindows = process.platform === "win32";
const CANDIDATES = isWindows ? ["railway.cmd", "railway"] : ["railway"];

function runRailway(args) {
  let lastError = "";
  for (const command of CANDIDATES) {
    const result = spawnSync(command, args, { encoding: "utf8", shell: isWindows, maxBuffer: 1 << 22, cwd: projectRoot });
    if (!result.error && result.status === 0) return result.stdout;
    lastError = result.error?.message || result.stderr || `saiu com código ${result.status}`;
  }
  throw new Error(`Não consegui executar o CLI do Railway (${CANDIDATES.join(", ")}): ${lastError}`);
}

const postgres = JSON.parse(runRailway(["variables", "-s", "Postgres", "--json"]));
if (!postgres.DATABASE_URL) throw new Error("Serviço Postgres sem DATABASE_URL.");
const proxyHost = postgres.RAILWAY_TCP_PROXY_DOMAIN;
const proxyPort = postgres.RAILWAY_TCP_PROXY_PORT;
if (!proxyHost || !proxyPort) throw new Error("Sem proxy TCP no Postgres (RAILWAY_TCP_PROXY_DOMAIN/PORT).");

const url = new URL(postgres.DATABASE_URL);
url.hostname = proxyHost;
url.port = String(proxyPort);
console.log(`Alvo: ${url.hostname}:${url.port}${url.pathname} (credencial não é exibida)`);

const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/diagnose-empty-jobs.ts"], {
  stdio: "inherit",
  cwd: projectRoot,
  env: { ...process.env, DATABASE_URL: url.toString() },
});
process.exit(result.status ?? 1);
