import type { PeriodoCentro } from "@/modules/mapa/centros";

/**
 * Dias de pessoa por centro de custo (17/10/2026, pedido do Tiago: "gravar em quais centros de
 * custo cada funcionario ficou durante o mes e ai gerar um relatorio no final do mes mostrando
 * quantos dias trabalhados e quantos dias estiveram parado"). O banco decide o centro de cada dia
 * (fn_colab_centro_regra, fechado às 23:55 de Rio Branco); aqui só se lê o JSON da ficha
 * (fn_mapa_centros_colaborador), se agrupa o relatório (fn_mapa_rel_dias_pessoa) e se dá nome aos
 * motivos. Não lê nem escreve o RH. Puro: serve à ficha (cliente), à página e à planilha.
 */

export const ESTADOS_PESSOA = ["trabalhando", "parado"] as const;
export type EstadoPessoa = (typeof ESTADOS_PESSOA)[number];

export const ROTULO_MOTIVO_PESSOA: Record<string, string> = {
  obra: "Trabalhando na obra",
  escolhido: "Centro escolhido na ficha",
  sem_obra: "Trabalhando sem obra",
  obra_sem_centro: "Obra sem centro de custo",
  parado: "Parado",
};

export function rotuloMotivoPessoa(motivo: string): string {
  return ROTULO_MOTIVO_PESSOA[motivo] ?? motivo;
}

export interface CentrosColaborador {
  estado: EstadoPessoa;
  /** Dias do mês (o de hoje ao vivo). */
  trabalhados: number;
  parados: number;
  atual: {
    centroId: string;
    centroNome: string;
    motivo: string;
    desde: string;
  } | null;
  mes: { centroId: string; centroNome: string; dias: number }[];
  periodos: PeriodoCentro[];
}

const objeto = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
const texto = (v: unknown): string => (typeof v === "string" ? v : "");
const inteiro = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};
const lista = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v)
    ? v.map(objeto).filter((x): x is Record<string, unknown> => x !== null)
    : [];

/** JSON de fn_mapa_centros_colaborador → CentrosColaborador (null se o formato não for o esperado). */
export function paraCentrosColaborador(
  bruto: unknown,
): CentrosColaborador | null {
  const b = objeto(bruto);
  if (!b) return null;
  const atual = objeto(b.atual);
  return {
    estado: b.estado === "parado" ? "parado" : "trabalhando",
    trabalhados: inteiro(b.trabalhados),
    parados: inteiro(b.parados),
    atual: atual
      ? {
          centroId: texto(atual.centro_id),
          centroNome: texto(atual.centro_nome),
          motivo: texto(atual.motivo),
          desde: texto(atual.desde),
        }
      : null,
    mes: lista(b.mes).map((m) => ({
      centroId: texto(m.centro_id),
      centroNome: texto(m.centro_nome),
      dias: inteiro(m.dias),
    })),
    periodos: lista(b.periodos).map((p) => ({
      centroId: texto(p.centro_id),
      centroNome: texto(p.centro_nome),
      motivo: texto(p.motivo),
      de: texto(p.de),
      ate: texto(p.ate),
      dias: inteiro(p.dias),
    })),
  };
}

/** Uma linha de fn_mapa_rel_dias_pessoa: dias de uma pessoa num centro e num estado, no mês. */
export interface RelDiasPessoaLinha {
  colaboradorId: string;
  nome: string;
  funcao: string;
  centroId: string;
  centroNome: string;
  estado: string;
  dias: number;
}

export interface RelDiasPessoa {
  /** Por nome. `dias` é centroId → dias. */
  pessoas: {
    id: string;
    nome: string;
    funcao: string;
    dias: Record<string, number>;
    trabalhados: number;
    parados: number;
    total: number;
  }[];
  /** As colunas: centros por total desc (empate pelo nome). */
  centros: { id: string; nome: string; total: number }[];
  trabalhados: number;
  parados: number;
  total: number;
}

export function agruparRelatorioPessoas(
  linhas: RelDiasPessoaLinha[],
): RelDiasPessoa {
  const pessoas = new Map<string, RelDiasPessoa["pessoas"][number]>();
  const centros = new Map<string, RelDiasPessoa["centros"][number]>();
  let trabalhados = 0;
  let parados = 0;
  for (const l of linhas) {
    const p = pessoas.get(l.colaboradorId) ?? {
      id: l.colaboradorId,
      nome: l.nome,
      funcao: l.funcao,
      dias: {},
      trabalhados: 0,
      parados: 0,
      total: 0,
    };
    p.dias[l.centroId] = (p.dias[l.centroId] ?? 0) + l.dias;
    if (l.estado === "parado") p.parados += l.dias;
    else p.trabalhados += l.dias;
    p.total += l.dias;
    pessoas.set(l.colaboradorId, p);
    const c = centros.get(l.centroId) ?? {
      id: l.centroId,
      nome: l.centroNome,
      total: 0,
    };
    c.total += l.dias;
    centros.set(l.centroId, c);
    if (l.estado === "parado") parados += l.dias;
    else trabalhados += l.dias;
  }
  return {
    pessoas: [...pessoas.values()].sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR"),
    ),
    centros: [...centros.values()].sort(
      (a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"),
    ),
    trabalhados,
    parados,
    total: trabalhados + parados,
  };
}
