import type { RelatorioSiac } from "./ler-relatorio";

/** Itens que recebem cada linha (chave `grupo|codigo`) e, quando nenhum tem valor, o escolhido. */
export type Escolhas = Record<string, { itens: string[]; destino: string | null }>;

/**
 * O `p_relatorio` de `fn_mc_reajuste_importar`: cabeçalho, índices, SUBTOTAIS e só as linhas com
 * valor a PI líquido diferente de zero (as de zero não entram, spec 13). Números como texto.
 */
export function relatorioParaBanco(r: RelatorioSiac, escolhas: Escolhas, arquivoId: string | null) {
  return {
    contrato_texto: r.cabecalho.contratoTexto,
    medicao_numero: String(r.cabecalho.medicaoNumero),
    medicao_tipo: r.cabecalho.medicaoTipo,
    situacao: r.cabecalho.situacao,
    periodo_inicio: r.cabecalho.periodoInicio,
    periodo_fim: r.cabecalho.periodoFim,
    data_base: r.cabecalho.dataBase,
    processado_em: r.cabecalho.processadoEm,
    valor_pi: r.soma.valorPiLiquido,
    total: r.soma.reajuste,
    arquivo_id: arquivoId,
    indices: r.indices.map((i) => ({ sigla: i.sigla, i0: i.i0, i1: i.i1, k: i.k })),
    grupos: r.grupos.map((g) => ({ grupo: g.grupo, descricao: g.descricao, valor_pi: g.subtotal.valorPiLiquido, reajuste: g.subtotal.reajuste })),
    linhas: r.linhas
      .filter((l) => !/^-?0+(\.0+)?$/.test(l.valorPiLiquido))
      .map((l) => {
        const e = escolhas[`${l.grupo}|${l.codigo}`];
        return {
          grupo: l.grupo,
          codigo: l.codigo,
          descricao: l.descricao,
          unidade: l.unidade,
          preco_unitario: l.precoUnitario,
          valor_pi: l.valorPiLiquido,
          fator: l.fator,
          reajuste: l.reajuste,
          itens: e?.itens ?? [],
          destino: e?.destino ?? null,
        };
      }),
  };
}
