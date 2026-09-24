"use server";

import { semLancar } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { buscarAbastecimento, type AbastecimentoCompleto } from "@/modules/combustivel/abastecimentos/queries";

export type ResultadoDetalhe = { ok: true; abastecimento: AbastecimentoCompleto } | { erro: string };

/**
 * Leitura do abastecimento para o drawer de detalhe da lista (o SaidaDetalhesDrawer da
 * origem) e para o "Editar" do menu da linha. Só leitura: pede "ver" na aba, e a RLS
 * confere de novo. Arquivo à parte das mutações (`actions.ts`) de propósito: aqui não há
 * regra de negócio, só a mesma consulta da página `[id]`.
 */
export async function carregarAbastecimento(id: string): Promise<ResultadoDetalhe> {
  return semLancar("combustivel.saidas.detalhe", async () => {
    const usuario = await getUsuarioLogado();
    if (!usuario || !temPermissao(usuario, "combustivel.saidas", "ver")) {
      return { erro: "Sem permissão para ver abastecimento" };
    }
    if (!idSchema.safeParse(id).success) return { erro: "Abastecimento inválido" };
    const abastecimento = await buscarAbastecimento(id);
    if (!abastecimento) return { erro: "Abastecimento não encontrado. Ele pode ter sido excluído" };
    return { ok: true as const, abastecimento };
  });
}
