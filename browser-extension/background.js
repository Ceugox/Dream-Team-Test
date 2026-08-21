const CONNECTIONS_URL = "https://www.linkedin.com/mynetwork/invite-connect/connections/";

// storage.session é inacessível a content scripts por padrão; sem isso o scraper
// falha na primeira leitura e a aba fecha na hora com sync-error.
chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" }).catch(() => undefined);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "rc:start-linkedin-sync" && sender.tab?.id) {
    startLinkedInSync(sender.tab.id)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if ((message?.type === "rc:linkedin-sync-progress" || message?.type === "rc:linkedin-sync-complete" || message?.type === "rc:linkedin-sync-error") && sender.tab?.id) {
    relayToApp(message, sender.tab.id);
  }
});

async function startLinkedInSync(returnTabId) {
  await chrome.storage.session.set({ rcReturnTabId: returnTabId, rcSyncActive: true, rcStartedAt: Date.now() });
  try {
    const tab = await chrome.tabs.create({ url: CONNECTIONS_URL, active: true });
    await chrome.storage.session.set({ rcLinkedinTabId: tab.id });
  } catch (error) {
    await chrome.storage.session.remove(["rcReturnTabId", "rcSyncActive", "rcStartedAt"]);
    throw error;
  }
}

async function relayToApp(message, linkedinTabId) {
  const { rcReturnTabId } = await chrome.storage.session.get(["rcReturnTabId"]);
  if (!rcReturnTabId) return;
  await chrome.tabs.sendMessage(rcReturnTabId, message).catch(() => undefined);
  if (message.type === "rc:linkedin-sync-complete" || message.type === "rc:linkedin-sync-error") {
    await chrome.storage.session.remove(["rcReturnTabId", "rcLinkedinTabId", "rcSyncActive", "rcStartedAt"]);
    const returnTab = await chrome.tabs.update(rcReturnTabId, { active: true }).catch(() => undefined);
    if (returnTab?.windowId) await chrome.windows.update(returnTab.windowId, { focused: true }).catch(() => undefined);
    await chrome.tabs.remove(linkedinTabId).catch(() => undefined);
  }
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) return;
  const state = await chrome.storage.session.get(["rcReturnTabId", "rcLinkedinTabId", "rcSyncActive"]);
  if (!state.rcSyncActive || state.rcLinkedinTabId !== tabId || !state.rcReturnTabId) return;
  let url;
  try { url = new URL(tab.url); } catch { return; }
  if (url.hostname !== "www.linkedin.com") return;
  const authPage = /^\/(login|uas\/login|signup|checkpoint|challenge)(\/|$)/.test(url.pathname);
  if (authPage) {
    await chrome.tabs.sendMessage(state.rcReturnTabId, { type: "rc:linkedin-awaiting-login" }).catch(() => undefined);
  } else if (url.pathname.startsWith("/mynetwork/invite-connect/connections")) {
    await chrome.tabs.sendMessage(state.rcReturnTabId, { type: "rc:linkedin-collecting" }).catch(() => undefined);
  } else {
    await chrome.tabs.update(tabId, { url: CONNECTIONS_URL });
  }
});

chrome.tabs.onRemoved.addListener(async tabId => {
  const state = await chrome.storage.session.get(["rcReturnTabId", "rcLinkedinTabId", "rcSyncActive"]);
  if (!state.rcSyncActive || state.rcLinkedinTabId !== tabId || !state.rcReturnTabId) return;
  await chrome.storage.session.remove(["rcReturnTabId", "rcLinkedinTabId", "rcSyncActive", "rcStartedAt"]);
  await chrome.tabs.sendMessage(state.rcReturnTabId, { type: "rc:linkedin-sync-error", message: "A aba do LinkedIn foi fechada antes da sincronização terminar." }).catch(() => undefined);
});
