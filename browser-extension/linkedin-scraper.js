const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function isSyncActive() {
  const state = await chrome.storage.session.get(["rcSyncActive", "rcStartedAt"]);
  return state.rcSyncActive && Date.now() - Number(state.rcStartedAt || 0) < 15 * 60 * 1000;
}

function normalizeProfileUrl(value) {
  try {
    const url = new URL(value, location.origin);
    if (url.hostname !== "www.linkedin.com" || !url.pathname.startsWith("/in/")) return null;
    return `https://www.linkedin.com${url.pathname.replace(/\/$/, "")}`;
  } catch { return null; }
}

function cleanLines(value) {
  return value.split("\n").map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function collectVisibleConnections() {
  const contacts = new Map();
  for (const anchor of document.querySelectorAll('a[href*="/in/"]')) {
    const linkedinUrl = normalizeProfileUrl(anchor.getAttribute("href") || "");
    if (!linkedinUrl || contacts.has(linkedinUrl)) continue;
    const card = anchor.closest("li") || anchor.closest("[data-view-name]") || anchor.parentElement?.parentElement;
    const lines = cleanLines(card?.textContent || anchor.textContent || "");
    const imageAlt = anchor.querySelector("img")?.getAttribute("alt")?.trim();
    const anchorText = cleanLines(anchor.textContent || "")[0];
    const name = anchorText || imageAlt || lines.find(line => line.length > 2 && line.length < 120);
    if (!name || /linkedin|perfil|profile/i.test(name)) continue;
    const headline = lines.find(line => line !== name && line.length > 3 && line.length < 300 && !/conexão|connection|mensagem|message|remover|remove/i.test(line)) || "";
    contacts.set(linkedinUrl, { name: name.slice(0, 160), headline: headline.slice(0, 500), linkedinUrl });
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

async function scrape() {
  if (!(await isSyncActive())) return;
  showStatus("Referral Copilot está mapeando sua rede…");
  const all = new Map();
  let stableRounds = 0;
  for (let round = 0; round < 40 && stableRounds < 5; round++) {
    const before = all.size;
    for (const contact of collectVisibleConnections()) all.set(contact.linkedinUrl, contact);
    stableRounds = all.size === before ? stableRounds + 1 : 0;
    showStatus(`${all.size} conexões encontradas. Continue nesta aba…`);
    chrome.runtime.sendMessage({ type: "rc:linkedin-sync-progress", count: all.size }).catch(() => undefined);
    const more = [...document.querySelectorAll("button")].find(button => /exibir mais|show more|carregar mais|load more/i.test(button.textContent || ""));
    if (more && !more.disabled) more.click();
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
    await wait(1200);
  }
  const contacts = [...all.values()];
  showStatus(`${contacts.length} conexões prontas. Voltando ao Referral Copilot…`);
  await chrome.runtime.sendMessage({ type: "rc:linkedin-sync-complete", contacts });
}

scrape().catch(() => chrome.runtime.sendMessage({ type: "rc:linkedin-sync-error", message: "A coleta foi interrompida. Abra sua rede e tente novamente." }));
