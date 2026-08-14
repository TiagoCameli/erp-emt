import { rotuloMes } from "@/modules/financeiro/relatorios/calculo";

/**
 * A FATIA que um relatório recortou, quando essa fatia é de nível de PARCELA.
 *
 * Existe como valor tipado, num parâmetro só da URL (`recorte`), por dois motivos.
 *
 * Primeiro, e é o que decide: **não é filtro de usuário, é a chave da dimensão do
 * relatório**. O aging classifica faixa por dias de atraso dentro de
 * `fn_rel_aging`, e o fluxo de caixa agrupa o realizado pelo mês do PAGAMENTO
 * (`coalesce(data_pagamento, data_vencimento)`). Remontar isso no destino com
 * `venc_de`/`venc_ate` erraria em 694 parcelas da base de hoje — as pagas em mês
 * diferente do vencimento, medido em 14/08/2026 — e descartaria parcela sem
 * vencimento, que o aging conta como "a vencer" e um filtro de data exclui. A
 * fatia viaja pela chave da própria dimensão, nunca por uma reconstrução dela.
 *
 * Segundo: cinco parâmetros soltos (mês, faixa, realizado, status de parcela,
 * medida) convidariam a combinações que nenhum relatório produz e que ninguém
 * validou. Um valor fechado só tem os estados que existem de verdade.
 *
 * Módulo puro: nada de banco, nada de React, então dá para testar direto.
 */

export type FaixaAgingRecorte =
  | "a_vencer"
  | "v_1_7"
  | "v_8_15"
  | "v_16_30"
  | "v_31_60"
  | "v_60_mais";

export type TipoLancamentoRecorte = "a_pagar" | "a_receber";

export type Recorte =
  | {
      tipo: "aging";
      faixa: FaixaAgingRecorte;
      tipoLancamento: TipoLancamentoRecorte;
    }
  | { tipo: "fluxo"; mes: string; realizado: boolean }
  | { tipo: "conta_paga" };

/** Como cada fatia é somada: a MESMA medida do relatório que a gerou. */
export type MedidaRecorte = "valor" | "liquido";

const FAIXAS: FaixaAgingRecorte[] = [
  "a_vencer",
  "v_1_7",
  "v_8_15",
  "v_16_30",
  "v_31_60",
  "v_60_mais",
];

const TIPOS: TipoLancamentoRecorte[] = ["a_pagar", "a_receber"];

/** Mês yyyy-MM com mês de 01 a 12, igual ao MES_VALIDO da página de relatórios. */
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

const ROTULO_FAIXA: Record<FaixaAgingRecorte, string> = {
  a_vencer: "a vencer",
  v_1_7: "vencidas 1 a 7 dias",
  v_8_15: "vencidas 8 a 15 dias",
  v_16_30: "vencidas 16 a 30 dias",
  v_31_60: "vencidas 31 a 60 dias",
  v_60_mais: "vencidas mais de 60 dias",
};

/**
 * Lê e valida o `recorte` da URL. Qualquer coisa fora do contrato volta
 * `undefined`, incluindo chave repetida (que o App Router entrega como array).
 */
export function lerRecorte(
  valor: string | string[] | undefined,
): Recorte | undefined {
  if (typeof valor !== "string" || valor === "") return undefined;

  if (valor === "conta_paga") return { tipo: "conta_paga" };

  const partes = valor.split(":");

  if (partes[0] === "aging" && partes.length === 3) {
    const faixa = partes[1] as FaixaAgingRecorte;
    const tipoLancamento = partes[2] as TipoLancamentoRecorte;
    if (!FAIXAS.includes(faixa) || !TIPOS.includes(tipoLancamento)) {
      return undefined;
    }
    return { tipo: "aging", faixa, tipoLancamento };
  }

  if (partes[0] === "fluxo" && partes.length === 3) {
    const mes = partes[1];
    if (!MES.test(mes)) return undefined;
    if (partes[2] !== "realizado" && partes[2] !== "previsto") return undefined;
    return { tipo: "fluxo", mes, realizado: partes[2] === "realizado" };
  }

  return undefined;
}

/**
 * Serializa a fatia para a URL. Fecha o ciclo com `lerRecorte`, e é por isso que
 * as duas moram no mesmo módulo: quem escreve e quem lê a URL têm que concordar
 * caractere por caractere, e separá-las é convidar a divergência.
 */
export function escreverRecorte(recorte: Recorte): string {
  switch (recorte.tipo) {
    case "aging":
      return `aging:${recorte.faixa}:${recorte.tipoLancamento}`;
    case "fluxo":
      return `fluxo:${recorte.mes}:${recorte.realizado ? "realizado" : "previsto"}`;
    case "conta_paga":
      return "conta_paga";
  }
}

/**
 * Texto do chip da barra de filtros. A fatia aparece como leitura, não como
 * seletor: ela não é uma escolha que o usuário faz na tela, é o recorte que veio
 * do relatório, e ele precisa saber que está valendo para entender o total.
 */
export function rotuloRecorte(recorte: Recorte): string {
  switch (recorte.tipo) {
    case "aging": {
      const tipo =
        recorte.tipoLancamento === "a_pagar" ? "a pagar" : "a receber";
      return `Parcelas ${tipo} ${ROTULO_FAIXA[recorte.faixa]}`;
    }
    case "fluxo":
      return recorte.realizado
        ? `Parcelas pagas em ${rotuloMes(recorte.mes)}`
        : `Parcelas previstas para ${rotuloMes(recorte.mes)}`;
    case "conta_paga":
      return "Parcelas pagas";
  }
}

/**
 * Aging soma `valor` (é dívida viva, e o desconto só nasce no ato do pagamento);
 * fluxo e posição bancária somam o LÍQUIDO, porque foi o que passou no caixa.
 *
 * É a mesma escolha que `fn_rel_aging`, `fn_rel_fluxo_caixa` e
 * `fn_rel_posicao_bancaria` fazem no banco. Ela tem que continuar igual dos dois
 * lados: trocar a medida aqui faz o total do drill parar de fechar com a célula
 * clicada, e nada na tela avisaria.
 */
export function medidaDoRecorte(recorte: Recorte): MedidaRecorte {
  return recorte.tipo === "aging" ? "valor" : "liquido";
}
