const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function isSyncActive() {
  try {
    const state = await chrome.storage.session.get(["rcSyncActive", "rcStartedAt"]);
    return state.rcSyncActive && Date.now() - Number(state.rcStartedAt || 0) < 15 * 60 * 1000;
  } catch (error) {
    console.error("[referral-copilot] storage.session inacessível:", error);
    return false;
  }
}

function normalizeProfileUrl(value) {
  try {
    // Usa a URL resolvida (a.href) e extrai só /in/<slug>: o LinkedIn adiciona
    // sufixos como /in/<slug>/pt/ que precisam ser aparados para deduplicar.
    const url = new URL(value, location.origin);
    if (!/(^|\.)linkedin\.com$/.test(url.hostname)) return null;
    const match = url.pathname.match(/^\/in\/([^/]+)/);
    return match ? `https://www.linkedin.com/in/${match[1]}` : null;
  } catch { return null; }
}

function cleanLines(value) {
  return value.split("\n").map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function collectVisibleConnections() {
  const contacts = new Map();
  for (const anchor of document.querySelectorAll('a[href*="/in/"]')) {
    const linkedinUrl = normalizeProfileUrl(anchor.href || anchor.getAttribute("href") || "");
    if (!linkedinUrl || contacts.has(linkedinUrl)) continue;
    const card = anchor.closest("li") || anchor.closest("[data-view-name]") || anchor.parentElement?.parentElement;
    const lines = cleanLines(card?.textContent || anchor.textContent || "");
    const imageAlt = anchor.querySelector("img")?.getAttribute("alt")?.trim();
    const anchorText = cleanLines(anchor.textContent || "")[0];
    const name = anchorText || imageAlt || lines.find(line => line.length > 2 && line.length < 120);
    if (!name || /linkedin|perfil|profile/i.test(name)) continue;
    const headline = lines.find(line => line !== name && line.length > 3 && line.length < 300 && !/conexão|connection|mensagem|message|remover|remove/i.test(line)) || "";
    contacts.set(linkedinUrl, { name: name.slice(0, 160), headline: headline.slice(0, 500), profileUrl: linkedinUrl, linkedinUrl });
  }
  return [...contacts.values()];
}

function showStatus(text) {
  let banner = document.getElementById("referral-copilot-sync-status");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "referral-copilot-sync-status";
    Object.assign(banner.style, { position: "fixed", right: "20px", bottom: "20px", zIndex: "2147483647", maxWidth: "340px", padding: "16px 18px", borderRadius: "14px", background: "#111827", color: "white", boxShadow: "0 16px 50px rgba(0,0,0,.35)", font: "600 14px/1.45 system-ui" });
    document.documentElement.appendChild(banner);
  }
  banner.textContent = text;
}

function findScroller() {
  // A lista de conexões é virtualizada dentro de um container com overflow próprio;
  // os cards fora da viewport são removidos do DOM, então é preciso rolar ESSE
  // container em passos pequenos e coletar a cada passo, antes que sumam.
  let best = null;
  for (const el of document.querySelectorAll("main, main *")) {
    const style = getComputedStyle(el);
    if (!/auto|scroll/.test(style.overflowY)) continue;
    if (el.scrollHeight <= el.clientHeight + 50) continue;
    if (!best || el.scrollHeight > best.scrollHeight) best = el;
  }
  return best;
}

async function scrape() {
  if (!(await isSyncActive())) return;
  showStatus("Referral Copilot está mapeando sua rede…");
  const all = new Map();
  let stableRounds = 0;
  // A lista é virtualizada (~10 cards no DOM por vez): passos pequenos coletando
  // a cada passo acompanham a reciclagem sem pular ninguém. Validado no console.
  for (let round = 0; round < 400 && stableRounds < 15; round++) {
    const before = all.size;
    for (const contact of collectVisibleConnections()) all.set(contact.linkedinUrl, contact);
    stableRounds = all.size > before ? 0 : stableRounds + 1;
    showStatus(`${all.size} conexões encontradas. Continue nesta aba…`);
    chrome.runtime.sendMessage({ type: "rc:linkedin-sync-progress", count: all.size }).catch(() => undefined);
    // Re-detecta o scroller a cada passo (o container só existe depois da lista
    // montar) e rola tanto ele quanto o window, cobrindo os dois layouts.
    const target = findScroller() ?? document.scrollingElement ?? document.documentElement;
    const atBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 8;
    if (atBottom) {
      // No fundo, oscila para forçar o IntersectionObserver a paginar o próximo lote.
      target.scrollTop -= 400;
    } else {
      target.scrollTop += 350;
    }
    window.scrollBy(0, atBottom ? -400 : 350);
    if (round % 10 === 0) {
      console.log(`[referral-copilot] #${round} unicos=${all.size} scroller=${target.tagName} top=${Math.round(target.scrollTop)}/${target.scrollHeight} bottom=${atBottom}`);
    }
    await wait(500);
  }
  console.log(`[referral-copilot] coleta finalizada: ${all.size} conexões`);
  const contacts = [...all.values()];
  showStatus(`${contacts.length} conexões prontas. Voltando ao Referral Copilot…`);
  await chrome.runtime.sendMessage({ type: "rc:linkedin-sync-complete", contacts });
}

scrape().catch((error) => {
  console.error("[referral-copilot] coleta interrompida:", error);
  chrome.runtime.sendMessage({ type: "rc:linkedin-sync-error", message: "A coleta foi interrompida. Abra sua rede e tente novamente." });
});
