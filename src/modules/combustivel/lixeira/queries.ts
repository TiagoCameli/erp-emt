import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import { obraDaSaida, raizDoCentro, rotuloOrigemEquipamento } from "@/modules/combustivel/anomalias/base";
import {
  montarItemEntrada,
  montarItemEsvaziamento,
  montarItemSaida,
  montarItemTransferencia,
  type ItemLixeira,
} from "@/modules/combustivel/lixeira/montar";
import type { PermissoesLixeira, TipoLixeira } from "@/modules/combustivel/lixeira/permissoes";
import { paraNumeroDoBanco } from "@/modules/manutencao/servicos/formato";

export type LixeiraCombustivel = Record<TipoLixeira, ItemLixeira[]>;

interface LinhaSaidaExcluida {
  id: string;
  data: string;
  litros: number | string;
  valor_total: number | string;
  tipo_consumidor: string;
  placa: string | null;
  equipamento_id: string | null;
  tanque_id: string | null;
  transportadora_id: string | null;
  excluido_em: string | null;
  excluido_por: string | null;
  motivo_exclusao: string | null;
  abastecimento_alocacoes: { centro_custo_id: string; percentual: number | string }[] | null;
}

interface LinhaEntradaExcluida {
  id: string;
  data_hora: string;
  litros: number | string;
  valor_total: number | string;
  nota_fiscal: string | null;
  tanque_id: string;
  excluido_em: string | null;
  excluido_por: string | null;
  motivo_exclusao: string | null;
  fornecedores: { razao_social: string; nome_fantasia: string | null } | null;
}

interface LinhaTransferenciaExcluida {
  id: string;
  data_hora: string;
  litros: number | string;
  tanque_origem_id: string;
  tanque_destino_id: string;
  excluido_em: string | null;
  excluido_por: string | null;
  motivo_exclusao: string | null;
}

interface LinhaEsvaziamentoExcluido {
  id: string;
  data_hora: string;
  litros: number | string;
  valor_perda: number | string;
  motivo: string;
  tanque_id: string;
  excluido_em: string | null;
  excluido_por: string | null;
  motivo_exclusao: string | null;
}

type Resultado<T> = { linhas: T[]; erro: unknown };
const NADA = <T,>(): Promise<Resultado<T>> => Promise.resolve({ linhas: [], erro: null });

/**
 * Os registros excluídos (soft delete, `excluido_em` preenchido) das quatro movimentações
 * do Combustível, mais recente primeiro. Só lê a seção que o usuário pode ver. Passa por
 * `todasAsLinhas` (o PostgREST corta em 1.000 sem avisar) com desempate por id.
 *
 * Nomes: tanques, equipamentos e centros vêm de uma leitura só (sem embed duplo em
 * `tanques`, que a transferência tem duas vezes); quem excluiu, pela RPC da auditoria
 * (`nomes_usuarios_auditoria`), que funciona sem permissão de ver usuários.
 */
export async function carregarLixeiraCombustivel(permissoes: PermissoesLixeira): Promise<LixeiraCombustivel> {
  const supabase = await createClient();

  const [saidas, entradas, transferencias, esvaziamentos] = await Promise.all([
    permissoes.saida.ver
      ? todasAsLinhas<LinhaSaidaExcluida>((de, ate) =>
          supabase
            .from("combustivel_saidas")
            .select(
              "id, data, litros, valor_total, tipo_consumidor, placa, equipamento_id, tanque_id, transportadora_id, excluido_em, excluido_por, motivo_exclusao, abastecimento_alocacoes(centro_custo_id, percentual)",
            )
            .not("excluido_em", "is", null)
            .order("excluido_em", { ascending: false })
            .order("id")
            .range(de, ate)
            .returns<LinhaSaidaExcluida[]>(),
        )
      : NADA<LinhaSaidaExcluida>(),
    permissoes.entrada.ver
      ? todasAsLinhas<LinhaEntradaExcluida>((de, ate) =>
          supabase
            .from("combustivel_entradas")
            .select(
              "id, data_hora, litros, valor_total, nota_fiscal, tanque_id, excluido_em, excluido_por, motivo_exclusao, fornecedores(razao_social, nome_fantasia)",
            )
            .not("excluido_em", "is", null)
            .order("excluido_em", { ascending: false })
            .order("id")
            .range(de, ate)
            .returns<LinhaEntradaExcluida[]>(),
        )
      : NADA<LinhaEntradaExcluida>(),
    permissoes.transferencia.ver
      ? todasAsLinhas<LinhaTransferenciaExcluida>((de, ate) =>
          supabase
            .from("combustivel_transferencias")
            .select("id, data_hora, litros, tanque_origem_id, tanque_destino_id, excluido_em, excluido_por, motivo_exclusao")
            .not("excluido_em", "is", null)
            .order("excluido_em", { ascending: false })
            .order("id")
            .range(de, ate)
            .returns<LinhaTransferenciaExcluida[]>(),
        )
      : NADA<LinhaTransferenciaExcluida>(),
    permissoes.esvaziamento.ver
      ? todasAsLinhas<LinhaEsvaziamentoExcluido>((de, ate) =>
          supabase
            .from("combustivel_esvaziamentos")
            .select("id, data_hora, litros, valor_perda, motivo, tanque_id, excluido_em, excluido_por, motivo_exclusao")
            .not("excluido_em", "is", null)
            .order("excluido_em", { ascending: false })
            .order("id")
            .range(de, ate)
            .returns<LinhaEsvaziamentoExcluido[]>(),
        )
      : NADA<LinhaEsvaziamentoExcluido>(),
  ]);
  if (saidas.erro || entradas.erro || transferencias.erro || esvaziamentos.erro) {
    throw new Error("Não foi possível carregar a lixeira do combustível");
  }

  const precisaCentros = saidas.linhas.some((s) => (s.abastecimento_alocacoes ?? []).length > 0);
  const precisaEquipamentos = saidas.linhas.some((s) => s.equipamento_id);
  const [tanques, equipamentos, centros] = await Promise.all([
    todasAsLinhas((de, ate) => supabase.from("tanques").select("id, nome, apelido").order("id").range(de, ate)),
    precisaEquipamentos
      ? todasAsLinhas((de, ate) =>
          supabase.from("equipamentos").select("id, codigo, descricao, tipo").order("id").range(de, ate),
        )
      : NADA<{ id: string; codigo: string | null; descricao: string; tipo: string | null }>(),
    precisaCentros
      ? todasAsLinhas((de, ate) => supabase.from("centros_custo").select("id, nome, pai_id").order("id").range(de, ate))
      : NADA<{ id: string; nome: string; pai_id: string | null }>(),
  ]);
  if (tanques.erro || equipamentos.erro || centros.erro) {
    throw new Error("Não foi possível carregar os cadastros da lixeira do combustível");
  }

  const nomeTanque = new Map(tanques.linhas.map((t) => [t.id, t.apelido?.trim() || t.nome]));
  const rotuloEquipamento = new Map(equipamentos.linhas.map((e) => [e.id, rotuloOrigemEquipamento(e)]));
  const arvore = new Map(centros.linhas.map((c) => [c.id, { nome: c.nome, paiId: c.pai_id }]));

  const idsUsuarios = [
    ...new Set(
      [...saidas.linhas, ...entradas.linhas, ...transferencias.linhas, ...esvaziamentos.linhas]
        .map((l) => l.excluido_por)
        .filter((id): id is string => id !== null),
    ),
  ];
  const nomeUsuario = new Map<string, string>();
  if (idsUsuarios.length > 0) {
    const { data } = await supabase.rpc("nomes_usuarios_auditoria", { p_ids: idsUsuarios });
    for (const usuario of data ?? []) nomeUsuario.set(usuario.id, usuario.nome);
  }
  const quem = (id: string | null) => (id ? (nomeUsuario.get(id) ?? null) : null);
  const tanque = (id: string | null) => (id ? (nomeTanque.get(id) ?? null) : null);

  return {
    saida: saidas.linhas.map((s) => {
      const obraId = obraDaSaida(
        (s.abastecimento_alocacoes ?? []).map((a) => ({
          centroRaizId: raizDoCentro(a.centro_custo_id, arvore)?.id ?? null,
          percentual: paraNumeroDoBanco(a.percentual),
        })),
      );
      return montarItemSaida({
        id: s.id,
        data: s.data,
        litros: paraNumeroDoBanco(s.litros),
        valorTotal: paraNumeroDoBanco(s.valor_total),
        consumidor: s.equipamento_id ? (rotuloEquipamento.get(s.equipamento_id) ?? s.placa) : s.placa,
        obra: obraId ? (arvore.get(obraId)?.nome ?? null) : null,
        tanque: tanque(s.tanque_id),
        motivo: s.motivo_exclusao,
        excluidoEm: s.excluido_em,
        excluidoPor: quem(s.excluido_por),
      });
    }),
    entrada: entradas.linhas.map((e) =>
      montarItemEntrada({
        id: e.id,
        dataHora: e.data_hora,
        litros: paraNumeroDoBanco(e.litros),
        valorTotal: paraNumeroDoBanco(e.valor_total),
        fornecedor: e.fornecedores ? e.fornecedores.nome_fantasia?.trim() || e.fornecedores.razao_social : null,
        tanque: tanque(e.tanque_id),
        notaFiscal: e.nota_fiscal,
        motivo: e.motivo_exclusao,
        excluidoEm: e.excluido_em,
        excluidoPor: quem(e.excluido_por),
      }),
    ),
    transferencia: transferencias.linhas.map((t) =>
      montarItemTransferencia({
        id: t.id,
        dataHora: t.data_hora,
        litros: paraNumeroDoBanco(t.litros),
        tanqueOrigem: tanque(t.tanque_origem_id),
        tanqueDestino: tanque(t.tanque_destino_id),
        motivo: t.motivo_exclusao,
        excluidoEm: t.excluido_em,
        excluidoPor: quem(t.excluido_por),
      }),
    ),
    esvaziamento: esvaziamentos.linhas.map((e) =>
      montarItemEsvaziamento({
        id: e.id,
        dataHora: e.data_hora,
        litros: paraNumeroDoBanco(e.litros),
        valorPerda: paraNumeroDoBanco(e.valor_perda),
        tanque: tanque(e.tanque_id),
        motivoEsvaziamento: e.motivo,
        motivo: e.motivo_exclusao,
        excluidoEm: e.excluido_em,
        excluidoPor: quem(e.excluido_por),
      }),
    ),
  };
}
