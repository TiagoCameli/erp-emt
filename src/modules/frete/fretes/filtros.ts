import { filtrarFacetado, selecao, type ResultadoFacetado } from "@/modules/_shared/filtros-facetados";
import { dataIsoValida, TIPOS_FRETE, type TipoFrete } from "@/modules/frete/fretes/schemas";
import type { FreteLinha } from "@/modules/frete/fretes/tipos";

/**
 * Filtros da aba Fretes: como saem da URL, como filtram a lista e os presets rápidos.
 * Iguais aos da origem (Frete.tsx:516-537, FreteListV2.tsx:66-87, FretePresets.tsx,
 * utils/dateRangePresets.ts), com uma diferença necessária: transportadora, material,
 * origem, destino e obra comparam o ID do cadastro (na origem eram texto).
 *
 * A página lê da URL e a tabela filtra em memória (a página traz todos os fretes com
 * `todasAsLinhas`), então o rodapé soma TODAS as linhas do filtro. A exportação usa a
 * mesma função. Módulo puro.
 */

export const CHAVES_FILTRO_FRETES = {
  busca: "busca",
  tipo: "tipo",
  obra: "obra",
  transportadora: "transportadora",
  de: "de",
  ate: "ate",
  motorista: "motorista",
  placa: "placa",
  material: "material",
  origem: "origem",
  destino: "destino",
  semChegada: "sem_chegada",
  excluidos: "excluidos",
  /** Fretes escolhidos por id, separados por vírgula (o alerta de rota das Carretas EMT leva aqui). */
  fretes: "fretes",
} as const;

export interface FiltrosFretes {
  /** Nota fiscal (só a NF 1, como a origem). */
  busca: string;
  tipo: TipoFrete | "";
  obraId: string;
  transportadoraId: string;
  /** Dia da saída, yyyy-mm-dd, inclusivo. */
  de: string;
  ate: string;
  /** Substring do motorista. */
  motorista: string;
  /** Placa da carreta, normalizada (ver `normalizarPlaca`); casa inteira, não por pedaço. */
  placa: string;
  insumoId: string;
  origemId: string;
  destinoId: string;
  /** Preset "Sem chegada": esconde os fretes com chegada. */
  semChegada: boolean;
  /** "Mostrar excluídos" (a página só aceita para quem pode restaurar). */
  excluidos: boolean;
  /** Só estes fretes (vazio = sem esse filtro). */
  ids: string[];
}

export const FILTROS_VAZIOS: FiltrosFretes = {
  busca: "",
  tipo: "",
  obraId: "",
  transportadoraId: "",
  de: "",
  ate: "",
  motorista: "",
  placa: "",
  insumoId: "",
  origemId: "",
  destinoId: "",
  semChegada: false,
  excluidos: false,
  ids: [],
};

type Parametros = Record<string, string | string[] | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function texto(valor: string | string[] | undefined): string {
  return typeof valor === "string" ? valor : "";
}

function uuid(valor: string | string[] | undefined): string {
  const bruto = texto(valor);
  return UUID.test(bruto) ? bruto : "";
}

/**
 * Placa comparável: maiúscula, sem hífen, espaço ou ponto. "sqs-7e71" e "SQS7E71" são a
 * mesma carreta. O cadastro já grava assim (o formulário põe em maiúscula), mas a carga
 * antiga e a URL digitada não prometem nada.
 */
export function normalizarPlaca(placa: string | null | undefined): string {
  return (placa ?? "").toUpperCase().replace(/[\s.-]/g, "");
}

function dia(valor: string | string[] | undefined): string {
  const bruto = texto(valor);
  return dataIsoValida(bruto) ? bruto : "";
}

/** Lê e valida. Parâmetro inválido é ignorado. */
export function lerFiltrosFretes(params: Parametros): FiltrosFretes {
  const C = CHAVES_FILTRO_FRETES;
  const tipo = texto(params[C.tipo]);
  return {
    busca: texto(params[C.busca]).slice(0, 100),
    tipo: (TIPOS_FRETE as readonly string[]).includes(tipo) ? (tipo as TipoFrete) : "",
    obraId: uuid(params[C.obra]),
    transportadoraId: uuid(params[C.transportadora]),
    de: dia(params[C.de]),
    ate: dia(params[C.ate]),
    motorista: texto(params[C.motorista]).slice(0, 100),
    placa: normalizarPlaca(texto(params[C.placa]).slice(0, 20)),
    insumoId: uuid(params[C.material]),
    origemId: uuid(params[C.origem]),
    destinoId: uuid(params[C.destino]),
    semChegada: texto(params[C.semChegada]) === "sim",
    excluidos: texto(params[C.excluidos]) === "sim",
    // Até 200 ids válidos; o resto é ignorado, como todo parâmetro inválido.
    ids: [...new Set(texto(params[C.fretes]).split(",").map((id) => id.trim()).filter((id) => UUID.test(id)))].slice(0, 200),
  };
}

/** Os filtros de seleção da lista, pelo id do filtro na tabela. */
export type FacetaFrete = "tipo" | "obra" | "transportadora" | "placa" | "material" | "origem" | "destino";

/**
 * O filtro da lista, facetado (ver `_shared/filtros-facetados`): devolve as linhas e
 * as opções de cada select restritas ao que existe nas linhas que passam nos outros.
 * NF, período, motorista, "sem chegada" e a lista de ids restringem, sem lista.
 */
export function filtrarFretesFacetado(
  fretes: readonly FreteLinha[],
  filtros: FiltrosFretes,
): ResultadoFacetado<FreteLinha, FacetaFrete> {
  const nf = filtros.busca.trim().toLowerCase();
  const motorista = filtros.motorista.trim().toLowerCase();
  const ids = filtros.ids.length > 0 ? new Set(filtros.ids) : null;
  return filtrarFacetado<FreteLinha, FacetaFrete>(
    fretes,
    {
      tipo: { selecionados: selecao(filtros.tipo), chave: (f) => f.tipo },
      obra: { selecionados: selecao(filtros.obraId), chave: (f) => f.centroCustoId },
      transportadora: { selecionados: selecao(filtros.transportadoraId), chave: (f) => f.transportadoraId },
      placa: { selecionados: selecao(filtros.placa), chave: (f) => normalizarPlaca(f.placaCarreta) },
      material: { selecionados: selecao(filtros.insumoId), chave: (f) => f.insumoId },
      origem: { selecionados: selecao(filtros.origemId), chave: (f) => f.origemId },
      destino: { selecionados: selecao(filtros.destinoId), chave: (f) => f.destinoId },
    },
    [
      (f) => !ids || ids.has(f.id),
      (f) => !filtros.semChegada || !f.dataChegada,
      (f) => !nf || (f.notaFiscal ?? "").toLowerCase().includes(nf),
      (f) => !filtros.de || f.data >= filtros.de,
      (f) => !filtros.ate || f.data <= filtros.ate,
      (f) => !motorista || (f.motorista ?? "").toLowerCase().includes(motorista),
    ],
  );
}

/** O filtro da lista (e da exportação, com `semChegada` desligado). */
export function filtrarFretes(fretes: readonly FreteLinha[], filtros: FiltrosFretes): FreteLinha[] {
  return filtrarFretesFacetado(fretes, filtros).linhas;
}

// ---------------------------------------------------------------------------
// Presets (utils/dateRangePresets.ts)
// ---------------------------------------------------------------------------

export type PresetFrete = "sem_chegada" | "esta_semana" | "este_mes" | "mes_passado";

function partes(diaIso: string): [number, number, number] {
  const [a, m, d] = diaIso.split("-").map(Number);
  return [a, m, d];
}

function paraIso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function somarDias(diaIso: string, dias: number): string {
  const [a, m, d] = partes(diaIso);
  return paraIso(new Date(Date.UTC(a, m - 1, d + dias)));
}

/** Segunda da semana até hoje; domingo conta como fim da semana anterior. */
export function periodoEstaSemana(hoje: string): { de: string; ate: string } {
  const [a, m, d] = partes(hoje);
  const diaSemana = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  const voltar = diaSemana === 0 ? 6 : diaSemana - 1;
  return { de: somarDias(hoje, -voltar), ate: hoje };
}

/** Dia 1 até hoje. */
export function periodoEsteMes(hoje: string): { de: string; ate: string } {
  return { de: `${hoje.slice(0, 7)}-01`, ate: hoje };
}

/** Dia 1 ao último dia do mês anterior. */
export function periodoMesPassado(hoje: string): { de: string; ate: string } {
  const [a, m] = partes(hoje);
  const primeiro = new Date(Date.UTC(a, m - 2, 1));
  const ultimo = new Date(Date.UTC(a, m - 1, 0));
  return { de: paraIso(primeiro), ate: paraIso(ultimo) };
}

/** Qual preset os filtros atuais representam (para o chip ficar marcado). */
export function presetAtivo(filtros: Pick<FiltrosFretes, "de" | "ate" | "semChegada">, hoje: string): PresetFrete | null {
  if (filtros.semChegada && !filtros.de && !filtros.ate) return "sem_chegada";
  if (filtros.semChegada) return null;
  const igual = (p: { de: string; ate: string }) => filtros.de === p.de && filtros.ate === p.ate;
  if (igual(periodoEstaSemana(hoje))) return "esta_semana";
  if (igual(periodoEsteMes(hoje))) return "este_mes";
  if (igual(periodoMesPassado(hoje))) return "mes_passado";
  return null;
}

export interface TransportadoraTop {
  id: string;
  nome: string;
  quantidade: number;
}

/**
 * "Top transportadora": as 5 com mais fretes (CONTAGEM) com saída nos últimos 90 dias
 * (`data >= hoje - 90`). Empate: pelo nome.
 */
export function topTransportadoras(fretes: readonly FreteLinha[], hoje: string, limite = 5): TransportadoraTop[] {
  const corte = somarDias(hoje, -90);
  const contagem = new Map<string, TransportadoraTop>();
  for (const f of fretes) {
    if (f.data < corte) continue;
    const atual = contagem.get(f.transportadoraId);
    if (atual) atual.quantidade += 1;
    else contagem.set(f.transportadoraId, { id: f.transportadoraId, nome: f.transportadoraNome, quantidade: 1 });
  }
  return [...contagem.values()]
    .sort((a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome, "pt-BR"))
    .slice(0, limite);
}
