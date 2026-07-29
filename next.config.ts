import type { NextConfig } from "next";

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
};

export default nextConfig;
