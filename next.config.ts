import type { NextConfig } from "next";

import { ANEXO_BODY_LIMITE_BYTES } from "./src/lib/anexos-limite";

const nextConfig: NextConfig = {
  /**
   * Origens liberadas para os recursos de dev do Next (HMR e bundle do cliente).
   * Sem isto, abrir o dev server por outro host que não localhost carrega o HTML
   * (renderizado no servidor) mas NÃO carrega o JS: a tela aparece e nada
   * funciona, porque não houve hidratação. Vale só em desenvolvimento.
   *
   * O IP da rede local está aqui porque a extensão do Chrome não abre localhost.
   */
  allowedDevOrigins: ["192.168.1.211", "localhost", "127.0.0.1"],

  experimental: {
    serverActions: {
      /**
       * Tamanho máximo do CORPO de uma server action. O padrão do Next é 1 MB,
       * e era ele que derrubava anexo: o corpo estourava, o Next respondia erro
       * antes de `enviarAnexos` rodar e a tela ficava girando sem dizer nada.
       *
       * O número sai de `src/lib/anexos-limite.ts` para não haver dois limites
       * discordando — foi o desencontro que causou o bug.
       */
      bodySizeLimit: ANEXO_BODY_LIMITE_BYTES,
    },
  },
};

export default nextConfig;
