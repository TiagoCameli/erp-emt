import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";

/** Linha da listagem de transferências entre tanques. */
export interface TransferenciaLinha {
  id: string;
  /** Instante (ISO). A tela mostra em Rio Branco. */
  dataHora: string;
  origemId: string;
  origemNome: string;
  destinoId: string;
  destinoNome: string;
  insumoId: string | null;
  insumoNome: string | null;
  litros: number;
  /** 4 casas (CASAS_VALOR_OPERACIONAL). A lista mostra 2 com MoneyText. */
  valorTotal: number;
  observacoes: string | null;
  /** "manual" ou "migracao". */
  origem: string;
  /** Preenchido só nas linhas da lixeira (quando a página pede os excluídos). */
  excluidoEm: string | null;
  motivoExclusao: string | null;
}

/**
 * Transferências, da mais recente para a mais antiga. Sem `incluirExcluidos`,
 * só as fora da lixeira; com ele (quem pode restaurar), as excluídas vêm junto
 * e a tela mostra ao ligar "Mostrar excluídos". Passa por `todasAsLinhas` (teto
 * de 1.000 do PostgREST) e termina a ordem no id, para a paginação por
 * `.range()` não repetir nem pular linha.
 */
export async function listarTransferencias(
  { incluirExcluidos = false }: { incluirExcluidos?: boolean } = {},
): Promise<TransferenciaLinha[]> {
  const supabase = await createClient();

  const { linhas, erro } = await todasAsLinhas((de, ate) => {
    const consulta = supabase
      .from("combustivel_transferencias")
      .select(
        `id, data_hora, tanque_origem_id, tanque_destino_id, insumo_id, litros, valor_total, observacoes, origem,
         excluido_em, motivo_exclusao,
         tanque_origem:tanques!combustivel_transferencias_tanque_origem_id_fkey(nome),
         tanque_destino:tanques!combustivel_transferencias_tanque_destino_id_fkey(nome),
         insumos(nome)`,
      );
    return (incluirExcluidos ? consulta : consulta.is("excluido_em", null))
      .order("data_hora", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(de, ate);
  });

  if (erro) {
    throw new Error("Não foi possível carregar as transferências");
  }

  return linhas.map((linha) => ({
    id: linha.id,
    dataHora: linha.data_hora,
    origemId: linha.tanque_origem_id,
    origemNome: linha.tanque_origem?.nome ?? "",
    destinoId: linha.tanque_destino_id,
    destinoNome: linha.tanque_destino?.nome ?? "",
    insumoId: linha.insumo_id,
    insumoNome: linha.insumos?.nome ?? null,
    litros: Number(linha.litros),
    valorTotal: Number(linha.valor_total),
    observacoes: linha.observacoes,
    origem: linha.origem,
    excluidoEm: linha.excluido_em,
    motivoExclusao: linha.motivo_exclusao,
  }));
}
