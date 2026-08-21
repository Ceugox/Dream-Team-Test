// Match pattern de content script não aceita porta: "http://localhost/*" injeta em QUALQUER
// porta local. A confiança precisa ser decidida aqui, por origem exata.
const TRUSTED_APP_ORIGINS = [
  "https://referral-copilot-mvp-production.up.railway.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

function isTrustedAppOrigin(origin) {
  if (typeof origin !== "string" || !origin) return false;
  return TRUSTED_APP_ORIGINS.indexOf(origin) !== -1;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { isTrustedAppOrigin: isTrustedAppOrigin, TRUSTED_APP_ORIGINS: TRUSTED_APP_ORIGINS };
}
