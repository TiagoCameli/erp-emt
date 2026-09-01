import type { NextConfig } from "next";

import { BODY_MAXIMO_SERVER_ACTION_BYTES } from "./src/lib/anexos-limite";

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

  /**
   * pdfmake fica FORA do bundle do servidor.
   *
   * O `@/lib/pdf` importa `pdfmake/src/printer`, que carrega o pdfkit, e o
   * pdfkit LÊ ARQUIVO DE FONTE do disco (.afm das 14 fontes padrão do PDF) na
   * hora do load. Quando o bundler reescreve esses requires, o arquivo não
   * viaja junto e o módulo estoura em produção — passando no build e no local,
   * onde `node_modules` existe no disco.
   *
   * Declarar como externo faz o Next deixar o `require` intacto e resolver de
   * `node_modules` em tempo de execução, que é onde o pdfkit espera achar as
   * fontes.
   *
   * Isto anda junto com o import DINÂMICO em `rh/folha/actions.ts`: o externo
   * conserta o carregamento, e o dinâmico garante que, se ele voltar a
   * estourar, leve só o botão de PDF — não a aprovação da folha.
   */
  serverExternalPackages: ["pdfmake"],

  experimental: {
    serverActions: {
      /**
       * Tamanho máximo do CORPO de uma server action. O padrão do Next é 1 MB,
       * e era ele que derrubava anexo antes de o binário passar a ir direto
       * para o Storage: o corpo estourava, o Next respondia erro antes da
       * action rodar e a tela ficava girando sem dizer nada.
       *
       * Hoje serve ao que ainda sobe por FormData (OFX, planilha de cadastro).
       * O número sai de `src/lib/anexos-limite.ts`, junto com a explicação de
       * por que ele não é o limite do anexo.
       */
      bodySizeLimit: BODY_MAXIMO_SERVER_ACTION_BYTES,
    },
  },
};

export default nextConfig;
