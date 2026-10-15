import { paraCentavos } from "@/modules/financeiro/relatorios/calculo";
import {
  anoDoIndireto,
  type CustoIndiretoLinha,
} from "@/modules/financeiro/relatorios/custos-indiretos";
import { mesDoRateio } from "@/modules/financeiro/relatorios/indireto-nos-relatorios";
import type { StatusRateio } from "@/modules/financeiro/relatorios/rateio-indireto";
import type { LinhaRateioMes } from "@/modules/financeiro/relatorios/resultado-por-obra";

/**
 * Relatório "Indireto" (15/10/2026): Custos indiretos e Rateio do indireto
 * viraram uma tela só, com UMA linha por mês: quanto foi o indireto, como ele
 * foi repartido entre as obras e qual categoria mais pesou.
 *
 * A categoria que mais pesou existe por um motivo concreto: em out/2026
 * "Impostos" do Escritório Central levou R$ 653.924,92 de parcelamentos
 * (PGFN, SISPAR, PERT) e o indireto do mês foi a R$ 740 mil, com o Polo Naval
 * recebendo mais indireto que o próprio custo direto. Sem a categoria na linha,
 * esse salto parece custo de obra.
 *
 * O total do mês vem do rateio (`custo_indireto_mes`), e as categorias de
 * `fn_rel_custos_indiretos`, que usa o mesmo critério de custo. Se as duas
 * somas divergirem, `diferencaCategorias` mostra quanto, em vez de esconder.
 *
 * Tudo em centavos inteiros. Módulo puro.
 */

export interface ParteDaObra {
  centroId: string;
  centro: string;
  custoDireto: number;
  indireto: number;
  /** Fração do indireto do mês, 0 a 100. */
  pct: number;
}

export interface CategoriaDoMes {
  categoriaId: string | null;
  categoria: string;
  total: number;
  /** Fração do indireto do mês, 0 a 100. */
  pct: number;
}

export interface MesDoIndireto {
  /** yyyy-MM. */
  mes: string;
  total: number;
  status: StatusRateio;
  /** Obras que receberam, da maior parte para a menor. */
  obras: ParteDaObra[];
  naoRateado: number;
  categorias: CategoriaDoMes[];
  /** Obras que recebem mais indireto que o próprio custo direto no mês. */
  indiretoAcimaDoDireto: ParteDaObra[];
  /** Total do rateio menos a soma das categorias (zero quando fecham). */
  diferencaCategorias: number;
}

const STATUS: readonly StatusRateio[] = ["automatico", "ajustado", "confirmado"];

function status(valor: string | undefined): StatusRateio {
  return STATUS.includes(valor as StatusRateio) ? (valor as StatusRateio) : "automatico";
}

/**
 * Um registro por mês com indireto, em ordem. `rateio` e `categorias` são os do
 * mesmo ano; mês sem custo indireto nenhum não vira linha.
 */
export function indiretoPorMes(
  rateio: readonly LinhaRateioMes[],
  categorias: readonly CustoIndiretoLinha[],
): MesDoIndireto[] {
  const porMes = new Map<
    string,
    {
      totalCent: number;
      status: string | undefined;
      naoRateadoCent: number;
      obras: { centroId: string; centro: string; direto: number; indireto: number }[];
      categorias: Map<string, { categoriaId: string | null; categoria: string; cent: number }>;
    }
  >();
  const mesDe = (mes: string) => {
    let m = porMes.get(mes);
    if (!m) {
      m = { totalCent: 0, status: undefined, naoRateadoCent: 0, obras: [], categorias: new Map() };
      porMes.set(mes, m);
    }
    return m;
  };

  for (const r of rateio) {
    const m = mesDe(r.mes);
    m.totalCent = paraCentavos(r.custoIndiretoMes);
    m.naoRateadoCent = paraCentavos(r.naoRateado);
    m.status = r.status;
    if (r.centroId !== null && paraCentavos(r.indireto) !== 0) {
      m.obras.push({
        centroId: r.centroId,
        centro: r.centro ?? "",
        direto: paraCentavos(r.custoDireto),
        indireto: paraCentavos(r.indireto),
      });
    }
  }

  for (const c of categorias) {
    const m = mesDe(c.mes.slice(0, 7));
    const chave = c.categoriaId ?? `sem:${c.categoria}`;
    const atual = m.categorias.get(chave);
    const cent = paraCentavos(c.total);
    if (atual) atual.cent += cent;
    else m.categorias.set(chave, { categoriaId: c.categoriaId, categoria: c.categoria, cent });
  }

  return [...porMes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, m]) => {
      const fracao = (cent: number) => (m.totalCent === 0 ? 0 : (cent / m.totalCent) * 100);
      const obras = m.obras
        .sort((a, b) => b.indireto - a.indireto || a.centro.localeCompare(b.centro, "pt-BR"))
        .map((o) => ({
          centroId: o.centroId,
          centro: o.centro,
          custoDireto: o.direto / 100,
          indireto: o.indireto / 100,
          pct: fracao(o.indireto),
        }));
      const somaCategorias = [...m.categorias.values()].reduce((s, c) => s + c.cent, 0);
      return {
        mes,
        total: m.totalCent / 100,
        status: status(m.status),
        obras,
        naoRateado: m.naoRateadoCent / 100,
        categorias: [...m.categorias.values()]
          .filter((c) => c.cent !== 0)
          .sort((a, b) => b.cent - a.cent || a.categoria.localeCompare(b.categoria, "pt-BR"))
          .map((c) => ({
            categoriaId: c.categoriaId,
            categoria: c.categoria,
            total: c.cent / 100,
            pct: fracao(c.cent),
          })),
        indiretoAcimaDoDireto: obras.filter(
          (o) => paraCentavos(o.indireto) > paraCentavos(o.custoDireto),
        ),
        diferencaCategorias: (m.totalCent - somaCategorias) / 100,
      };
    })
    .filter((m) => paraCentavos(m.total) !== 0 || m.categorias.length > 0);
}

/** A soma do ano, em reais, fechando em centavos com as linhas. */
export function totalDoAno(meses: readonly MesDoIndireto[]): number {
  return meses.reduce((s, m) => s + paraCentavos(m.total), 0) / 100;
}

/**
 * O ano da tabela e o mês aberto no detalhe, vindos da URL.
 *
 * O mês aberto tem de estar no ano da tabela: as setas de ano levam só
 * `ano_indireto`, e sem esta regra a tabela de 2025 abriria o detalhe de
 * setembro de 2026. Fora do ano, abre o último mês fechado (se for do ano) ou
 * dezembro.
 */
export function recorteDoIndireto(
  anoUrl: string | undefined,
  mesUrl: string | undefined,
  mesFechado: string,
): { ano: number; mes: string } {
  const mes = mesDoRateio(mesUrl, mesFechado);
  const ano = anoDoIndireto(anoUrl, Number(mes.slice(0, 4)));
  if (mes.startsWith(`${ano}-`)) return { ano, mes };
  return { ano, mes: mesFechado.startsWith(`${ano}-`) ? mesFechado : `${ano}-12` };
}
