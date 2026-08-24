import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Uma opção de centro de custo para os formulários que apontam dinheiro.
 *
 * `paiId` e `tipo` entram porque a escolha é em DOIS PASSOS: o primeiro campo
 * oferece as raízes e o segundo, quando existe, as etapas daquela raiz. Sem a
 * hierarquia na mesma lista o componente teria que ir ao banco de novo a cada
 * troca de centro, e o segundo campo piscaria vazio no meio do preenchimento.
 *
 * `tipo` só existe na RAIZ (o CHECK do banco exige nulo nos níveis 2 e 3), e é
 * ele que decide o rótulo do segundo campo: "Equipamento" na manutenção, "Etapa"
 * nas obras. Etapa de obra e equipamento são a mesma coisa no schema e coisas
 * diferentes na boca de quem preenche.
 */
export interface CentroCustoOpcao {
  id: string;
  nome: string;
  codigo: string | null;
  /** Nulo na raiz. */
  paiId: string | null;
  /** `obra`, `escritorio`, `manutencao`. Nulo fora da raiz. */
  tipo: string | null;
}

/**
 * Todos os centros de custo ativos, raízes e etapas, em ordem de código.
 *
 * É a lista de ESCRITA: quem aponta custo precisa alcançar a etapa, porque é lá
 * que o custo de uma máquina mora. Não confundir com `listarCentrosCustoRaiz`
 * dos relatórios, que oferece só raiz porque relatório de centro agrupa na raiz.
 *
 * Uma consulta só para os dois níveis: são 73 linhas hoje (12 raízes e 61
 * etapas), então paginar ou buscar a etapa sob demanda só adicionaria estado.
 */
export async function listarCentrosCusto(): Promise<CentroCustoOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("centros_custo")
    .select("id, nome, codigo, pai_id, tipo")
    .eq("ativo", true)
    .order("codigo", { ascending: true, nullsFirst: false })
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar os centros de custo");
  }

  return (data ?? []).map((centro) => ({
    id: centro.id,
    nome: centro.nome,
    codigo: centro.codigo,
    paiId: centro.pai_id,
    tipo: centro.tipo,
  }));
}
