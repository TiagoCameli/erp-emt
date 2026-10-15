import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import { codificarLocal } from "@/modules/estoque/calculo";

export interface TransferenciaLinha {
  id: string;
  dataSaida: string;
  dataChegada: string;
  /** `codificarLocal(...)` da origem e do destino. */
  origem: string;
  origemNome: string;
  destino: string;
  destinoNome: string;
  insumoId: string;
  insumoNome: string;
  unidade: string | null;
  quantidade: number;
  /** Custo PEPS do que saiu da origem. */
  custoOrigem: number;
  custoAdicional: number;
  /** (custo da origem + adicional) / quantidade: o valor unitário no destino. */
  valorUnitarioDestino: number;
  /** Veio de um frete: só muda pelo Frete. */
  freteId: string | null;
  observacoes: string | null;
  excluida: boolean;
  motivoExclusao: string | null;
}

type Local = {
  deposito: { nome: string } | null;
  tanque: { nome: string } | null;
  pilha: { nome: string } | null;
};

function local(ids: { deposito: string | null; tanque: string | null; pilha: string | null }, nomes: Local) {
  if (ids.tanque) return { id: codificarLocal("tanque", ids.tanque), nome: `${nomes.tanque?.nome ?? ""} (tanque)` };
  if (ids.pilha) return { id: codificarLocal("pilha", ids.pilha), nome: `${nomes.pilha?.nome ?? ""} (pilha)` };
  return { id: codificarLocal("deposito", ids.deposito ?? ""), nome: nomes.deposito?.nome ?? "" };
}

/** Todas as transferências (manuais e de frete), as excluídas também: a tela filtra. */
export async function listarTransferencias(): Promise<TransferenciaLinha[]> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("estoque_transferencias")
      .select(
        `id, data_saida, data_chegada, quantidade, custo_adicional, frete_id, observacoes, excluido_em, motivo_exclusao,
         insumo_id, origem_deposito_id, origem_tanque_id, origem_pilha_id,
         destino_deposito_id, destino_tanque_id, destino_pilha_id,
         insumos(nome, unidades_medida(sigla)),
         od:almoxarifado_depositos!estoque_transferencias_origem_deposito_id_fkey(nome),
         ot:tanques!estoque_transferencias_origem_tanque_id_fkey(nome),
         op:estoque_pilhas!estoque_transferencias_origem_pilha_id_fkey(nome),
         dd:almoxarifado_depositos!estoque_transferencias_destino_deposito_id_fkey(nome),
         dt:tanques!estoque_transferencias_destino_tanque_id_fkey(nome),
         dp:estoque_pilhas!estoque_transferencias_destino_pilha_id_fkey(nome),
         estoque_saidas(valor_total),
         estoque_entradas(valor_unitario)`,
      )
      .order("data_saida", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(de, ate),
  );
  if (erro) throw new Error("Não foi possível carregar as transferências");

  return linhas.map((linha) => {
    const origem = local(
      { deposito: linha.origem_deposito_id, tanque: linha.origem_tanque_id, pilha: linha.origem_pilha_id },
      { deposito: linha.od, tanque: linha.ot, pilha: linha.op },
    );
    const destino = local(
      { deposito: linha.destino_deposito_id, tanque: linha.destino_tanque_id, pilha: linha.destino_pilha_id },
      { deposito: linha.dd, tanque: linha.dt, pilha: linha.dp },
    );
    return {
      id: linha.id,
      dataSaida: linha.data_saida,
      dataChegada: linha.data_chegada,
      origem: origem.id,
      origemNome: origem.nome,
      destino: destino.id,
      destinoNome: destino.nome,
      insumoId: linha.insumo_id,
      insumoNome: linha.insumos?.nome ?? "",
      unidade: linha.insumos?.unidades_medida?.sigla ?? null,
      quantidade: Number(linha.quantidade),
      custoOrigem: Number(linha.estoque_saidas[0]?.valor_total ?? 0),
      custoAdicional: Number(linha.custo_adicional),
      valorUnitarioDestino: Number(linha.estoque_entradas[0]?.valor_unitario ?? 0),
      freteId: linha.frete_id,
      observacoes: linha.observacoes,
      excluida: linha.excluido_em !== null,
      motivoExclusao: linha.motivo_exclusao,
    };
  });
}
