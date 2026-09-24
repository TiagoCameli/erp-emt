import { lerListaDaUrl, lerUuidsDaUrl } from "@/modules/financeiro/_shared/listas-na-url";
import {
  EQUIPAMENTO_DESCONHECIDO,
  modoDaUrl,
  noPeriodo,
  opcoesDeEquipamento,
  TIPO_POR_MODO,
  type BaseCombustivel,
  type Modo,
  type SaidaBase,
} from "@/modules/combustivel/anomalias/base";
import {
  diaValido,
  diasDoMes,
  mesAnterior,
  periodoDaUrl,
  somarDias,
  ultimosDias,
  type Periodo,
} from "@/modules/combustivel/relatorios/periodo";

/**
 * O filtro global do Combustível: a FilterBar da origem (v2/filters), que era um estado só
 * para a tela inteira. No ERP ele mora na URL, nas chaves de `CHAVES_RECORTE`
 * (`_shared/navegacao.ts`), e atravessa as abas com o link de cada uma.
 *
 * Módulo puro (sem "use client" e sem server-only): a página lê a URL com
 * `filtroGlobalDaUrl`, filtra as saídas com `aplicarFiltroGlobal` e a barra
 * (`components/barra-filtros-combustivel.tsx`) usa os mesmos presets e rótulos.
 *
 * Fórmulas da origem (VisaoGeralTab.saidasFiltradas / entradasFiltradas), literalmente:
 * - saídas: modo (tipo de consumidor) + período + obra + tanque + combustível + operador;
 *   no modo próprios, equipamento (o sentinela nunca casa com um equipamento escolhido);
 *   no modo carretas, transportadora e placa. Fornecedor NÃO filtra saída.
 * - entradas: período + combustível + fornecedor + tanque. Modo, obra, equipamento e
 *   operador NÃO filtram entrada (a entrada é do tanque, não do consumidor).
 *
 * Diferenças só de forma: a lista viaja em `?obra=id1,id2` (o formato único do ERP,
 * `listas-na-url`) e não em `?obras=`; o período viaja em `de`/`ate` e o preset é
 * deduzido deles (a origem gravava `preset`); placa compara normalizada dos dois lados.
 */

/**
 * Os últimos 30 dias da origem (preset "ultimos_30"). NÃO é mais o padrão do filtro: sem
 * `de`/`ate` na URL o Combustível mostra qualquer data, como o resto do ERP. Com o padrão
 * reinjetado pela página, limpar o período devolvia os 30 dias e o filtro nunca desligava
 * (relatado pelo Tiago em 24/09/2026).
 */
export const DIAS_PADRAO = 30;

/** As pontas de "qualquer data" para quem precisa de um período concreto para comparar texto. */
export const SEM_LIMITE: Periodo = { de: "0000-01-01", ate: "9999-12-31" };

/** As listas do filtro e a chave de cada uma na URL (as de `CHAVES_RECORTE`). */
export const CHAVE_DA_DIMENSAO = {
  obras: "obra",
  equipamentos: "equipamento",
  transportadoras: "transportadora",
  placas: "placa",
  tanques: "tanque",
  combustiveis: "combustivel",
  fornecedores: "fornecedor",
  operadores: "operador",
} as const;

export type DimensaoFiltro = keyof typeof CHAVE_DA_DIMENSAO;

export const DIMENSOES_FILTRO = Object.keys(CHAVE_DA_DIMENSAO) as DimensaoFiltro[];

/** Placa e operador são texto livre na saída; o resto é id (uuid). */
const DIMENSOES_TEXTO: ReadonlySet<DimensaoFiltro> = new Set(["placas", "operadores"]);

export interface FiltroGlobal {
  modo: Modo;
  /** O período da URL; `null` = qualquer data (sem `de`/`ate`, como no resto do ERP). */
  periodo: Periodo | null;
  obras: string[];
  /** Só vale no modo próprios. */
  equipamentos: string[];
  /** Só vale no modo carretas. */
  transportadoras: string[];
  /** Só vale no modo carretas. Texto livre. */
  placas: string[];
  tanques: string[];
  combustiveis: string[];
  /** Só filtra ENTRADAS (a R$/L por fornecedor), como na origem. */
  fornecedores: string[];
  /** Motorista/operador da saída. Texto livre. */
  operadores: string[];
}

/** O que a página recebe em `searchParams`, ou um `URLSearchParams` do cliente. */
export type ParamsDaUrl = Record<string, string | string[] | undefined> | URLSearchParams;

function valorDaUrl(params: ParamsDaUrl, chave: string): string | string[] | undefined {
  if (params instanceof URLSearchParams) {
    const todos = params.getAll(chave);
    return todos.length === 0 ? undefined : todos;
  }
  return params[chave];
}

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

const TETO_TEXTO = 120;

function textoValido(item: string): boolean {
  return item.length > 0 && item.length <= TETO_TEXTO;
}

/** Lê uma lista do filtro no formato do ERP (vírgula ou chave repetida, dedup, teto). */
export function lerDimensao(valor: string | string[] | undefined, dimensao: DimensaoFiltro): string[] {
  return DIMENSOES_TEXTO.has(dimensao) ? lerListaDaUrl(valor, textoValido) : lerUuidsDaUrl(valor);
}

/**
 * O período da URL, ou `null` quando ela não traz nenhum. Uma ponta só vale como limite
 * aberto do outro lado: "a partir de 01/09" é um filtro legítimo.
 */
export function periodoOpcionalDaUrl(
  de: string | string[] | undefined,
  ate: string | string[] | undefined,
): Periodo | null {
  const inicio = diaValido(primeiro(de));
  const fim = diaValido(primeiro(ate));
  if (inicio === null && fim === null) return null;
  return periodoDaUrl(de, ate, SEM_LIMITE);
}

/**
 * O período concreto de um recorte: o escolhido, com a ponta aberta (ou as duas, sem
 * período) fechada na extensão das linhas — do dia mais antigo até hoje, ou até o mais
 * novo se passar de hoje. É o que gráfico, sparkline e ranking precisam para montar os
 * baldes; o FILTRO continua sendo "qualquer data". `linhas` já vêm filtradas.
 */
export function periodoEfetivo(periodo: Periodo | null, linhas: readonly { data: string }[], hoje: string): Periodo {
  let menor: string | null = null;
  let maior: string | null = null;
  for (const linha of linhas) {
    const dia = linha.data.slice(0, 10);
    if (menor === null || dia < menor) menor = dia;
    if (maior === null || dia > maior) maior = dia;
  }
  const aberto = periodo ?? SEM_LIMITE;
  let ate = aberto.ate !== SEM_LIMITE.ate ? aberto.ate : maior !== null && maior > hoje ? maior : hoje;
  const de = aberto.de !== SEM_LIMITE.de ? aberto.de : menor !== null && menor < ate ? menor : ate;
  if (de > ate) ate = de;
  return { de, ate };
}

/**
 * O período tem as duas pontas escolhidas? Só então existe "período anterior de mesma
 * duração" para os deltas dos KPIs; sem isso eles somem, em vez de comparar com um vazio e
 * mostrar +100%.
 */
export function periodoFechado(periodo: Periodo | null): periodo is Periodo {
  return periodo !== null && periodo.de !== SEM_LIMITE.de && periodo.ate !== SEM_LIMITE.ate;
}

/** As pontas como a URL e o `FiltroPeriodo` as escrevem: ponta aberta (ou sem período) é "". */
export function pontasDoPeriodo(periodo: Periodo | null): Periodo {
  return {
    de: periodo === null || periodo.de === SEM_LIMITE.de ? "" : periodo.de,
    ate: periodo === null || periodo.ate === SEM_LIMITE.ate ? "" : periodo.ate,
  };
}

/** O filtro global a partir da URL. */
export function filtroGlobalDaUrl(params: ParamsDaUrl): FiltroGlobal {
  const de = valorDaUrl(params, "de");
  const ate = valorDaUrl(params, "ate");
  const listas = Object.fromEntries(
    DIMENSOES_FILTRO.map((dimensao) => [dimensao, lerDimensao(valorDaUrl(params, CHAVE_DA_DIMENSAO[dimensao]), dimensao)]),
  ) as Record<DimensaoFiltro, string[]>;
  return {
    modo: modoDaUrl(valorDaUrl(params, "modo")),
    periodo: periodoOpcionalDaUrl(de, ate),
    ...listas,
  };
}

/** Há filtro (o modo não conta)? O `hasActiveFilters` da origem. */
export function temFiltroAtivo(filtro: FiltroGlobal): boolean {
  return filtro.periodo !== null || DIMENSOES_FILTRO.some((dimensao) => filtro[dimensao].length > 0);
}

function normalizarPlaca(placa: string | null | undefined): string {
  return (placa ?? "").trim().toLowerCase();
}

/**
 * As saídas do recorte: o `saidasFiltradas` da origem. `periodo` troca a janela (o período
 * anterior dos KPIs usa os mesmos filtros em outra janela).
 */
export function aplicarFiltroGlobal<T extends SaidaBase>(
  saidas: readonly T[],
  filtro: FiltroGlobal,
  periodo: Periodo | null = filtro.periodo,
): T[] {
  const tipo = TIPO_POR_MODO[filtro.modo];
  const obras = new Set(filtro.obras);
  const equipamentos = new Set(filtro.equipamentos);
  const combustiveis = new Set(filtro.combustiveis);
  const operadores = new Set(filtro.operadores);
  const transportadoras = new Set(filtro.transportadoras);
  const placas = new Set(filtro.placas.map(normalizarPlaca));
  const tanques = new Set(filtro.tanques);
  return saidas.filter((s) => {
    if (s.tipoConsumidor !== tipo) return false;
    if (periodo !== null && !noPeriodo(s, periodo.de, periodo.ate)) return false;
    if (obras.size > 0 && (!s.obraId || !obras.has(s.obraId))) return false;
    if (tanques.size > 0 && (!s.tanqueId || !tanques.has(s.tanqueId))) return false;
    if (filtro.modo === "proprios") {
      if (equipamentos.size > 0) {
        const equipamento = s.equipamentoId && s.equipamentoId !== EQUIPAMENTO_DESCONHECIDO ? s.equipamentoId : null;
        if (!equipamento || !equipamentos.has(equipamento)) return false;
      }
    } else {
      if (transportadoras.size > 0 && (!s.transportadoraId || !transportadoras.has(s.transportadoraId))) return false;
      if (placas.size > 0 && !placas.has(normalizarPlaca(s.placa))) return false;
    }
    if (combustiveis.size > 0 && (!s.tipoCombustivel || !combustiveis.has(s.tipoCombustivel))) return false;
    if (operadores.size > 0 && !operadores.has((s.motorista ?? "").trim())) return false;
    return true;
  });
}

/** O mínimo de uma entrada que o filtro olha. `data` é o relógio de parede de Rio Branco. */
export interface EntradaFiltravel {
  data: string;
  tanqueId: string | null;
  insumoId: string | null;
  fornecedorId: string | null;
}

/** As entradas do recorte: o `entradasFiltradas` da origem (período, combustível, fornecedor, tanque). */
export function aplicarFiltroGlobalEntradas<T extends EntradaFiltravel>(
  entradas: readonly T[],
  filtro: FiltroGlobal,
  periodo: Periodo | null = filtro.periodo,
): T[] {
  const combustiveis = new Set(filtro.combustiveis);
  const fornecedores = new Set(filtro.fornecedores);
  const tanques = new Set(filtro.tanques);
  return entradas.filter((e) => {
    if (periodo !== null && !noPeriodo(e, periodo.de, periodo.ate)) return false;
    if (combustiveis.size > 0 && (!e.insumoId || !combustiveis.has(e.insumoId))) return false;
    if (fornecedores.size > 0 && (!e.fornecedorId || !fornecedores.has(e.fornecedorId))) return false;
    if (tanques.size > 0 && (!e.tanqueId || !tanques.has(e.tanqueId))) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Período: presets da origem (PeriodoPanel)
// ---------------------------------------------------------------------------

export const PRESETS_PERIODO = [
  { id: "hoje", rotulo: "Hoje" },
  { id: "ultimos_7", rotulo: "Últimos 7 dias" },
  { id: "ultimos_30", rotulo: "Últimos 30 dias" },
  { id: "mes_atual", rotulo: "Mês atual" },
  { id: "mes_anterior", rotulo: "Mês anterior" },
  { id: "trimestre_atual", rotulo: "Trimestre atual" },
  { id: "ano_atual", rotulo: "Ano atual" },
] as const;

export type PresetPeriodo = (typeof PRESETS_PERIODO)[number]["id"];

/** O `computePeriodoFromPreset` da origem, relativo a `hoje` (AAAA-MM-DD de Rio Branco). */
export function periodoDoPreset(preset: PresetPeriodo, hoje: string): Periodo {
  switch (preset) {
    case "hoje":
      return { de: hoje, ate: hoje };
    case "ultimos_7":
      return ultimosDias(hoje, 7);
    case "ultimos_30":
      return ultimosDias(hoje, DIAS_PADRAO);
    case "mes_atual":
      return diasDoMes(hoje.slice(0, 7));
    case "mes_anterior":
      return diasDoMes(mesAnterior(hoje));
    case "trimestre_atual": {
      const ano = hoje.slice(0, 4);
      const primeiroMes = Math.floor((Number(hoje.slice(5, 7)) - 1) / 3) * 3 + 1;
      const inicio = diasDoMes(`${ano}-${String(primeiroMes).padStart(2, "0")}`);
      const fim = diasDoMes(`${ano}-${String(primeiroMes + 2).padStart(2, "0")}`);
      return { de: inicio.de, ate: fim.ate };
    }
    case "ano_atual":
      return { de: `${hoje.slice(0, 4)}-01-01`, ate: `${hoje.slice(0, 4)}-12-31` };
  }
}

/** Qual preset o período é (a origem gravava o preset; aqui ele sai de `de`/`ate`). */
export function presetDoPeriodo(periodo: Periodo, hoje: string): PresetPeriodo | "personalizado" {
  for (const { id } of PRESETS_PERIODO) {
    const candidato = periodoDoPreset(id, hoje);
    if (candidato.de === periodo.de && candidato.ate === periodo.ate) return id;
  }
  return "personalizado";
}

/** "dd/mm/aa", o `fmtData` da origem. */
export function dataCurta(dia: string): string {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(2, 4)}`;
}

/** "02/05/26 – 08/05/26"; um dia só mostra uma data (o `fmtPeriodo` da origem). */
export function rotuloPeriodo(periodo: Periodo): string {
  return periodo.de === periodo.ate ? dataCurta(periodo.de) : `${dataCurta(periodo.de)} – ${dataCurta(periodo.ate)}`;
}

/** Dias inclusivos do período. */
export function diasNoPeriodo(periodo: Periodo): number {
  let dias = 1;
  // Aritmética de calendário: o período de um ano tem 365/366 passos, barato.
  for (let dia = periodo.de; dia < periodo.ate; dia = somarDias(dia, 1)) dias += 1;
  return dias;
}

// ---------------------------------------------------------------------------
// Escrita na URL (a barra e o clique nos gráficos)
// ---------------------------------------------------------------------------

/** Liga/desliga um valor numa lista (o `toggleInArray` da origem). */
export function alternarValor(lista: readonly string[], valor: string): string[] {
  return lista.includes(valor) ? lista.filter((item) => item !== valor) : [...lista, valor];
}

/**
 * As mudanças de URL para apagar TODO o filtro global (o "Limpar tudo" da origem). O modo
 * fica: ele é o seletor do topo, não um chip, e limpar filtro não pediu para trocar de modo.
 */
export function mudancasParaLimpar(): Record<string, null> {
  const mudancas: Record<string, null> = { de: null, ate: null };
  for (const dimensao of DIMENSOES_FILTRO) mudancas[CHAVE_DA_DIMENSAO[dimensao]] = null;
  return mudancas;
}

// ---------------------------------------------------------------------------
// Opções da barra
// ---------------------------------------------------------------------------

export interface OpcaoDoFiltro {
  valor: string;
  rotulo: string;
}

/** As opções prontas de cada lista da barra (e os nomes dos chips). */
export type OpcoesFiltroGlobal = Record<DimensaoFiltro, OpcaoDoFiltro[]>;

function porRotulo(a: OpcaoDoFiltro, b: OpcaoDoFiltro): number {
  return a.rotulo.localeCompare(b.rotulo, "pt-BR");
}

/** Entrada com o nome do fornecedor, para a lista de fornecedores (a origem os tira das entradas). */
export interface EntradaComFornecedor extends EntradaFiltravel {
  fornecedorNome: string | null;
}

/**
 * As opções da barra a partir da base carregada. Obra e combustível listam os que aparecem
 * nas saídas e entradas (a raiz de centro de custo inclui o Escritório e afins, que nunca
 * abastecem); equipamento lista os ativos sem o sentinela (como o seletor da origem);
 * operador e placa são os textos distintos das saídas do modo; fornecedor, os das entradas.
 * O que está marcado na URL entra sempre, para o chip e o gatilho mostrarem o nome.
 */
export function opcoesDoFiltroGlobal(
  base: BaseCombustivel,
  entradas: readonly EntradaComFornecedor[],
  filtro: FiltroGlobal,
): OpcoesFiltroGlobal {
  const tipo = TIPO_POR_MODO[filtro.modo];
  const doModo = base.saidas.filter((s) => s.tipoConsumidor === tipo);

  const obras = new Set<string>(filtro.obras);
  const combustiveis = new Set<string>(filtro.combustiveis);
  for (const s of base.saidas) {
    if (s.obraId) obras.add(s.obraId);
    if (s.tipoCombustivel) combustiveis.add(s.tipoCombustivel);
  }
  const fornecedores = new Map<string, string>();
  for (const e of entradas) {
    if (e.insumoId) combustiveis.add(e.insumoId);
    if (e.fornecedorId) fornecedores.set(e.fornecedorId, e.fornecedorNome?.trim() || "Fornecedor sem nome");
  }

  const textos = (valores: Iterable<string | null>, marcados: readonly string[]) => {
    const vistos = new Set<string>(marcados);
    for (const valor of valores) {
      const texto = (valor ?? "").trim();
      if (texto) vistos.add(texto);
    }
    return [...vistos].map((valor) => ({ valor, rotulo: valor })).sort(porRotulo);
  };

  const equipamentos = opcoesDeEquipamento(base.equipamentos);
  const equipamentosMarcadosFora = filtro.equipamentos
    .filter((id) => !equipamentos.some((o) => o.valor === id))
    .map((id) => {
      const e = base.equipamentos.find((eq) => eq.id === id);
      return { valor: id, rotulo: e ? e.descricao : "Equipamento não encontrado" };
    });

  const transportadoras = new Set<string>(filtro.transportadoras);
  for (const s of doModo) if (s.transportadoraId) transportadoras.add(s.transportadoraId);

  return {
    obras: [...obras]
      .map((id) => ({ valor: id, rotulo: base.obraNome.get(id) ?? "Obra não encontrada" }))
      .sort(porRotulo),
    equipamentos: [...equipamentos, ...equipamentosMarcadosFora],
    transportadoras: [...transportadoras]
      .map((id) => ({ valor: id, rotulo: base.transportadoraNome.get(id) ?? "Transportadora não encontrada" }))
      .sort(porRotulo),
    placas: textos(
      doModo.map((s) => s.placa),
      filtro.placas,
    ),
    tanques: base.tanques
      .filter((t) => t.ativo || filtro.tanques.includes(t.id))
      .map((t) => ({ valor: t.id, rotulo: t.nomeExibicao }))
      .sort(porRotulo),
    combustiveis: [...combustiveis]
      .map((id) => ({ valor: id, rotulo: base.combustivelNome.get(id) ?? "Combustível não encontrado" }))
      .sort(porRotulo),
    fornecedores: [
      ...[...fornecedores].map(([valor, rotulo]) => ({ valor, rotulo })),
      ...filtro.fornecedores
        .filter((id) => !fornecedores.has(id))
        .map((id) => ({ valor: id, rotulo: "Fornecedor não encontrado" })),
    ].sort(porRotulo),
    operadores: textos(
      doModo.map((s) => s.motorista),
      filtro.operadores,
    ),
  };
}
