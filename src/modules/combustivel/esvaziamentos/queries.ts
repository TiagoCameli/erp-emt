import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";

/** Linha da listagem de esvaziamentos. */
export interface EsvaziamentoLinha {
  id: string;
  /** Instante (ISO). A tela mostra em Rio Branco. */
  dataHora: string;
  tanqueId: string;
  tanqueNome: string;
  litros: number;
  motivo: string;
  /** 4 casas (CASAS_VALOR_OPERACIONAL). A lista mostra 2 com MoneyText. */
  valorPerda: number;
  /** "manual" ou "migracao". */
  origem: string;
  /** Preenchido só nas linhas da lixeira (quando a página pede os excluídos). */
  excluidoEm: string | null;
  motivoExclusao: string | null;
}

/**
 * Esvaziamentos, do mais recente para o mais antigo. Sem `incluirExcluidos`, só
 * os fora da lixeira; com ele (quem pode restaurar), os excluídos vêm junto e a
 * tela mostra ao ligar "Mostrar excluídos".
 */
export async function listarEsvaziamentos(
  { incluirExcluidos = false }: { incluirExcluidos?: boolean } = {},
): Promise<EsvaziamentoLinha[]> {
  const supabase = await createClient();

  const { linhas, erro } = await todasAsLinhas((de, ate) => {
    const consulta = supabase
      .from("combustivel_esvaziamentos")
      .select("id, data_hora, tanque_id, litros, motivo, valor_perda, origem, excluido_em, motivo_exclusao, tanques(nome)");
    return (incluirExcluidos ? consulta : consulta.is("excluido_em", null))
      .order("data_hora", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(de, ate);
  });

  if (erro) {
    throw new Error("Não foi possível carregar os esvaziamentos");
  }

  return linhas.map((linha) => ({
    id: linha.id,
    dataHora: linha.data_hora,
    tanqueId: linha.tanque_id,
    tanqueNome: linha.tanques?.nome ?? "",
    litros: Number(linha.litros),
    motivo: linha.motivo,
    valorPerda: Number(linha.valor_perda),
    origem: linha.origem,
    excluidoEm: linha.excluido_em,
    motivoExclusao: linha.motivo_exclusao,
  }));
}
