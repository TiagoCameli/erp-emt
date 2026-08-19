import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";
import { ANEXO_TAMANHO_MAXIMO_MB } from "@/lib/anexos-limite";
import { ehCaminhoDeUpload, pathNovo } from "@/lib/arquivos";

const BYTES_POR_MB = 1024 * 1024;

/**
 * Teto de payload de function da Vercel, medido contra a produção em
 * 19/08/2026: 4.300.000 bytes passam, 4.500.000 voltam 413
 * FUNCTION_PAYLOAD_TOO_LARGE. Não é configurável — é da plataforma, e nenhum
 * ajuste no Next passa por cima dele. É por isto que o binário do anexo saiu da
 * server action: acima disso não existe configuração que resolva.
 */
const TETO_DA_VERCEL_BYTES = 4_500_000;

const limiteDoBody = nextConfig.experimental?.serverActions?.bodySizeLimit;

/**
 * O que a ÚLTIMA migration deixa em `storage.buckets.file_size_limit`.
 *
 * O bucket é o único ponto do caminho que ainda pode recusar um anexo grande,
 * porque os bytes não passam mais pelo servidor da aplicação. Limite anunciado
 * na tela que ninguém aplica do lado do servidor é promessa, não limite — foi
 * esse desencontro (tela em 25 MB, corte real em 1 MB) que trouxe a obra.
 */
function limiteDoBucketEmMb(): number | null {
  const pasta = path.resolve(__dirname, "../../supabase/migrations");
  const arquivos = readdirSync(pasta).sort();
  let encontrado: number | null = null;
  for (const nome of arquivos) {
    const sql = readFileSync(path.join(pasta, nome), "utf8");
    if (!/update\s+storage\.buckets/i.test(sql)) continue;
    const casado = /file_size_limit\s*=\s*(\d+)\s*\*\s*1024\s*\*\s*1024/i.exec(
      sql,
    );
    if (casado) encontrado = Number(casado[1]);
  }
  return encontrado;
}

describe("limite de anexo", () => {
  it("o bucket aplica o mesmo limite que a tela anuncia", () => {
    expect(
      limiteDoBucketEmMb(),
      "mudou ANEXO_TAMANHO_MAXIMO_MB? então falta a migration que ajusta storage.buckets.file_size_limit",
    ).toBe(ANEXO_TAMANHO_MAXIMO_MB);
  });

  it("o anexo não depende mais do corpo da server action", () => {
    // Se um dia o binário voltar a subir por FormData, este número passa a ser
    // o teto real de novo — e ele é MENOR que o limite anunciado.
    expect(ANEXO_TAMANHO_MAXIMO_MB * BYTES_POR_MB).toBeGreaterThan(
      TETO_DA_VERCEL_BYTES,
    );
  });
});

describe("limite de corpo das server actions", () => {
  it("está configurado em bytes", () => {
    expect(
      typeof limiteDoBody,
      "sem experimental.serverActions.bodySizeLimit o Next corta o corpo em 1 MB, e o OFX de um mês passa disso",
    ).toBe("number");
  });

  it("cabe no teto de payload da Vercel", () => {
    expect(limiteDoBody as number).toBeLessThan(TETO_DA_VERCEL_BYTES);
  });
});

describe("ehCaminhoDeUpload", () => {
  it("aceita o caminho que o próprio servidor emite", () => {
    expect(ehCaminhoDeUpload(pathNovo("nota fiscal.pdf"))).toBe(true);
    expect(ehCaminhoDeUpload(pathNovo("sem-extensao"))).toBe(true);
  });

  it("recusa caminho que não veio de pathNovo", () => {
    // O caminho volta pela mão do cliente na confirmação do envio: sem esta
    // trava daria para confirmar apontando para o objeto de outro anexo.
    expect(ehCaminhoDeUpload("arquivos/../../segredo.pdf")).toBe(false);
    expect(ehCaminhoDeUpload("outra-pasta/2026/08/x.pdf")).toBe(false);
    expect(ehCaminhoDeUpload("arquivos/2026/08/nota.pdf")).toBe(false);
    expect(ehCaminhoDeUpload("")).toBe(false);
  });
});
