/**
 * Regras puras de agregação da folha (Bloco 6, Task 4 — fix de performance).
 * Sem Supabase: deriva os resumos por centro de custo e por encargo
 * diretamente dos itens de uma `FolhaDetalhe` já carregada por `buscarFolha`,
 * sem re-buscar a folha. Mantidas fora de `queries.ts` (que tem
 * `import "server-only"`) para poderem ser testadas com Vitest.
 */
import type {
  CustoCentroCusto,
  FolhaDetalhe,
  LancamentoDaFolha,
  ResumoEncargo,
  ResumoProvisao,
} from "@/modules/rh/folha/queries";

/**
 * Custo total da folha agrupado por centro de custo, somando o custo_total
 * dos itens. Itens sem centro de custo entram num grupo "Sem centro de
 * custo". Ordenado por custo decrescente.
 */
export function resumoPorCentroCusto(folha: FolhaDetalhe): CustoCentroCusto[] {
  const grupos = new Map<string, CustoCentroCusto>();

  for (const item of folha.itens) {
    const chave = item.centroCustoId ?? "__sem_centro__";
    const atual = grupos.get(chave);
    if (atual) {
      atual.custoTotal += item.custoTotal;
    } else {
      grupos.set(chave, {
        centroCustoId: item.centroCustoId,
        centroCustoNome: item.centroCustoNome,
        centroCustoCodigo: item.centroCustoCodigo,
        custoTotal: item.custoTotal,
      });
    }
  }

  return [...grupos.values()].sort((a, b) => b.custoTotal - a.custoTotal);
}

/**
 * Total por tipo de encargo, somando as linhas de `encargosDetalhe` de todos
 * os itens da folha. Ordenado por nome. Folhas antigas, sem quebra gravada
 * (todo item com `encargosDetalhe: []`), retornam lista vazia — a UI então
 * omite esta seção e mostra só o total consolidado.
 */
export function resumoPorEncargo(folha: FolhaDetalhe): ResumoEncargo[] {
  const totais = new Map<string, number>();

  for (const item of folha.itens) {
    for (const encargo of item.encargosDetalhe) {
      totais.set(encargo.nome, (totais.get(encargo.nome) ?? 0) + encargo.valor);
    }
  }

  return [...totais.entries()]
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * Total por tipo de provisão (13º, férias, ...), somando as linhas de
 * `provisoesDetalhe` de todos os itens da folha, com principal e os encargos
 * que vão incidir quando a provisão for paga separados — é como o Tiago
 * confere o valor. Ordenado por nome. Folhas antigas, sem provisão cadastrada
 * (todo item com `provisoesDetalhe: []`), retornam lista vazia — a UI então
 * omite esta seção.
 */
export function resumoPorProvisao(folha: FolhaDetalhe): ResumoProvisao[] {
  const totais = new Map<string, { principal: number; encargos: number }>();

  for (const item of folha.itens) {
    for (const provisao of item.provisoesDetalhe) {
      const atual = totais.get(provisao.nome) ?? { principal: 0, encargos: 0 };
      totais.set(provisao.nome, {
        principal: atual.principal + provisao.valorPrincipal,
        encargos: atual.encargos + provisao.valorEncargos,
      });
    }
  }

  return [...totais.entries()]
    .map(([nome, { principal, encargos }]) => ({
      nome,
      principal,
      encargos,
      total: principal + encargos,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * Retido do trabalhador que a aprovação NÃO vai transformar em conta a pagar,
 * por falta de grupo de recolhimento nos parâmetros da folha.
 *
 * A `fn_aprovar_folha` só gera a guia do INSS e do IRRF retidos quando
 * `folha_parametros.grupo_recolhimento_inss` / `_irrf` estão preenchidos (as
 * duas linhas da fonte da guia têm `v_grupo_* is not null` no `where`). Sem
 * grupo, o desconto continua no holerite e no líquido, mas a guia que a empresa
 * precisa recolher não existe no Financeiro. É a segunda causa de resíduo da
 * identidade de conferência (a lista tem duas), documentada no `obj_description`
 * da própria função.
 *
 * Branco conta como ausente, igual à consulta de diagnóstico gravada na função
 * (`nullif(btrim(...), '')`). Na prática as duas leituras não podem divergir: o
 * check `folha_parametros_grupo_recolhimento_inss_check` exige `length(btrim())
 * >= 1`, então string vazia não existe na coluna.
 *
 * Soma só o que ficou de fora, por imposto: se o INSS tem grupo e o IRRF não,
 * só o IRRF entra (é o caso parcial, o mais perigoso, porque gera guia e resíduo
 * ao mesmo tempo).
 */
export interface RetidoSemGrupo {
  /** INSS retido que não vira guia (0 quando o grupo está configurado). */
  inss: number;
  /** IRRF retido que não vira guia (0 quando o grupo está configurado). */
  irrf: number;
  /** `inss + irrf`: o valor total que não chega ao contas a pagar. */
  total: number;
}

function grupoAusente(grupo: string | null | undefined): boolean {
  return grupo === null || grupo === undefined || grupo.trim() === "";
}

export function retidoSemGrupoDeRecolhimento(
  folha: FolhaDetalhe,
  parametros: {
    grupoRecolhimentoInss: string | null;
    grupoRecolhimentoIrrf: string | null;
  } | null,
): RetidoSemGrupo {
  // Parâmetros nulos = a linha `folha_parametros` (id=1) nem existe, que é o
  // estado de produção em 08/08/2026: os dois grupos estão ausentes.
  const semInss = grupoAusente(parametros?.grupoRecolhimentoInss);
  const semIrrf = grupoAusente(parametros?.grupoRecolhimentoIrrf);

  const inss = semInss
    ? folha.itens.reduce((soma, item) => soma + item.inss, 0)
    : 0;
  const irrf = semIrrf
    ? folha.itens.reduce((soma, item) => soma + item.irrf, 0)
    : 0;

  return { inss, irrf, total: inss + irrf };
}

/** Lançamentos da folha (Bloco 8a, Task 7) separados por tipo, com o total de cada grupo. */
export interface LancamentosDaFolhaAgrupados {
  salarios: LancamentoDaFolha[];
  guias: LancamentoDaFolha[];
  totalSalarios: number;
  totalGuias: number;
}

/**
 * Separa os lançamentos gerados pela aprovação da folha em salários (um por
 * colaborador) e guias (um por grupo de recolhimento), e soma cada grupo.
 * Pura: sem Supabase, para não obrigar `listarLancamentosDaFolha` a fazer uma
 * leitura por grupo (o erro que o Bloco 6 corrigiu na revisão desta mesma
 * tela, com `resumoPorCentroCusto`/`resumoPorEncargo` acima).
 *
 * Em rascunho e pendente_aprovacao não existe lançamento nenhum (a aprovação
 * é quem gera): a lista de entrada vem vazia e os dois grupos saem vazios,
 * sem quebrar. O rateio por centro de custo de uma guia pode ficar incompleto
 * quando um colaborador não tem centro de custo (docs/decisoes.md) — isso não
 * aparece aqui porque `LancamentoDaFolha` não carrega rateio, só o total do
 * lançamento, que é sempre o valor cheio da guia.
 */
export function agruparLancamentosDaFolha(
  lancamentos: LancamentoDaFolha[],
): LancamentosDaFolhaAgrupados {
  const porDescricao = (a: LancamentoDaFolha, b: LancamentoDaFolha) =>
    a.descricao.localeCompare(b.descricao, "pt-BR");

  const salarios = lancamentos
    .filter((lancamento) => lancamento.tipo === "salario")
    .sort(porDescricao);
  const guias = lancamentos
    .filter((lancamento) => lancamento.tipo === "guia")
    .sort(porDescricao);

  return {
    salarios,
    guias,
    totalSalarios: salarios.reduce((soma, l) => soma + l.valor, 0),
    totalGuias: guias.reduce((soma, l) => soma + l.valor, 0),
  };
}
