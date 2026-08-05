"use server";


import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { proximoMes } from "@/modules/financeiro/relatorios/calculo";
import { custoPorInsumo } from "@/modules/financeiro/relatorios/queries";

const MES = /^\d{4}-\d{2}$/;

/**
 * Nível 3 do drill-down do custo por grupo: os insumos de uma subcategoria no
 * mês. Vem por ação (e não pronto na página) porque é o único nível que pode ter
 * centenas de linhas, e ninguém abre todas as subcategorias.
 */
export async function insumosDaSubcategoria(
  categoriaId: string,
  mes: string,
): Promise<
  { insumos: { nome: string; quantidade: number; valor: number }[] } | { erro: string }
> {
  const usuario = await getUsuarioLogado();
  if (!temPermissao(usuario, "financeiro.relatorios", "ver")) {
    return { erro: "Sem permissão para ver relatórios" };
  }

  const idValido = idSchema.safeParse(categoriaId);
  if (!idValido.success) return { erro: "Subcategoria inválida" };
  if (!MES.test(mes)) return { erro: "Mês inválido" };

  const insumos = await custoPorInsumo(idValido.data, {
    inicio: `${mes}-01`,
    fim: proximoMes(mes),
  });

  return { insumos };
}
