/**
 * PEPS (FIFO) do Gestão Obras, portado linha a linha de `src/utils/fifoCombustivel.ts`.
 *
 * Tiago, 24/09/2026: "tudo do combustivel tem que ser exatamente igual no app gestao obras".
 * Na origem é ESTE cálculo, feito na tela, que sugere o preço da carreta e grava o
 * `preco_medio_tanque` (snapshot) da saída. O banco do ERP tem o PEPS dele
 * (`fn_comb_recalcular_peps`), que continua regravando as camadas; este aqui é o da tela.
 *
 * A origem compara datas como TEXTO ISO de relógio ("2026-01-01T08:00:00", sem fuso), com
 * `<=` e `localeCompare`. O ERP guarda timestamptz, então toda data entra aqui já convertida
 * para o relógio de Rio Branco no MESMO formato (`relogioRioBranco`): a ordem e os empates
 * ficam os da origem.
 *
 * Módulo puro (sem "use client" e sem server-only): serve a action, a tela e o teste.
 */

import { dataHoraLocalParaIso } from "@/modules/combustivel/_shared/rotulos";

// ---------------------------------------------------------------------------
// Datas no formato da origem
// ---------------------------------------------------------------------------

/** Rio Branco é UTC-5 o ano todo (sem horário de verão), como em `rotulos.ts`. */
const DESLOCAMENTO_RIO_BRANCO_MS = 5 * 60 * 60 * 1000;

/**
 * Instante ISO (qualquer fuso) -> relógio de Rio Branco "AAAA-MM-DDTHH:MM:SS", o formato
 * das datas da origem. Inválido -> "".
 */
export function relogioRioBranco(iso: string): string {
  const instante = new Date(iso);
  if (Number.isNaN(instante.getTime())) return "";
  return new Date(instante.getTime() - DESLOCAMENTO_RIO_BRANCO_MS).toISOString().slice(0, 19);
}

/**
 * Campo `datetime-local` ("AAAA-MM-DDTHH:MM", hora de Rio Branco) -> relógio da origem. A
 * origem faz `${data}:00` quando o campo vem com 16 caracteres.
 */
export function relogioDoCampo(dataHoraLocal: string): string {
  const iso = dataHoraLocalParaIso(dataHoraLocal);
  return iso ? relogioRioBranco(iso) : "";
}

// ---------------------------------------------------------------------------
// Formas dos dados (os campos que a origem lê de cada tipo)
// ---------------------------------------------------------------------------

export interface EntradaFifo {
  id: string;
  depositoId: string;
  /** Relógio de Rio Branco "AAAA-MM-DDTHH:MM:SS". */
  dataHora: string;
  tipoCombustivel: string;
  /** Litros (no ERP, a coluna `litros`: galão de Arla já convertido). */
  quantidadeLitros: number;
  valorTotal: number;
}

export interface TransferenciaFifo {
  id: string;
  depositoOrigemId: string;
  depositoDestinoId: string;
  dataHora: string;
  quantidadeLitros: number;
  valorTotal: number;
  /** Na origem é opcional; sem tipo, a transferência não filtra. */
  tipoCombustivel?: string | null;
}

export interface SaidaFifo {
  id: string;
  tanqueId: string | null;
  data: string;
  litros: number;
  tipoCombustivel: string;
}

export interface EsvaziamentoFifo {
  id: string;
  depositoId: string;
  dataHora: string;
  litrosDescartados: number;
}

export type FonteTipo = "entrada" | "transferencia";

export interface PorcaoConsumida {
  fonteTipo: FonteTipo;
  fonteId: string;
  fonteDataHora: string;
  /** Saldo do lote imediatamente antes desta saída consumir dele (após o
   *  replay dos consumos anteriores). */
  saldoAntesDoConsumo: number;
  litros: number;
  preco: number;
}

/**
 * Qualquer evento anterior que DRENOU o tanque e precisa reduzir o saldo dos
 * lotes no replay FIFO. Três tipos:
 *  - 'saida'            -> abastecimento (combustivel_saidas)
 *  - 'transferencia_out'-> transferência SAINDO do tanque (origem)
 *  - 'esvaziamento'     -> descarte explícito (combustivel_esvaziamentos)
 *
 * Não carrega tipo de combustível: o CALLER é responsável por passar só os
 * consumos do combustível relevante (saídas/transferências filtradas por tipo;
 * esvaziamento drena o tanque inteiro).
 */
export interface ConsumoAnterior {
  tipo: "saida" | "transferencia_out" | "esvaziamento";
  tanqueId: string;
  data: string;
  litros: number;
}

export interface FIFOInput {
  tanqueId: string;
  /** Relógio de Rio Branco da saída. */
  dataHora: string;
  /** Solicitados. */
  litros: number;
  entradas: EntradaFifo[];
  /** Transferências ENTRANDO no tanque (viram lote). */
  transferenciasIn: TransferenciaFifo[];
  /** Tudo que já drenou o tanque antes desta saída (saída/transf-out/esvaz). */
  consumosAnteriores: ConsumoAnterior[];
  // FIFO é segmentado por tipo de combustível: uma saída de S500 só consome
  // lotes de S500, etc. Quando omitido, não filtra lotes por tipo (compat).
  // Deve corresponder ao tipo de combustível da saída. Só filtra ENTRADAS e
  // transferências-IN (lotes); os consumosAnteriores já chegam filtrados.
  tipoCombustivel?: string;
}

export interface FIFOResult {
  /** Média ponderada das porções. */
  precoMedio: number;
  detalhamento: PorcaoConsumida[];
  /** > 0 se faltou lote. */
  litrosSemSuprimento: number;
}

interface LoteSaldo {
  fonteTipo: FonteTipo;
  fonteId: string;
  dataHora: string;
  litrosOriginal: number;
  precoUnitario: number;
  saldoRestante: number;
}

/**
 * Calcula preço FIFO real consumindo lotes em ordem cronológica.
 *
 * Algoritmo:
 * 1. Lista todos os lotes do tanque (entradas + transferências-IN) ATÉ a data
 *    desta saída.
 * 2. Ordena lotes por data ASC (FIFO).
 * 3. Replay dos consumos anteriores (saída + transferência-out + esvaziamento)
 *    em ordem cronológica -> reduz saldo dos lotes.
 * 4. Consome esta saída dos lotes restantes em ordem.
 * 5. Retorna {precoMedio (média ponderada das porções), detalhamento,
 *    litrosSemSuprimento}.
 *
 * Comparação de texto ISO de relógio (sem fuso): `<=` e `localeCompare` funcionam
 * porque os dois lados são textos ISO ordenáveis. NÃO usa `new Date(...)`.
 */
export function calcularPrecoFIFO(input: FIFOInput): FIFOResult {
  const { tanqueId, dataHora, litros, entradas, transferenciasIn, consumosAnteriores, tipoCombustivel } = input;

  // 1. Monta lista de lotes ATÉ a data da saída (comparação de texto),
  //    filtrando pelo tipo de combustível quando informado.
  const saldos: LoteSaldo[] = [];
  for (const e of entradas) {
    if (e.depositoId === tanqueId && e.dataHora <= dataHora && (!tipoCombustivel || e.tipoCombustivel === tipoCombustivel)) {
      saldos.push({
        fonteTipo: "entrada",
        fonteId: e.id,
        dataHora: e.dataHora,
        litrosOriginal: e.quantidadeLitros,
        precoUnitario: e.quantidadeLitros > 0 ? e.valorTotal / e.quantidadeLitros : 0,
        saldoRestante: e.quantidadeLitros,
      });
    }
  }
  for (const t of transferenciasIn) {
    if (
      t.depositoDestinoId === tanqueId &&
      t.dataHora <= dataHora &&
      (!tipoCombustivel || t.tipoCombustivel === tipoCombustivel)
    ) {
      saldos.push({
        fonteTipo: "transferencia",
        fonteId: t.id,
        dataHora: t.dataHora,
        litrosOriginal: t.quantidadeLitros,
        precoUnitario: t.quantidadeLitros > 0 ? t.valorTotal / t.quantidadeLitros : 0,
        saldoRestante: t.quantidadeLitros,
      });
    }
  }

  // 2. Ordena lotes por dataHora ASC, desempata por fonteId pra determinismo
  saldos.sort((a, b) => {
    const cmp = a.dataHora.localeCompare(b.dataHora);
    return cmp !== 0 ? cmp : a.fonteId.localeCompare(b.fonteId);
  });

  // 3. Replay dos consumos anteriores (drenam o saldo) em ordem cronológica
  const consumosOrdenados = consumosAnteriores
    .filter((c) => c.tanqueId === tanqueId && c.data < dataHora)
    .sort((a, b) => a.data.localeCompare(b.data));

  for (const c of consumosOrdenados) {
    let restante = c.litros;
    for (const lote of saldos) {
      if (restante <= 0) break;
      if (lote.saldoRestante <= 0) continue;
      // Um consumo não pode drenar um lote que chegou DEPOIS dele. Sem isso, um
      // esvaziamento de troca de combustível (que drenou o combustível antigo)
      // reduziria por engano os lotes do combustível novo, que entraram depois.
      if (lote.dataHora > c.data) continue;
      const consome = Math.min(restante, lote.saldoRestante);
      lote.saldoRestante -= consome;
      restante -= consome;
    }
    // Sobra (consumo anterior sem suprimento) não interfere nesta saída.
  }

  // 4. Consome ESTA saída
  let faltando = litros;
  const detalhamento: PorcaoConsumida[] = [];
  for (const lote of saldos) {
    if (faltando <= 0) break;
    if (lote.saldoRestante <= 0) continue;
    const consome = Math.min(faltando, lote.saldoRestante);
    detalhamento.push({
      fonteTipo: lote.fonteTipo,
      fonteId: lote.fonteId,
      fonteDataHora: lote.dataHora,
      saldoAntesDoConsumo: lote.saldoRestante,
      litros: consome,
      preco: lote.precoUnitario,
    });
    lote.saldoRestante -= consome;
    faltando -= consome;
  }

  // 5. Média ponderada das porções consumidas
  const litrosSupridos = detalhamento.reduce((s, p) => s + p.litros, 0);
  const valorSuprido = detalhamento.reduce((s, p) => s + p.litros * p.preco, 0);
  const precoMedio = litrosSupridos > 0 ? valorSuprido / litrosSupridos : 0;

  return {
    precoMedio,
    detalhamento,
    litrosSemSuprimento: faltando,
  };
}

/**
 * Monta a lista de consumosAnteriores dum tanque (pros callers do FIFO), unindo
 * os três drenos: saídas, transferências-OUT e esvaziamentos.
 *
 * Segmentação por tipo: saídas e transferências-out são filtradas pelo
 * `tipoCombustivel` da saída em cálculo (transferência sem tipo entra sempre).
 * Esvaziamento drena o tanque inteiro, então entra sem filtro de tipo: a
 * guarda de data no calcularPrecoFIFO evita que ele reduza lotes posteriores.
 *
 * `excluirSaidaId`: em modo edição, exclui a própria saída do replay (senão
 * ela se consumiria).
 */
export function montarConsumosAnteriores(input: {
  tanqueId: string;
  tipoCombustivel?: string;
  saidas: SaidaFifo[];
  transferencias: TransferenciaFifo[];
  esvaziamentos: EsvaziamentoFifo[];
  excluirSaidaId?: string;
}): ConsumoAnterior[] {
  const { tanqueId, tipoCombustivel, saidas, transferencias, esvaziamentos, excluirSaidaId } = input;
  const out: ConsumoAnterior[] = [];

  for (const s of saidas) {
    if (s.tanqueId !== tanqueId) continue;
    if (excluirSaidaId && s.id === excluirSaidaId) continue;
    if (tipoCombustivel && s.tipoCombustivel !== tipoCombustivel) continue;
    out.push({ tipo: "saida", tanqueId, data: s.data, litros: s.litros });
  }

  for (const t of transferencias) {
    if (t.depositoOrigemId !== tanqueId) continue;
    if (tipoCombustivel && t.tipoCombustivel && t.tipoCombustivel !== tipoCombustivel) continue;
    out.push({ tipo: "transferencia_out", tanqueId, data: t.dataHora, litros: t.quantidadeLitros });
  }

  for (const e of esvaziamentos) {
    if (e.depositoId !== tanqueId) continue;
    out.push({ tipo: "esvaziamento", tanqueId, data: e.dataHora, litros: e.litrosDescartados });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Chamada completa, como a tela da origem faz (SaidaCombustivelForm, fifoResult)
// ---------------------------------------------------------------------------

/** O que foi lido do banco para um tanque (entradas, transferências dos dois lados, saídas, esvaziamentos). */
export interface MovimentosFifoTanque {
  entradas: EntradaFifo[];
  transferencias: TransferenciaFifo[];
  saidas: SaidaFifo[];
  esvaziamentos: EsvaziamentoFifo[];
}

/**
 * O `fifoResult` da tela da origem: lotes de entradas e transferências recebidas, replay
 * dos três drenos, tipo do combustível da saída e a própria saída fora do replay na edição.
 * Sem litros, tudo zero (a origem devolve zero antes de chamar o FIFO).
 */
export function precoFifoDaSaida(
  movimentos: MovimentosFifoTanque,
  params: { tanqueId: string; dataHora: string; litros: number; tipoCombustivel?: string; excluirSaidaId?: string },
): FIFOResult {
  if (!params.litros || params.litros <= 0) {
    return { precoMedio: 0, detalhamento: [], litrosSemSuprimento: 0 };
  }
  return calcularPrecoFIFO({
    tanqueId: params.tanqueId,
    dataHora: params.dataHora,
    litros: params.litros,
    entradas: movimentos.entradas,
    transferenciasIn: movimentos.transferencias,
    tipoCombustivel: params.tipoCombustivel,
    consumosAnteriores: montarConsumosAnteriores({
      tanqueId: params.tanqueId,
      tipoCombustivel: params.tipoCombustivel,
      saidas: movimentos.saidas,
      transferencias: movimentos.transferencias,
      esvaziamentos: movimentos.esvaziamentos,
      excluirSaidaId: params.excluirSaidaId,
    }),
  });
}

/**
 * Tipo de combustível do tanque da EMT, como a origem (`tipoCombustivelDoTanque`): o da
 * entrada mais nova daquele tanque. Ordenação estável, como o `sort` da origem: no empate
 * fica a ordem de chegada. Sem entrada: "".
 */
export function combustivelDaUltimaEntrada(entradas: readonly EntradaFifo[], tanqueId: string): string {
  const ents = entradas
    .filter((e) => e.depositoId === tanqueId)
    .slice()
    .sort((a, b) => b.dataHora.localeCompare(a.dataHora));
  return ents[0]?.tipoCombustivel ?? "";
}
