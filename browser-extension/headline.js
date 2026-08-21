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
