const CONNECTIONS_URL = "https://www.linkedin.com/mynetwork/invite-connect/connections/";

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
    const popup = await chrome.windows.create({ url: CONNECTIONS_URL, type: "popup", width: 560, height: 780, focused: true });
    await chrome.storage.session.set({ rcLinkedinWindowId: popup.id });
  } catch (error) {
    await chrome.storage.session.remove(["rcReturnTabId", "rcSyncActive", "rcStartedAt"]);
    throw error;
  }
}

async function relayToApp(message, linkedinTabId) {
  const { rcReturnTabId, rcLinkedinWindowId } = await chrome.storage.session.get(["rcReturnTabId", "rcLinkedinWindowId"]);
  if (!rcReturnTabId) return;
  await chrome.tabs.sendMessage(rcReturnTabId, message).catch(() => undefined);
  if (message.type === "rc:linkedin-sync-complete" || message.type === "rc:linkedin-sync-error") {
    await chrome.storage.session.remove(["rcReturnTabId", "rcLinkedinWindowId", "rcSyncActive", "rcStartedAt"]);
    await chrome.tabs.update(rcReturnTabId, { active: true }).catch(() => undefined);
    if (rcLinkedinWindowId) await chrome.windows.remove(rcLinkedinWindowId).catch(() => chrome.tabs.remove(linkedinTabId).catch(() => undefined));
    else await chrome.tabs.remove(linkedinTabId).catch(() => undefined);
  }
}

chrome.windows.onRemoved.addListener(async windowId => {
  const state = await chrome.storage.session.get(["rcReturnTabId", "rcLinkedinWindowId", "rcSyncActive"]);
  if (!state.rcSyncActive || state.rcLinkedinWindowId !== windowId || !state.rcReturnTabId) return;
  await chrome.storage.session.remove(["rcReturnTabId", "rcLinkedinWindowId", "rcSyncActive", "rcStartedAt"]);
  await chrome.tabs.sendMessage(state.rcReturnTabId, { type: "rc:linkedin-sync-error", message: "A janela do LinkedIn foi fechada antes da sincronização terminar." }).catch(() => undefined);
});
