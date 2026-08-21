// Match pattern de content script não aceita porta: "http://localhost/*" injeta em QUALQUER
// porta local. A confiança precisa ser decidida aqui, por origem exata.
const PRODUCTION_APP_ORIGIN = "https://referral-copilot-mvp-production.up.railway.app";

// As origens de desenvolvimento existem só para rodar o app local. A porta 3000 é
// compartilhada com qualquer outro projeto da máquina, então ali a coleta exige
// confirmação explícita do usuário — uma página hostil não consegue suprimir o diálogo.
const DEVELOPMENT_APP_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

const TRUSTED_APP_ORIGINS = [PRODUCTION_APP_ORIGIN].concat(DEVELOPMENT_APP_ORIGINS);

function isTrustedAppOrigin(origin) {
  if (typeof origin !== "string" || !origin) return false;
  return TRUSTED_APP_ORIGINS.indexOf(origin) !== -1;
}

function requiresUserConfirmation(origin) {
  return DEVELOPMENT_APP_ORIGINS.indexOf(origin) !== -1;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    isTrustedAppOrigin: isTrustedAppOrigin,
    requiresUserConfirmation: requiresUserConfirmation,
    TRUSTED_APP_ORIGINS: TRUSTED_APP_ORIGINS,
    PRODUCTION_APP_ORIGIN: PRODUCTION_APP_ORIGIN,
    DEVELOPMENT_APP_ORIGINS: DEVELOPMENT_APP_ORIGINS,
  };
}
