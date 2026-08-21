const PAGE_SOURCE = "referral-copilot-app";
const EXTENSION_SOURCE = "referral-copilot-extension";

// origins.js é injetado antes deste arquivo (ver manifest) e expõe isTrustedAppOrigin.
// Sem esta porta, qualquer página em outra porta local iniciaria a coleta e receberia
// a lista completa de conexões pelo relay abaixo.
if (isTrustedAppOrigin(window.location.origin)) {
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    if (event.data?.source !== PAGE_SOURCE || event.data?.type !== "rc:start-linkedin-sync") return;
    if (requiresUserConfirmation(window.location.origin) && !window.confirm("Iniciar a coleta das suas conexões do LinkedIn para este site local?")) {
      window.postMessage({ source: EXTENSION_SOURCE, type: "rc:linkedin-sync-error", message: "Coleta cancelada." }, window.location.origin);
      return;
    }
    window.postMessage({ source: EXTENSION_SOURCE, type: "rc:linkedin-extension-ready" }, window.location.origin);
    chrome.runtime.sendMessage({ type: "rc:start-linkedin-sync" }).catch(() => {
      window.postMessage({ source: EXTENSION_SOURCE, type: "rc:linkedin-sync-error", message: "Não foi possível iniciar o conector." }, window.location.origin);
    });
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message?.type?.startsWith("rc:linkedin-")) return;
    window.postMessage({ source: EXTENSION_SOURCE, ...message }, window.location.origin);
  });
}
