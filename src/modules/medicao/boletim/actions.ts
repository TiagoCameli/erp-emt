"use server";

import { erroAcao } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { carregarBoletim } from "@/modules/medicao/boletim/queries";

export type ResultadoPlanilhaBoletim = { base64: string; nomeArquivo: string } | { erro: string };

/**
 * O boletim "até a Nª" (`ate` nulo = última medição) em .xlsx. Exportar é ler: mesma permissão que
 * abre a tela (`medicao.boletim/ver`), e a RPC confere de novo o acesso ao contrato. A planilha é
 * escrita só com o que a RPC devolveu (D7); a recusa do banco volta como está, em vez de um arquivo
 * vazio.
 *
 * O módulo da planilha entra por `await import`: ele puxa o exceljs, que é grande.
 */
export async function gerarPlanilhaBoletim(
  contratoId: string,
  ate: number | null,
): Promise<ResultadoPlanilhaBoletim> {
  try {
    await exigirPermissao("medicao.boletim", "ver");
  } catch {
    return { erro: "Sem permissão para exportar o boletim" };
  }

  if (!idSchema.safeParse(contratoId).success) return { erro: "Escolha o contrato para exportar o boletim" };
  if (ate !== null && !(Number.isInteger(ate) && ate >= 1)) return { erro: "Medição inválida para exportar" };

  try {
    const { boletim, erro } = await carregarBoletim(contratoId, ate);
    if (!boletim) return { erro: erro ?? "Não foi possível carregar o boletim." };

    const { montarPlanilhaBoletim, nomeArquivoBoletim } = await import("@/modules/medicao/boletim/planilha");
    const workbook = await montarPlanilhaBoletim(boletim);
    workbook.created = new Date();
    const conteudo = await workbook.xlsx.writeBuffer();

    return { base64: Buffer.from(conteudo).toString("base64"), nomeArquivo: nomeArquivoBoletim(boletim) };
  } catch (e) {
    return erroAcao("medicao.boletim.gerarPlanilhaBoletim", e, "Não foi possível gerar a planilha do boletim. Tente novamente");
  }
}
