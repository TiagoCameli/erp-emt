import { ROTULO_TIPO_CONSUMIDOR, type TipoConsumidor } from "@/modules/combustivel/_shared/rotulos";
import { mesEmRioBranco } from "@/modules/combustivel/relatorios/periodo";
import { somarValoresOperacionais } from "@/modules/manutencao/servicos/formato";

/**
 * Consolidações dos relatórios do Combustível: transformam as saídas lidas do
 * banco nas linhas de cada planilha. Módulo puro (sem banco e sem exceljs),
 * testado em consolidar.test.ts.
 *
 * Litros e valor somam em inteiros de décimo de milésimo: o banco guarda os dois
 * com 4 casas, e somar centenas de saídas em float erra a última.
 */

/** Os quatro relatórios da tela. Mora aqui (e não na planilha) para a action validar sem carregar o exceljs. */
export const TIPOS_RELATORIO = ["mensal", "obra", "equipamento", "bruto"] as const;
export type TipoRelatorio = (typeof TIPOS_RELATORIO)[number];

const ESCALA = 10_000;

/** Arredonda para 4 casas (a fatia do custo por obra é gravada assim antes de somar). */
export function quatroCasas(valor: number): number {
  return Math.round(valor * ESCALA) / ESCALA;
}

export interface AlocacaoRelatorio {
  /** Id da RAIZ do centro de custo (a obra). Null se o centro sumiu do cadastro. */
  centroRaizId: string | null;
  centroRaizNome: string;
  percentual: number;
  litros: number;
}

export interface SaidaRelatorio {
  id: string;
  /** Instante ISO. */
  data: string;
  origem: string;
  tipoConsumidor: string;
  tanqueNome: string | null;
  equipamentoId: string | null;
  equipamentoNome: string | null;
  transportadoraId: string | null;
  transportadoraNome: string | null;
  placa: string | null;
  motorista: string | null;
  insumoId: string;
  combustivel: string;
  litros: number;
  precoCombustivel: number | null;
  precoProprietario: number | null;
  taxaLitro: number;
  precoUnitario: number;
  precoMedioTanque: number | null;
  valorTotal: number;
  pago: boolean;
  pagoEm: string | null;
  medicao: number | null;
  tipoMedicao: string | null;
  centroCustoNome: string | null;
  canal: string;
  observacoes: string | null;
  criadoEm: string;
  alocacoes: AlocacaoRelatorio[];
}

export function rotuloTipoConsumidor(tipo: string): string {
  return (ROTULO_TIPO_CONSUMIDOR as Record<string, string>)[tipo as TipoConsumidor] ?? tipo;
}

const ehProprio = (s: SaidaRelatorio) => s.tipoConsumidor === "equipamento_proprio";

function somar(valores: readonly number[]): number {
  return somarValoresOperacionais(valores);
}

// ---------------------------------------------------------------------------
// (a) Mensal consolidado
// ---------------------------------------------------------------------------

export interface LinhaMensal {
  /** yyyy-MM, mês de Rio Branco. */
  mes: string;
  combustivel: string;
  tipoConsumidor: string;
  abastecimentos: number;
  litros: number;
  valor: number;
}

/** Uma linha por mês × combustível × tipo de consumidor. Filtrar no Excel dá qualquer um dos cortes. */
export function consolidarMensal(saidas: readonly SaidaRelatorio[]): LinhaMensal[] {
  const grupos = new Map<string, { base: Omit<LinhaMensal, "abastecimentos" | "litros" | "valor">; itens: SaidaRelatorio[] }>();
  for (const s of saidas) {
    const mes = mesEmRioBranco(s.data);
    const chave = [mes, s.insumoId, s.tipoConsumidor].join("|");
    const grupo = grupos.get(chave) ?? {
      base: { mes, combustivel: s.combustivel, tipoConsumidor: rotuloTipoConsumidor(s.tipoConsumidor) },
      itens: [],
    };
    grupo.itens.push(s);
    grupos.set(chave, grupo);
  }
  return [...grupos.values()]
    .map(({ base, itens }) => ({
      ...base,
      abastecimentos: itens.length,
      litros: somar(itens.map((s) => s.litros)),
      valor: somar(itens.map((s) => s.valorTotal)),
    }))
    .sort(
      (a, b) =>
        a.mes.localeCompare(b.mes) ||
        a.combustivel.localeCompare(b.combustivel, "pt-BR") ||
        a.tipoConsumidor.localeCompare(b.tipoConsumidor, "pt-BR"),
    );
}

// ---------------------------------------------------------------------------
// (b) Por obra
// ---------------------------------------------------------------------------

export const SEM_ALOCACAO = "Sem alocação de obra";

export interface LinhaObra {
  centro: string;
  abastecimentos: number;
  litros: number;
  /** Só equipamento próprio: percentual × valor_total da saída. */
  custo: number;
}

/**
 * Onde o equipamento trabalhou (`abastecimento_alocacoes`): litros da alocação e
 * custo = percentual × valor da saída, só para equipamento próprio (a carreta é
 * da transportadora e não é custo da EMT).
 *
 * Agrupa pelo ID da raiz, não pelo nome: dois cadastros homônimos são dois
 * centros. A saída sem alocação vai inteira para "Sem alocação de obra", para o
 * total da planilha bater com o total de litros do período.
 */
export function consolidarPorObra(saidas: readonly SaidaRelatorio[]): LinhaObra[] {
  const grupos = new Map<string, { centro: string; saidas: Set<string>; litros: number[]; custo: number[] }>();
  const grupo = (chave: string, centro: string) => {
    const existente = grupos.get(chave);
    if (existente) return existente;
    const novo = { centro, saidas: new Set<string>(), litros: [] as number[], custo: [] as number[] };
    grupos.set(chave, novo);
    return novo;
  };

  for (const s of saidas) {
    if (s.alocacoes.length === 0) {
      const g = grupo("sem-alocacao", SEM_ALOCACAO);
      g.saidas.add(s.id);
      g.litros.push(s.litros);
      if (ehProprio(s)) g.custo.push(s.valorTotal);
      continue;
    }
    for (const [indice, alocacao] of s.alocacoes.entries()) {
      const g = grupo(alocacao.centroRaizId ?? `sem-centro:${s.id}:${indice}`, alocacao.centroRaizNome);
      g.saidas.add(s.id);
      g.litros.push(alocacao.litros);
      if (ehProprio(s)) g.custo.push(quatroCasas((s.valorTotal * alocacao.percentual) / 100));
    }
  }

  return [...grupos.values()]
    .map((g) => ({ centro: g.centro, abastecimentos: g.saidas.size, litros: somar(g.litros), custo: somar(g.custo) }))
    .sort((a, b) => b.custo - a.custo || b.litros - a.litros || a.centro.localeCompare(b.centro, "pt-BR"));
}

// ---------------------------------------------------------------------------
// (c) Por equipamento e por carreta
// ---------------------------------------------------------------------------

export interface LinhaEquipamento {
  equipamento: string;
  abastecimentos: number;
  litros: number;
  valor: number;
  /** "Horímetro" ou "Km", quando o equipamento tem leitura nos abastecimentos. */
  medidor: string | null;
  leituraInicial: number | null;
  leituraFinal: number | null;
  /** Final menos inicial: horas ou km rodados entre o primeiro e o último abastecimento do período. */
  rodado: number | null;
}

const ROTULO_MEDIDOR: Record<string, string> = { horimetro: "Horímetro", km: "Km" };

/**
 * Equipamento próprio, um por linha. A leitura (horímetro ou km) vem do próprio
 * abastecimento, só do medidor mais usado nele: misturar hora com km daria um
 * "rodado" sem unidade.
 */
export function consolidarPorEquipamento(saidas: readonly SaidaRelatorio[]): LinhaEquipamento[] {
  const grupos = new Map<string, SaidaRelatorio[]>();
  for (const s of saidas) {
    if (!ehProprio(s) || s.equipamentoId === null) continue;
    const lista = grupos.get(s.equipamentoId) ?? [];
    lista.push(s);
    grupos.set(s.equipamentoId, lista);
  }

  return [...grupos.values()]
    .map((lista) => {
      const contagem = new Map<string, number>();
      for (const s of lista) {
        if (s.medicao !== null && s.tipoMedicao) contagem.set(s.tipoMedicao, (contagem.get(s.tipoMedicao) ?? 0) + 1);
      }
      const tipo = [...contagem.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
      const leituras = tipo
        ? lista.filter((s) => s.tipoMedicao === tipo && s.medicao !== null).map((s) => s.medicao as number)
        : [];
      const inicial = leituras.length > 0 ? Math.min(...leituras) : null;
      const final = leituras.length > 0 ? Math.max(...leituras) : null;
      return {
        equipamento: lista[0].equipamentoNome ?? "Equipamento não encontrado",
        abastecimentos: lista.length,
        litros: somar(lista.map((s) => s.litros)),
        valor: somar(lista.map((s) => s.valorTotal)),
        medidor: tipo ? (ROTULO_MEDIDOR[tipo] ?? tipo) : null,
        leituraInicial: inicial,
        leituraFinal: final,
        rodado: inicial !== null && final !== null ? quatroCasas(final - inicial) : null,
      };
    })
    .sort((a, b) => b.litros - a.litros || a.equipamento.localeCompare(b.equipamento, "pt-BR"));
}

export interface LinhaCarreta {
  transportadora: string;
  placa: string;
  abastecimentos: number;
  litros: number;
  valor: number;
}

/** Carreta de transportadora, por transportadora e placa (normalizada: "abc-1d23" = "ABC1D23"). */
export function consolidarPorCarreta(saidas: readonly SaidaRelatorio[]): LinhaCarreta[] {
  const grupos = new Map<string, SaidaRelatorio[]>();
  for (const s of saidas) {
    if (s.tipoConsumidor !== "carreta_transportadora") continue;
    const placa = (s.placa ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const chave = `${s.transportadoraId ?? "?"}|${placa}`;
    const lista = grupos.get(chave) ?? [];
    lista.push(s);
    grupos.set(chave, lista);
  }
  return [...grupos.values()]
    .map((lista) => ({
      transportadora: lista[0].transportadoraNome ?? "Transportadora não encontrada",
      placa: (lista[0].placa ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "") || "Sem placa",
      abastecimentos: lista.length,
      litros: somar(lista.map((s) => s.litros)),
      valor: somar(lista.map((s) => s.valorTotal)),
    }))
    .sort(
      (a, b) =>
        a.transportadora.localeCompare(b.transportadora, "pt-BR") || a.placa.localeCompare(b.placa) || b.litros - a.litros,
    );
}

/** Sobe pela árvore até a raiz (a obra). Ciclo ou pai sumido para no último conhecido. */
export function raizDoCentro(
  id: string,
  centros: ReadonlyMap<string, { nome: string; paiId: string | null }>,
): { id: string; nome: string } | null {
  let atual = centros.get(id);
  if (!atual) return null;
  let atualId = id;
  const vistos = new Set<string>([id]);
  while (atual.paiId && centros.has(atual.paiId) && !vistos.has(atual.paiId)) {
    vistos.add(atual.paiId);
    atualId = atual.paiId;
    atual = centros.get(atualId)!;
  }
  return { id: atualId, nome: atual.nome };
}

/** "Obra 009 (60%); Obra 002 (40%)", para a coluna de alocação do export bruto. */
export function resumoAlocacoes(alocacoes: readonly AlocacaoRelatorio[]): string {
  return alocacoes
    .map((a) => `${a.centroRaizNome} (${a.percentual.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%)`)
    .join("; ");
}
