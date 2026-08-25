import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";

/**
 * A escolha de centro de custo em dois passos: a raiz num campo, a etapa noutro.
 *
 * O banco guarda UM id em `centro_custo_id`, e ele pode ser raiz ou etapa. A tela
 * é que se divide em dois campos, porque um campo só com os 73 centros mistura 12
 * obras com 61 equipamentos e a pessoa rola a lista procurando a máquina no meio
 * das obras.
 *
 * A regra que amarra tudo: **esvaziar a etapa devolve o valor para a raiz**, nunca
 * para vazio. Foi decisão do dono que informar o equipamento é OPCIONAL -- existe
 * custo que é da oficina inteira, e o centro se chama "Manutenção/Documentação de
 * Equipamentos". Se limpar a etapa zerasse o campo, o formulário ficaria inválido
 * por causa de um clique que a pessoa entende como "tirar o detalhe".
 *
 * Módulo puro: nada de banco, nada de React.
 */

/** O que os dois campos mostram, derivado do id que está gravado. */
export interface SelecaoCentroCusto {
  /** O que vai no primeiro campo. */
  raizId: string;
  /** O que vai no segundo campo. Vazio quando o custo está na raiz. */
  etapaId: string;
}

/**
 * Quebra o id gravado nos dois campos da tela.
 *
 * Id que não está na lista vira o valor do PRIMEIRO campo em vez de sumir: centro
 * inativado depois do documento ser criado continua aparecendo (o Combobox
 * canônico rotula o desconhecido), e assim abrir e salvar um documento antigo não
 * troca o centro dele em silêncio.
 */
export function resolverSelecao(
  centros: readonly CentroCustoOpcao[],
  valor: string,
): SelecaoCentroCusto {
  if (!valor) return { raizId: "", etapaId: "" };

  const centro = centros.find((c) => c.id === valor);
  if (!centro) return { raizId: valor, etapaId: "" };
  if (!centro.paiId) return { raizId: valor, etapaId: "" };
  return { raizId: centro.paiId, etapaId: valor };
}

/** As raízes, na ordem em que vieram do banco (código, depois nome). */
export function raizes(
  centros: readonly CentroCustoOpcao[],
): CentroCustoOpcao[] {
  return centros.filter((centro) => centro.paiId === null);
}

/** As etapas de uma raiz. Vazio quando a raiz não tem etapa (toda obra, hoje). */
export function etapasDaRaiz(
  centros: readonly CentroCustoOpcao[],
  raizId: string,
): CentroCustoOpcao[] {
  if (!raizId) return [];
  return centros.filter((centro) => centro.paiId === raizId);
}

/**
 * O nome do segundo campo, pela boca de quem preenche.
 *
 * No schema, equipamento, empréstimo e etapa de obra são a mesma linha com um
 * pai. Na tela não são: quem lança manutenção procura "Equipamento", quem lança
 * uma parcela de dívida procura "Empréstimo", e quem lança obra procura
 * "Etapa". Um rótulo genérico faria as três pessoas hesitarem.
 */
const ROTULO_DO_NIVEL_2: Record<string, string> = {
  manutencao: "Equipamento",
  financeiro: "Empréstimo",
};

export function rotuloDaEtapa(
  centros: readonly CentroCustoOpcao[],
  raizId: string,
): string {
  const raiz = centros.find((c) => c.id === raizId);
  return ROTULO_DO_NIVEL_2[raiz?.tipo ?? ""] ?? "Etapa";
}

/**
 * O que gravar quando a pessoa troca o primeiro campo.
 *
 * A etapa velha é descartada de propósito: ela pertencia à raiz anterior, e
 * manter "Bobcat" depois de trocar para uma obra guardaria um par impossível.
 */
export function valorAoEscolherRaiz(raizId: string): string {
  return raizId;
}

/**
 * O que gravar quando a pessoa troca o segundo campo.
 *
 * Etapa vazia cai na raiz: é a regra do "opcional" (ver o topo do arquivo).
 */
export function valorAoEscolherEtapa(raizId: string, etapaId: string): string {
  return etapaId || raizId;
}

/** Rótulo de exibição: "009 Manutenção da Rodovia..." ou só o nome. */
export function rotuloCentro(centro: CentroCustoOpcao): string {
  return centro.codigo ? `${centro.codigo} ${centro.nome}` : centro.nome;
}
