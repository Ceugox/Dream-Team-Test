const CONNECTIONS_URL = "https://www.linkedin.com/mynetwork/invite-connect/connections/";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "rc:start-linkedin-sync" && sender.tab?.id) {
    chrome.storage.session.set({ rcReturnTabId: sender.tab.id, rcSyncActive: true, rcStartedAt: Date.now() })
      .then(() => chrome.tabs.create({ url: CONNECTIONS_URL, active: true }))
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if ((message?.type === "rc:linkedin-sync-progress" || message?.type === "rc:linkedin-sync-complete" || message?.type === "rc:linkedin-sync-error") && sender.tab?.id) {
    relayToApp(message, sender.tab.id);
  }
});

async function relayToApp(message, linkedinTabId) {
  const { rcReturnTabId } = await chrome.storage.session.get("rcReturnTabId");
  if (!rcReturnTabId) return;
  await chrome.tabs.sendMessage(rcReturnTabId, message).catch(() => undefined);
  if (message.type === "rc:linkedin-sync-complete" || message.type === "rc:linkedin-sync-error") {
    await chrome.storage.session.remove(["rcReturnTabId", "rcSyncActive", "rcStartedAt"]);
    await chrome.tabs.update(rcReturnTabId, { active: true }).catch(() => undefined);
    await chrome.tabs.remove(linkedinTabId).catch(() => undefined);
  }
}
