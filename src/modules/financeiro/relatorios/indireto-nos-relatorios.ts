import { proximoMes } from "@/modules/financeiro/relatorios/calculo";
import type { FiltrosCustoCc } from "@/modules/financeiro/relatorios/filtros-custo-cc";

/**
 * O indireto rateado dentro do Custo por centro e do Custo x receita (PR 3, D8).
 *
 * O rateio vive só no relatório: nenhum lançamento muda. Aqui o indireto que o
 * banco já distribuiu (`fn_rateio_indireto_periodo`, centavos por maior resto)
 * troca de linha: sai dos centros indiretos e entra nas obras. O total geral não
 * pode mudar, porque o dinheiro é o mesmo; só o lugar onde ele aparece.
 *
 * Toda conta em centavos inteiros, pelo mesmo motivo do resto dos relatórios:
 * real em ponto flutuante acumula resto e o total deixa de bater com as linhas.
 *
 * Módulo puro: nada de banco, nada de React.
 */

/** Id da linha "Indireto não rateado": não é uuid, então nunca vira drill. */
export const ID_NAO_RATEADO = "nao-rateado";

export interface IndiretoDoPeriodo {
  /** Indireto que cada obra recebeu na janela, em reais. */
  porObra: Map<string, number>;
  /** Indireto sem obra para receber (mês sem obra com custo). */
  naoRateado: number;
  /** Os centros marcados `papel_rateio = 'indireto'`. */
  indiretos: Set<string>;
  /** Os marcados `papel_rateio = 'fora'` (unidade própria: 001 Carretas EMT). */
  fora?: Set<string>;
}

export interface CentroParaRateio {
  centroCustoId: string;
  nome: string;
  codigo: string | null;
  valor: number;
}

export type CentroComIndireto<T extends CentroParaRateio = CentroParaRateio> = T & {
  direto: number;
  indireto: number;
};

const cent = (v: number) => Math.round(v * 100);
const reais = (c: number) => c / 100;

/**
 * Tira as linhas dos indiretos e soma o indireto de cada obra nela.
 *
 * Obra que recebeu indireto mas não tem custo no recorte (mês ajustado em que o
 * custo dela foi cancelado depois) entra com o nome do cadastro; sem nome, o
 * dinheiro vai para o "não rateado" em vez de sumir da soma.
 */
export function aplicarIndireto<T extends CentroParaRateio>(
  centros: readonly T[],
  indireto: IndiretoDoPeriodo,
  nomes?: ReadonlyMap<string, { nome: string; codigo: string | null }>,
): { centros: CentroComIndireto<CentroParaRateio>[]; total: number } {
  const linhas: CentroComIndireto<CentroParaRateio>[] = [];
  const presentes = new Set<string>();
  let naoRateadoCent = cent(indireto.naoRateado);

  for (const centro of centros) {
    if (indireto.indiretos.has(centro.centroCustoId)) continue;
    presentes.add(centro.centroCustoId);
    const diretoCent = cent(centro.valor);
    const indiretoCent = cent(indireto.porObra.get(centro.centroCustoId) ?? 0);
    linhas.push({
      ...centro,
      direto: reais(diretoCent),
      indireto: reais(indiretoCent),
      valor: reais(diretoCent + indiretoCent),
    });
  }

  for (const [id, valor] of indireto.porObra) {
    if (presentes.has(id) || indireto.indiretos.has(id)) continue;
    const cadastro = nomes?.get(id);
    if (!cadastro) {
      naoRateadoCent += cent(valor);
      continue;
    }
    linhas.push({
      centroCustoId: id,
      nome: cadastro.nome,
      codigo: cadastro.codigo,
      direto: 0,
      indireto: reais(cent(valor)),
      valor: reais(cent(valor)),
    });
  }

  if (naoRateadoCent > 0) {
    linhas.push({
      centroCustoId: ID_NAO_RATEADO,
      nome: "Indireto não rateado",
      codigo: null,
      direto: 0,
      indireto: reais(naoRateadoCent),
      valor: reais(naoRateadoCent),
    });
  }

  linhas.sort((a, b) => b.valor - a.valor);
  const totalCent = linhas.reduce((s, l) => s + cent(l.valor), 0);
  return { centros: linhas, total: reais(totalCent) };
}

/**
 * O rateio pode entrar no Custo por centro com estes filtros?
 *
 * O indireto do banco é o do mês INTEIRO, sem recorte. Somá-lo a um custo
 * recortado por categoria, fornecedor, forma, status, centro, tipo de centro,
 * previsto ou com o CAPEX dentro misturaria duas bases e a conta "o total não
 * muda" deixaria de valer. Na vida do centro a janela é de cada centro, não um
 * período único.
 */
export function rateioPermitidoNoCustoCc(filtros: FiltrosCustoCc): boolean {
  return (
    filtros.modo !== "vida" &&
    filtros.centroIds.length === 0 &&
    filtros.etapaIds.length === 0 &&
    filtros.categoriaIds.length === 0 &&
    filtros.fornecedorIds.length === 0 &&
    filtros.formaIds.length === 0 &&
    !filtros.semForma &&
    filtros.status.length === 0 &&
    filtros.tiposCentro.length === 0 &&
    !filtros.excluirPrevisto &&
    !filtros.incluirInvestimento
  );
}

/**
 * Meses marcados (yyyy-MM) em janelas contíguas [inicio, fim).
 *
 * O Custo x receita deixa marcar meses soltos; uma janela única do primeiro ao
 * último traria o indireto dos meses do buraco, que não estão no custo da tela.
 */
export function janelasContiguas(meses: readonly string[]): { inicio: string; fim: string }[] {
  const ordenados = [...new Set(meses)].sort();
  const janelas: { inicio: string; fim: string }[] = [];
  for (const mes of ordenados) {
    const ultima = janelas.at(-1);
    if (ultima && ultima.fim === `${mes}-01`) ultima.fim = proximoMes(mes);
    else janelas.push({ inicio: `${mes}-01`, fim: proximoMes(mes) });
  }
  return janelas;
}

export interface MargemDaObra {
  centroId: string;
  nome: string;
  receita: number;
  custoDireto: number;
  indireto: number;
  resultadoSem: number;
  /** Resultado sobre a receita, em pontos. `null` sem receita: não há margem. */
  margemSem: number | null;
  resultadoCom: number;
  margemCom: number | null;
}

/**
 * Margem de cada obra sem e com o indireto rateado.
 *
 * Os indiretos saem da lista: o custo deles já está dentro do indireto das
 * obras, e mostrá-los como linha contaria o mesmo dinheiro duas vezes.
 */
export function margemPorObra(
  receitaPorObra: ReadonlyMap<string, { nome: string; receita: number }>,
  custoPorObra: ReadonlyMap<string, number>,
  indiretoPorObra: ReadonlyMap<string, number>,
  indiretos: ReadonlySet<string>,
  nomes?: ReadonlyMap<string, string>,
): MargemDaObra[] {
  const ids = new Set([...receitaPorObra.keys(), ...custoPorObra.keys(), ...indiretoPorObra.keys()]);
  const linhas: MargemDaObra[] = [];
  for (const id of ids) {
    if (indiretos.has(id)) continue;
    const receitaCent = cent(receitaPorObra.get(id)?.receita ?? 0);
    const custoCent = cent(custoPorObra.get(id) ?? 0);
    const indiretoCent = cent(indiretoPorObra.get(id) ?? 0);
    const semCent = receitaCent - custoCent;
    const comCent = semCent - indiretoCent;
    linhas.push({
      centroId: id,
      nome: receitaPorObra.get(id)?.nome ?? nomes?.get(id) ?? "Centro sem nome",
      receita: reais(receitaCent),
      custoDireto: reais(custoCent),
      indireto: reais(indiretoCent),
      resultadoSem: reais(semCent),
      margemSem: receitaCent === 0 ? null : (semCent / receitaCent) * 100,
      resultadoCom: reais(comCent),
      margemCom: receitaCent === 0 ? null : (comCent / receitaCent) * 100,
    });
  }
  return linhas.sort((a, b) => b.receita - a.receita || b.custoDireto - a.custoDireto);
}

/**
 * "Margem por obra" só com a mesma base do rateio: sem corte de centro (o
 * rateio é da empresa inteira) e sem "Incluir investimentos" (o rateio é sempre
 * sem CAPEX; com ele ligado, o custo direto teria CAPEX e o indireto não).
 */
export function margemPorObraPermitida(f: { semCorteDeCentro: boolean; incluirInvestimento: boolean }): boolean {
  return f.semCorteDeCentro && !f.incluirInvestimento;
}

/** Mês do rateio vindo da URL (yyyy-MM, mês 01 a 12); inválido cai no padrão. */
export function mesDoRateio(valor: string | undefined, padrao: string): string {
  return valor && /^\d{4}-(0[1-9]|1[0-2])$/.test(valor) ? valor : padrao;
}
