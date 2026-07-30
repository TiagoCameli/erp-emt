import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // O Next resolve `server-only` para um módulo VAZIO na condição
      // "react-server" (é como o marcador funciona: ele só estoura se acabar no
      // bundle do cliente). No Vitest, sem essa condição, o pacote cai no
      // index.js que lança sempre, e isso impede testar client component que
      // importa TIPO de um módulo de servidor. Aqui replicamos o mesmo.
      "server-only": path.resolve(
        __dirname,
        "./node_modules/server-only/empty.js",
      ),
    },
  },
});
