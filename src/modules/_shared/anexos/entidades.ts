import type { Acao, RecursoId } from "@/config/recursos";

/**
 * Tipos de documento que aceitam anexo, e o recurso de permissão dono de cada
 * um. Espelha, no TypeScript, a função public.fn_recurso_da_entidade do banco:
 * os dois têm que casar, porque a RLS dos vínculos deriva a permissão pela
 * função e a Server Action deriva por este mapa.
 *
 * "pagamento" é a PARCELA paga (lancamento_parcelas): no ERP não existe tabela
 * de pagamentos, o pagamento é a baixa da parcela.
 */
const RECURSO_POR_ENTIDADE = {
  cotacao: "compras.cotacoes",
  ordem_compra: "compras.ordens",
  lancamento: "financeiro.lancamentos",
  pagamento: "financeiro.pagamentos",
  rh_documento: "rh.documentos",
  rh_epi: "rh.epis",
  rh_ocorrencia: "rh.ocorrencias",
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
};

export function rotuloDaEntidade(entidade: EntidadeAnexo): string {
  return ROTULO_ENTIDADE[entidade];
}
