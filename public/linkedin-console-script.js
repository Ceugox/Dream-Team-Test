// NOTE: LinkedIn's DOM class names change over time and by locale. If this
// script finds 0 connections, open DevTools > Elements on one connection
// card, find the real class names for the name/headline/profile-link, and
// update the three querySelector calls below accordingly. The extraction
// LOGIC (scroll-until-stable, dedupe by profileUrl, download JSON) does not
// need to change.

(async function extractLinkedInConnections() {
  function collectVisible() {
    const cards = document.querySelectorAll("[data-view-name='connections-list-item'], .mn-connection-card");
    const results = [];
    cards.forEach((card) => {
      const link = card.querySelector("a[href*='/in/']");
      const nameEl = card.querySelector(".mn-connection-card__name, [data-anonymize='person-name']");
      const headlineEl = card.querySelector(".mn-connection-card__occupation, [data-anonymize='headline']");
      if (!link || !nameEl) return;
      results.push({
        name: nameEl.textContent.trim(),
        headline: headlineEl ? headlineEl.textContent.trim() : "",
        profileUrl: link.href.split("?")[0],
      });
    });
    return results;
  }

  const seen = new Map();
  let stableRounds = 0;
  const MAX_STABLE_ROUNDS = 4;

  while (stableRounds < MAX_STABLE_ROUNDS) {
    const before = seen.size;
    collectVisible().forEach((person) => seen.set(person.profileUrl, person));
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    if (seen.size === before) {
      stableRounds += 1;
    } else {
      stableRounds = 0;
    }
  }

  const connections = Array.from(seen.values());
  const blob = new Blob([JSON.stringify(connections, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "connections.json";
  a.click();
  URL.revokeObjectURL(url);

  console.log(`Extracted ${connections.length} connections -> connections.json downloaded.`);
})();
