/**
 * Cria N convites de membro (sem e-mail: qualquer pessoa com o link ativa) contra o Postgres
 * do Railway e imprime as URLs públicas. O token só existe em claro aqui — guarde a saída.
 *
 * Uso: node scripts/create-evaluator-invites.mjs [quantidade=3]
 */
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
  throw new Error(`Não consegui executar o CLI do Railway: ${lastError}`);
}

const postgres = JSON.parse(runRailway(["variables", "-s", "Postgres", "--json"]));
const web = JSON.parse(runRailway(["variables", "-s", "referral-copilot-mvp", "--json"]));
if (!postgres.DATABASE_URL || !web.APP_SECRET || !web.APP_URL) throw new Error("Variáveis faltando (DATABASE_URL/APP_SECRET/APP_URL).");

const url = new URL(postgres.DATABASE_URL);
url.hostname = postgres.RAILWAY_TCP_PROXY_DOMAIN;
url.port = String(postgres.RAILWAY_TCP_PROXY_PORT);

const count = Math.max(1, Math.min(Number(process.argv[2]) || 3, 10));
const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/create-evaluator-invites.ts"], {
  stdio: "inherit", cwd: projectRoot,
  env: { ...process.env, DATABASE_URL: url.toString(), APP_SECRET: web.APP_SECRET, INVITE_COUNT: String(count), INVITE_APP_URL: web.APP_URL },
});
process.exit(result.status ?? 1);
