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
  esperando_conserto: "Quebrado esperando conserto",
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

const MES_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/;
const NOMES_MES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** O `?mes=AAAA-MM` da URL; fora do formato, o mês de hoje. */
export function mesDoRelatorio(param: string | undefined, mesHoje: string): string {
  return param && MES_VALIDO.test(param) ? param : mesHoje;
}

export function mesAnteriorDe(mes: string): string {
  const ano = Number(mes.slice(0, 4));
  const numero = Number(mes.slice(5, 7));
  return numero === 1
    ? `${String(ano - 1).padStart(4, "0")}-12`
    : `${String(ano).padStart(4, "0")}-${String(numero - 1).padStart(2, "0")}`;
}

/** "2026-10" → "outubro de 2026". */
export function rotuloMes(mes: string): string {
  return `${NOMES_MES[Number(mes.slice(5, 7)) - 1] ?? mes} de ${mes.slice(0, 4)}`;
}

/**
 * Filtro de propriedade do relatório. A Colorado é fornecedora (pedido do Tiago, 16/10/2026): a
 * máquina dela entra em "Alugada", não num filtro próprio. O cadastro segue com `colorado`, que é
 * o que decide a etapa na obra 002.
 */
export const PROPRIEDADES_RELATORIO = ["propria", "alugada"] as const;

/** A propriedade do relatório: `colorado` vira `alugada`. */
export function propriedadeDoRelatorio(propriedade: string): string {
  return propriedade === "colorado" ? "alugada" : propriedade;
}

/** "Própria", "Alugada" ou "Alugada · Colorado": a fornecedora fica dita, dentro de Alugada. */
export function rotuloPropriedadeRelatorio(propriedade: string): string {
  if (propriedade === "propria") return "Própria";
  if (propriedade === "alugada") return "Alugada";
  if (propriedade === "colorado") return "Alugada · Colorado";
  return propriedade;
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
