import type { Acao, RecursoId } from "@/config/recursos";

/**
 * Tipos de documento que aceitam anexo, e o recurso de permissão dono de cada
 * um. Espelha, no TypeScript, a função public.fn_recurso_da_entidade do banco:
 * os dois têm que casar, porque a RLS dos vínculos deriva a permissão pela
 * função e a Server Action deriva por este mapa.
 *
 * "pagamento" é a PARCELA paga (lancamento_parcelas): no ERP não existe tabela
 * de pagamentos, o pagamento é a baixa da parcela.
 *
 * "equipamento_documento" é a linha de equipamento_documentos (licenciamento,
 * seguro, laudo). Segue o recurso do cadastro de equipamentos: quem edita o
 * equipamento anexa no documento dele.
 */
const RECURSO_POR_ENTIDADE = {
  cotacao: "compras.cotacoes",
  ordem_compra: "compras.ordens",
  lancamento: "financeiro.lancamentos",
  pagamento: "financeiro.pagamentos",
  rh_documento: "rh.documentos",
  rh_epi: "rh.epis",
  rh_ocorrencia: "rh.ocorrencias",
  equipamento_documento: "cadastros.equipamentos",
  // Frete: "frete_chegada" é a foto da chegada da carga (a primeira foto do frete na origem),
  // separada das outras fotos e arquivos do frete.
  frete: "frete.fretes",
  frete_chegada: "frete.fretes",
  frete_pagamento: "frete.pagamentos",
  pedido_material: "frete.pedidos-material",
  combustivel_entrada: "combustivel.entradas",
  combustivel_saida: "combustivel.saidas",
  combustivel_transferencia: "combustivel.transferencias",
  // Fotos e documentos do serviço executado na OS (ordens_servico).
  manutencao_os: "manutencao.servicos",
  // PDF do extrato na posição da aplicação (aplicacao_posicoes).
  aplicacao_posicao: "financeiro.aplicacoes",
  // Medição de Contratos: documentos do contrato e do aditivo, e o xlsx oficial de cada versão da
  // planilha. O banco também exige estar na lista do contrato (fn_anexo_entidade_visivel).
  mc_contrato: "medicao.contratos",
  mc_aditivo: "medicao.contratos",
  mc_planilha_versao: "medicao.planilha",
} as const satisfies Record<string, RecursoId>;

/** Tipo de documento que aceita anexo. */
export type EntidadeAnexo = keyof typeof RECURSO_POR_ENTIDADE;

/** Todos os tipos, para validar entrada vinda da tela. */
export const ENTIDADES_ANEXO = Object.keys(
  RECURSO_POR_ENTIDADE,
) as EntidadeAnexo[];

export function ehEntidadeAnexo(valor: string): valor is EntidadeAnexo {
  return valor in RECURSO_POR_ENTIDADE;
}

/** Recurso de permissão dono dos anexos deste tipo de documento. */
export function recursoDaEntidade(entidade: EntidadeAnexo): RecursoId {
  return RECURSO_POR_ENTIDADE[entidade];
}

/** Ação exigida para anexar ou remover: sempre 'editar'. */
export function acaoDoAnexo(): Acao {
  return "editar";
}

/** Rótulo do tipo de documento, para o badge de origem do anexo propagado. */
const ROTULO_ENTIDADE: Record<EntidadeAnexo, string> = {
  cotacao: "cotação",
  ordem_compra: "ordem de compra",
  lancamento: "lançamento",
  pagamento: "pagamento",
  rh_documento: "documento",
  rh_epi: "EPI",
  rh_ocorrencia: "ocorrência",
  equipamento_documento: "documento do equipamento",
  frete: "frete",
  frete_chegada: "chegada do frete",
  frete_pagamento: "pagamento de frete",
  pedido_material: "pedido de material",
  combustivel_entrada: "entrada de combustível",
  combustivel_saida: "abastecimento",
  combustivel_transferencia: "transferência de combustível",
  manutencao_os: "ordem de serviço",
  aplicacao_posicao: "posição da aplicação",
  mc_contrato: "contrato",
  mc_aditivo: "aditivo",
  mc_planilha_versao: "planilha contratual",
};

export function rotuloDaEntidade(entidade: EntidadeAnexo): string {
  return ROTULO_ENTIDADE[entidade];
}
