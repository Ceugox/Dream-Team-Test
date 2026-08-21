# LinkedIn Headline Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a extensão do LinkedIn capturar a headline (cargo/empresa) de cada conexão na página de lista, para os contatos deixarem de ficar com "contexto incompleto".

**Architecture:** A extração pura da headline vira uma função testável `pickHeadline` num arquivo próprio da extensão, carregado antes do scraper (content scripts compartilham escopo global no mesmo isolated world). O scraper delimita cada card pelo marcador de rodapé ("Conexão feita em"/"Connected") em vez das classes ofuscadas, e usa `pickHeadline`. O backend já consome `headline` via `parseAdminNetworkFile` + `inferNetworkCapital`; só ajustamos o `profileContext` para usar a headline quando não houver contexto mais rico.

**Tech Stack:** Chrome extension (Manifest V3, JS sem módulos), Vitest, TypeScript (Next.js app), `inferNetworkCapital` (regex determinístico).

## Global Constraints

- Extensão é content script clássico: sem `import`/`export` ES; funções compartilhadas entre arquivos usam `function` declaration no top-level (viram globais do isolated world). A ordem no array `content_scripts[].js` do manifest é a ordem de injeção.
- Nenhuma mudança de schema, migração ou contrato de API. O objeto enviado continua `{ name, headline, profileUrl, linkedinUrl }`.
- Marcadores de rodapé do card (PT+EN): `conexão feita em`, `conexao feita em`, `connected`, `conectad`. Rótulos de ação a ignorar: `mensagem`, `message`, `seguir`, `follow`.
- Headline ausente → `null`, nunca inventar.
- `node --check` em todo arquivo `.js` editado da extensão; suíte do app (`npm test`) verde ao fim.

---

### Task 1: Função pura `pickHeadline` com testes

**Files:**
- Create: `browser-extension/headline.js`
- Test: `browser-extension/headline.test.mjs`
- Modify: `vitest.config.ts:12`

**Interfaces:**
- Produces: `pickHeadline(lines: string[], name: string): string | null` — recebe as linhas de texto já limpas de um card e o nome do contato; devolve a headline (máx 500 chars) ou `null`. No browser é uma `function` global; para teste, o arquivo também expõe `module.exports = { pickHeadline, CONNECTION_MARKERS, ACTION_LABELS }` sob guarda `typeof module`.

- [ ] **Step 1: Ampliar o include do vitest para os testes da extensão**

Em `vitest.config.ts`, trocar a linha 12:

```ts
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "browser-extension/**/*.test.mjs"],
```

- [ ] **Step 2: Escrever o teste falhando**

Create `browser-extension/headline.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { pickHeadline } from "./headline.js";

describe("pickHeadline", () => {
  it("extrai a headline entre o nome e o marcador de rodapé (PT)", () => {
    const lines = ["Marcel Saraiva", "Sales & Marketing Executive | Account Executive", "Conexão feita em 20 de agosto de 2026", "Mensagem"];
    expect(pickHeadline(lines, "Marcel Saraiva")).toBe("Sales & Marketing Executive | Account Executive");
  });

  it("suporta o layout em inglês", () => {
    const lines = ["John Doe", "Software Engineer at Acme", "Connected on Aug 20, 2026", "Message"];
    expect(pickHeadline(lines, "John Doe")).toBe("Software Engineer at Acme");
  });

  it("não confunde sufixos do nome com a headline", () => {
    const lines = ["Gabriel Mendes de Freitas, LLB, MBA", "MBA pela HEC Paris | Inovação", "Conexão feita em 17 de agosto de 2026", "Mensagem"];
    expect(pickHeadline(lines, "Gabriel Mendes de Freitas, LLB, MBA")).toBe("MBA pela HEC Paris | Inovação");
  });

  it("retorna null quando o card não tem headline", () => {
    const lines = ["Fulano de Tal", "Conexão feita em 14 de agosto de 2026", "Mensagem"];
    expect(pickHeadline(lines, "Fulano de Tal")).toBeNull();
  });

  it("ignora o próprio nome, o marcador e o botão de ação", () => {
    const lines = ["Mirela Correa", "Mirela Correa", "Venture Capital @ MAYA Capital", "Conexão feita em 13 de agosto de 2026", "Mensagem"];
    expect(pickHeadline(lines, "Mirela Correa")).toBe("Venture Capital @ MAYA Capital");
  });

  it("trunca headlines muito longas em 500 caracteres", () => {
    const long = "A".repeat(600);
    const lines = ["Diego Santos", long, "Conexão feita em 14 de agosto de 2026", "Mensagem"];
    expect(pickHeadline(lines, "Diego Santos")).toHaveLength(500);
  });
});
```

- [ ] **Step 3: Rodar o teste e confirmar a falha**

Run: `npm test -- browser-extension/headline.test.mjs`
Expected: FAIL com `Cannot find module './headline.js'` (ou `pickHeadline is not a function`).

- [ ] **Step 4: Implementar a função pura**

Create `browser-extension/headline.js`:

```js
// Extração pura da headline de um card de conexão do LinkedIn.
// As classes do LinkedIn são ofuscadas; delimitamos por texto estável.
// Content script clássico: `function` no top-level fica global no isolated
// world e é usada pelo linkedin-scraper.js (carregado depois no manifest).
var CONNECTION_MARKERS = ["conexão feita em", "conexao feita em", "connected", "conectad"];
var ACTION_LABELS = ["mensagem", "message", "seguir", "follow"];

function pickHeadline(lines, name) {
  var normalizedName = String(name || "").trim().toLowerCase();
  for (var i = 0; i < lines.length; i++) {
    var text = String(lines[i] || "").trim();
    if (!text) continue;
    var low = text.toLowerCase();
    if (low === normalizedName) continue;
    if (CONNECTION_MARKERS.some(function (marker) { return low.includes(marker); })) continue;
    if (ACTION_LABELS.some(function (label) { return low === label; })) continue;
    return text.slice(0, 500);
  }
  return null;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { pickHeadline: pickHeadline, CONNECTION_MARKERS: CONNECTION_MARKERS, ACTION_LABELS: ACTION_LABELS };
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npm test -- browser-extension/headline.test.mjs`
Expected: PASS (6 testes).

- [ ] **Step 6: Verificar sintaxe da extensão**

Run: `node --check browser-extension/headline.js`
Expected: sem saída (exit 0).

- [ ] **Step 7: Commit**

```bash
git add browser-extension/headline.js browser-extension/headline.test.mjs vitest.config.ts
git commit -m "feat: pure pickHeadline extractor for LinkedIn connection cards"
```

---

### Task 2: Integrar a extração no scraper e no manifest

**Files:**
- Modify: `browser-extension/manifest.json`
- Modify: `browser-extension/linkedin-scraper.js`

**Interfaces:**
- Consumes: `pickHeadline(lines, name)` da Task 1 (global do isolated world).
- Produces: `collectVisibleConnections()` passa a devolver `headline` preenchida (ou `null`) por card, mantendo o objeto `{ name, headline, profileUrl, linkedinUrl }`.

- [ ] **Step 1: Carregar `headline.js` antes do scraper e subir a versão**

Em `browser-extension/manifest.json`, no content script de `linkedin-scraper.js` (o `matches` de `/mynetwork/invite-connect/connections/`), trocar `"js": ["linkedin-scraper.js"]` por:

```json
      "js": ["headline.js", "linkedin-scraper.js"],
```

E subir `"version"` para `"1.3.0"`.

- [ ] **Step 2: Substituir a delimitação do card no scraper**

Em `browser-extension/linkedin-scraper.js`, substituir a função `collectVisibleConnections` inteira por:

```js
function connectionCard(anchor) {
  // Sobe até o ancestral cujo texto contém o marcador de rodapé do card.
  let node = anchor;
  for (let depth = 0; depth < 8 && node; depth++) {
    const text = (node.innerText || "").toLowerCase();
    if (CONNECTION_MARKERS.some(marker => text.includes(marker))) return node;
    node = node.parentElement;
  }
  return anchor.closest("li") || anchor.parentElement?.parentElement || anchor;
}

function collectVisibleConnections() {
  const contacts = new Map();
  for (const anchor of document.querySelectorAll('a[href*="/in/"]')) {
    const linkedinUrl = normalizeProfileUrl(anchor.href || anchor.getAttribute("href") || "");
    if (!linkedinUrl || contacts.has(linkedinUrl)) continue;
    const card = connectionCard(anchor);
    const lines = cleanLines(card.innerText || anchor.textContent || "");
    const imageAlt = anchor.querySelector("img")?.getAttribute("alt")?.trim();
    const name = (cleanLines(anchor.textContent || "")[0] || imageAlt || "").slice(0, 160);
    if (!name || /linkedin|perfil|profile/i.test(name)) continue;
    const headline = pickHeadline(lines, name);
    contacts.set(linkedinUrl, { name, headline: headline || "", profileUrl: linkedinUrl, linkedinUrl });
  }
  return [...contacts.values()];
}
```

- [ ] **Step 3: Verificar sintaxe do scraper e a validade do manifest**

Run: `node --check browser-extension/linkedin-scraper.js`
Expected: sem saída (exit 0).

Run: `node -e "JSON.parse(require('fs').readFileSync('browser-extension/manifest.json','utf8')); console.log('manifest ok')"`
Expected: `manifest ok`.

- [ ] **Step 4: Verificar a cobertura de headline no DOM real (manual)**

Na página `/mynetwork/invite-connect/connections/` com contatos visíveis, colar no console:

```js
(() => {
  const M = ["conexão feita em","conexao feita em","connected","conectad"];
  const card = a => { let n=a; for(let i=0;i<8&&n;i++){ if(M.some(m=>(n.innerText||"").toLowerCase().includes(m))) return n; n=n.parentElement; } return a; };
  const norm = a => { try { const m=new URL(a.href).pathname.match(/^\/in\/([^/]+)/); return m?m[1]:null; } catch { return null; } };
  const seen = new Set(); let total=0, withHeadline=0;
  for (const a of document.querySelectorAll('a[href*="/in/"]')) {
    const k = norm(a); if (!k || seen.has(k)) continue; seen.add(k);
    const lines = (card(a).innerText||"").split("\n").map(s=>s.trim()).filter(Boolean);
    const name = (a.textContent||"").trim();
    const h = lines.find(l => l.toLowerCase()!==name.toLowerCase() && !M.some(m=>l.toLowerCase().includes(m)) && !["mensagem","message"].includes(l.toLowerCase()));
    total++; if (h) withHeadline++;
  }
  console.log(`headline em ${withHeadline}/${total} cards`);
})();
```

Expected: `withHeadline` próximo de `total` (praticamente todos os cards têm headline).

- [ ] **Step 5: Commit**

```bash
git add browser-extension/manifest.json browser-extension/linkedin-scraper.js
git commit -m "feat: capture connection headline from the connections list DOM"
```

---

### Task 3: Usar a headline como `profileContext` no backend

**Files:**
- Modify: `src/lib/platform/adminNetwork.ts:31`
- Test: `src/lib/platform/adminNetwork.test.ts`

**Interfaces:**
- Consumes: `parseAdminNetworkFile(data)` recebe `[{ name, headline, profileUrl/linkedinUrl }]` da extensão.
- Produces: quando não há education/experience/profileContext mais ricos, `profileContext` passa a ser a `headline` (em vez de `null`), elevando a confiança do `inferNetworkCapital` (0.62 → 0.86) e dando texto ao `scoreConnectorFit`.

- [ ] **Step 1: Escrever o teste falhando**

Adicionar a `src/lib/platform/adminNetwork.test.ts`, dentro do `describe("admin network", …)`:

```js
  it("usa a headline como contexto quando não há histórico mais rico", () => {
    const [contact] = parseAdminNetworkFile([
      { name: "Mirela Correa", headline: "Venture Capital @ MAYA Capital", profileUrl: "https://linkedin.com/in/mirela" },
    ]);
    expect(contact.profileContext).toBe("Venture Capital @ MAYA Capital");
  });

  it("prefere o histórico rico à headline quando ambos existem", () => {
    const [contact] = parseAdminNetworkFile([
      { name: "Ana", headline: "Engineer", profileUrl: "https://linkedin.com/in/ana", education: ["ITA"] },
    ]);
    expect(contact.profileContext).toContain("ITA");
    expect(contact.profileContext).not.toBe("Engineer");
  });
```

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run: `npm test -- src/lib/platform/adminNetwork.test.ts`
Expected: FAIL — o primeiro caso recebe `profileContext` `null` (headline não é usada como fallback).

- [ ] **Step 3: Implementar o fallback**

Em `src/lib/platform/adminNetwork.ts`, na linha que monta `profileContext` dentro de `parseAdminNetworkFile` (hoje):

```ts
    const profileContext=[item.profileContext,text(item.education),text(item.experience),item.internationalExperience===true?"Experiência internacional":typeof item.internationalExperience==="string"?item.internationalExperience:"",previous?.profileContext].filter(Boolean).join(" · ")||null;
```

trocar o final `.join(" · ")||null` por `.join(" · ")||item.headline||null`:

```ts
    const profileContext=[item.profileContext,text(item.education),text(item.experience),item.internationalExperience===true?"Experiência internacional":typeof item.internationalExperience==="string"?item.internationalExperience:"",previous?.profileContext].filter(Boolean).join(" · ")||item.headline||null;
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- src/lib/platform/adminNetwork.test.ts`
Expected: PASS.

- [ ] **Step 5: Rodar a suíte completa e o typecheck**

Run: `npm test`
Expected: todos os testes PASS.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/platform/adminNetwork.ts src/lib/platform/adminNetwork.test.ts
git commit -m "feat: fall back to headline for connection profile context"
```

---

## Verificação final (manual, ponta a ponta)

Após as três tarefas e o deploy:

1. Recarregar a extensão em `chrome://extensions` (confirmar versão 1.3.0).
2. Rodar o fluxo pela extensão como admin.
3. No painel de rede, confirmar que os contatos mostram a headline como contexto (não mais "contexto incompleto") e que sinais como ITA / HEC Paris / UNICAMP / MAYA Capital aparecem no capital de rede.
