/**
 * Facetas da listagem de lançamentos: o que cada filtro de seleção ainda acha
 * na lista filtrada pelos OUTROS (ver `_shared/filtros-facetados`).
 *
 * A listagem é paginada no banco, então quem sabe o que existe é a consulta
 * `facetasLancamentos` em `queries.ts`. Mora aqui o que é regra e se testa sem
 * banco: a chave de cada linha em cada filtro (copiada dos filtros da consulta,
 * para opção e filtro nunca discordarem) e qual parâmetro cada faceta solta.
 *
 * Módulo puro: nada de banco, nada de React.
 */

import type { FacetaServidor } from "@/modules/_shared/filtros-facetados";
import { valorSemEtapa } from "@/modules/_shared/centro-custo/filtro";
import { ehParcelaAberta } from "@/modules/financeiro/_shared/formato";
import type { FiltrosLancamentos } from "@/modules/financeiro/lancamentos/filtros";
import { situacaoDeAtraso } from "@/modules/financeiro/lancamentos/resumo";

/** Os filtros de seleção da barra, no id que a tabela usa. */
export type FacetaLancamentos =
  | "status"
  | "atraso"
  | "revisao"
  | "fornecedor"
  | "categoria"
  | "centro"
  | "etapa"
  | "conta"
  | "forma"
  | "origem";

/** O que a consulta de facetas traz de cada lançamento. */
export interface LinhaFacetaLancamentos {
  tipo: string;
  status: string;
  origem: string | null;
  fornecedor_id: string | null;
  categoria_id: string | null;
  forma_pagamento_id: string | null;
  lancamento_parcelas: {
    status: string;
    conta_bancaria_id: string | null;
    data_vencimento: string | null;
  }[];
  lancamento_rateios: { centro_custo_id: string | null }[];
}

/**
 * Status da linha, do jeito que o filtro lê: "A pagar" é a situação do dinheiro
 * (alguma parcela em aberto e o lançamento não cancelado, o `comSaldoAberto`),
 * e não o status literal; os outros são igualdade exata.
 */
function chaveStatus(linha: LinhaFacetaLancamentos): (string | null)[] {
  const aberto =
    linha.status !== "cancelado" &&
    linha.lancamento_parcelas.some((parcela) =>
      ehParcelaAberta(parcela.status),
    );
  return [
    linha.status === "a_pagar" ? null : linha.status,
    aberto ? "a_pagar" : null,
  ];
}

/**
 * Estados de revisão em que a linha cai, pelas mesmas duas sondas de
 * `revisao-no-embed.ts` (existe parcela pendente? existe resolvida?).
 */
export function revisoesDaLinha(linha: LinhaFacetaLancamentos): string[] {
  const parcelas = linha.lancamento_parcelas;
  const estados: string[] = [];
  if (parcelas.some((parcela) => parcela.status === "em_revisao")) {
    estados.push("em_revisao");
  }
  if (linha.tipo !== "a_pagar") return estados;

  const pendente = parcelas.some(
    (parcela) =>
      parcela.status !== "pago" && parcela.conta_bancaria_id === null,
  );
  const resolvida = parcelas.some(
    (parcela) =>
      parcela.status === "pago" || parcela.conta_bancaria_id !== null,
  );
  if (pendente) estados.push("nao_revisado");
  if (pendente && resolvida) estados.push("parcial");
  if (pendente && !resolvida) estados.push("sem_conta");
  if (!pendente && resolvida) estados.push("revisado");
  return estados;
}

/**
 * As facetas da listagem. `etapaAtiva`: o segundo campo do centro tem valor
 * escolhido (etapa ou "sem etapa"), o que só dá para saber com o cadastro de
 * centros na mão.
 */
export function facetasDaListagem(
  filtros: FiltrosLancamentos,
  etapaAtiva: boolean,
  hojeISO: string,
): Record<FacetaLancamentos, FacetaServidor<LinhaFacetaLancamentos>> {
  const centros = (linha: LinhaFacetaLancamentos) =>
    linha.lancamento_rateios.map((rateio) => rateio.centro_custo_id);
  return {
    status: {
      ativo: !!filtros.status || !!filtros.comSaldoAberto,
      chave: chaveStatus,
    },
    atraso: {
      ativo: !!filtros.atraso,
      chave: (linha) => {
        const situacao = situacaoDeAtraso(
          linha.lancamento_parcelas.map((parcela) => ({
            status: parcela.status,
            dataVencimento: parcela.data_vencimento,
          })),
          hojeISO,
        );
        return situacao === "sem-aberto" ? null : situacao;
      },
    },
    revisao: { ativo: !!filtros.revisao, chave: revisoesDaLinha },
    fornecedor: {
      ativo: !!filtros.fornecedorIds?.length,
      chave: (linha) => linha.fornecedor_id,
    },
    categoria: {
      ativo: !!filtros.categoriaIds?.length,
      chave: (linha) => linha.categoria_id,
    },
    // Centro devolve o id cru do rateio: a tabela sobe cada um até a raiz com o
    // cadastro que já tem (`raizesPresentes`).
    centro: {
      ativo:
        !!filtros.centroCustoIds?.length || !!filtros.centroSemEtapaIds?.length,
      chave: centros,
    },
    // A etapa é o próprio centro do rateio; o "sem etapa" de uma raiz casa o
    // rateio gravado direto nela, então todo id vale também como "sem etapa".
    etapa: {
      ativo: etapaAtiva,
      chave: (linha) =>
        centros(linha).flatMap((id) => (id ? [id, valorSemEtapa(id)] : [])),
    },
    conta: {
      ativo: !!filtros.contaBancariaId,
      chave: (linha) =>
        linha.lancamento_parcelas.map((parcela) => parcela.conta_bancaria_id),
    },
    forma: {
      ativo: !!filtros.formaPagamentoIds?.length || !!filtros.semForma,
      chave: (linha) => linha.forma_pagamento_id,
    },
    origem: { ativo: !!filtros.origem, chave: (linha) => linha.origem },
  };
}

/**
 * Os filtros sem o da faceta, para calcular as opções dela.
 *
 * A etapa solta só o segundo campo: as raízes escolhidas continuam valendo,
 * senão a lista de equipamentos ofereceria máquina de centro que nem está
 * escolhido. A conta fica quando o recorte é o da posição bancária, porque lá
 * ela é parte do recorte, não só filtro.
 */
export function filtrosSemFaceta(
  filtros: FiltrosLancamentos,
  faceta: FacetaLancamentos,
  raizesEscolhidas: string[],
): FiltrosLancamentos {
  switch (faceta) {
    case "status":
      return { ...filtros, status: undefined, comSaldoAberto: undefined };
    case "atraso":
      return { ...filtros, atraso: undefined };
    case "revisao":
      return { ...filtros, revisao: undefined };
    case "fornecedor":
      return { ...filtros, fornecedorIds: undefined };
    case "categoria":
      return { ...filtros, categoriaIds: undefined };
    case "centro":
      return {
        ...filtros,
        centroCustoIds: undefined,
        centroSemEtapaIds: undefined,
      };
    case "etapa":
      return {
        ...filtros,
        centroCustoIds: raizesEscolhidas,
        centroSemEtapaIds: undefined,
      };
    case "conta":
      return filtros.recorte?.tipo === "conta_paga"
        ? filtros
        : { ...filtros, contaBancariaId: undefined };
    case "forma":
      return { ...filtros, formaPagamentoIds: undefined, semForma: undefined };
    case "origem":
      return { ...filtros, origem: undefined };
  }
}

/** Sobe cada centro presente até a raiz dele, pelo `paiId` do cadastro. */
export function raizesPresentes(
  centros: readonly { id: string; paiId: string | null }[],
  presentes: readonly string[],
): Set<string> {
  const paiPorId = new Map(centros.map((centro) => [centro.id, centro.paiId]));
  const raizes = new Set<string>();
  for (const id of presentes) {
    let atual = id;
    // Trava de profundidade: ciclo no cadastro não pode travar a tela.
    for (let passo = 0; passo < 20; passo += 1) {
      const pai = paiPorId.get(atual);
      if (!pai) break;
      atual = pai;
    }
    raizes.add(atual);
  }
  return raizes;
}
