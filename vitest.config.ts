import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "browser-extension/**/*.test.mjs"],
    // Os testes de integração compartilham o mesmo Postgres e a mesma organização (o ranking
    // é org-wide de propósito): rodando em paralelo, um insere contato no ranking do outro e
    // o afterAll de um apaga dados durante o outro. A suíte roda em ~2s, então serializar sai barato.
    fileParallelism: false,
  },
});
