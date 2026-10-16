/**
 * Dias de equipamento por centro de custo (16/10/2026). O banco decide o centro de cada dia
 * (fn_equip_centro_regra, fechado às 23:59 de Rio Branco); aqui só se lê o JSON da ficha
 * (fn_mapa_centros_equipamento), se agrupa o relatório mensal (fn_mapa_rel_dias_centro) e se dá
 * nome aos motivos. Puro: serve à ficha (cliente), à página e à planilha.
 */

export const ROTULO_MOTIVO_CENTRO: Record<string, string> = {
  obra: "Operando na obra",
  carreta_emt: "Carreta EMT",
  varios_centros: "Atende vários centros",
  sem_obra: "Operando sem obra",
  obra_sem_centro: "Obra sem centro de custo",
  parado: "Parado",
  em_rota: "Em rota",
  quebrado_obra: "Quebrado na obra",
  conserto: "Em conserto",
  sem_posicao: "Sem posição no mapa",
  acoplado: "Acoplado",
};

export function rotuloMotivoCentro(motivo: string): string {
  return ROTULO_MOTIVO_CENTRO[motivo] ?? motivo;
}

export interface PeriodoCentro {
  centroId: string;
  centroNome: string;
  motivo: string;
  de: string;
  ate: string;
  dias: number;
}

export interface CentrosEquipamento {
  variosCentros: boolean;
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

/** JSON de fn_mapa_centros_equipamento → CentrosEquipamento (null se o formato não for o esperado). */
export function paraCentrosEquipamento(
  bruto: unknown,
): CentrosEquipamento | null {
  const b = objeto(bruto);
  if (!b) return null;
  const atual = objeto(b.atual);
  return {
    variosCentros: b.varios_centros === true,
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

/** Uma linha de fn_mapa_rel_dias_centro: dias de uma máquina num centro, no mês. */
export interface RelDiasCentroLinha {
  equipamentoId: string;
  codigo: string;
  descricao: string;
  propriedade: string;
  centroId: string;
  centroNome: string;
  dias: number;
}

export interface RelDiasCentro {
  /** Por código. `dias` é centroId → dias. */
  equipamentos: {
    id: string;
    codigo: string;
    descricao: string;
    propriedade: string;
    dias: Record<string, number>;
    total: number;
  }[];
  /** As colunas: centros por total desc (empate pelo nome). */
  centros: { id: string; nome: string; total: number }[];
  total: number;
}

export function agruparRelatorio(linhas: RelDiasCentroLinha[]): RelDiasCentro {
  const maquinas = new Map<string, RelDiasCentro["equipamentos"][number]>();
  const centros = new Map<string, RelDiasCentro["centros"][number]>();
  let total = 0;
  for (const l of linhas) {
    const m = maquinas.get(l.equipamentoId) ?? {
      id: l.equipamentoId,
      codigo: l.codigo,
      descricao: l.descricao,
      propriedade: l.propriedade,
      dias: {},
      total: 0,
    };
    m.dias[l.centroId] = (m.dias[l.centroId] ?? 0) + l.dias;
    m.total += l.dias;
    maquinas.set(l.equipamentoId, m);
    const c = centros.get(l.centroId) ?? { id: l.centroId, nome: l.centroNome, total: 0 };
    c.total += l.dias;
    centros.set(l.centroId, c);
    total += l.dias;
  }
  return {
    equipamentos: [...maquinas.values()].sort((a, b) =>
      a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }),
    ),
    centros: [...centros.values()].sort(
      (a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"),
    ),
    total,
  };
}
