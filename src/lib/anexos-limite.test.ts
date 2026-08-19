import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";
import { TAMANHO_MAXIMO_MB } from "@/lib/arquivos";

const BYTES_POR_MB = 1024 * 1024;

/**
 * Sobra para o resto do corpo da requisição: o multipart carrega o nome do
 * arquivo, os campos entidade/entidadeId e as fronteiras de cada parte. É
 * pequeno perto do arquivo, mas não é zero.
 */
const FOLGA_DO_ENVELOPE_BYTES = 64 * 1024;

/**
 * Teto de payload de function da Vercel, medido contra a produção em
 * 19/08/2026: 4.300.000 bytes passam, 4.500.000 voltam 413
 * FUNCTION_PAYLOAD_TOO_LARGE. Não é configurável — é da plataforma, e nenhum
 * ajuste no Next passa por cima dele.
 */
const TETO_DA_VERCEL_BYTES = 4_500_000;

const limiteDoBody = nextConfig.experimental?.serverActions?.bodySizeLimit;

/**
 * O anexo atravessa TRÊS limites, e o menor manda. Quando a tela prometia 25 MB
 * e ninguém tinha configurado o body limite do Next, o menor era o padrão de
 * 1 MB do Next: todo arquivo acima disso morria antes da action rodar, a tela
 * ficava girando e o anexo sumia sem mensagem. Estes testes prendem a ordem dos
 * três limites para o desencontro não voltar em silêncio.
 */
describe("limite de anexo", () => {
  it("o body limite do Next está configurado em bytes", () => {
    expect(
      typeof limiteDoBody,
      "sem experimental.serverActions.bodySizeLimit o Next corta o corpo em 1 MB",
    ).toBe("number");
  });

  it("o limite anunciado na tela cabe no body limite do Next", () => {
    expect(limiteDoBody as number).toBeGreaterThanOrEqual(
      TAMANHO_MAXIMO_MB * BYTES_POR_MB + FOLGA_DO_ENVELOPE_BYTES,
    );
  });

  it("o body limite do Next cabe no teto de payload da Vercel", () => {
    expect(limiteDoBody as number).toBeLessThan(TETO_DA_VERCEL_BYTES);
  });
});
