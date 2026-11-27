"use server";

import { z } from "zod";

import { erroAcao, textoDoErro } from "@/lib/erros";
import { exigirPermissao } from "@/lib/permissoes";
import {
  filtroGlobalDaUrl,
  periodoFechado,
  rotuloPeriodo,
  SEM_LIMITE,
} from "@/modules/combustivel/_shared/filtro-global";
import { consumoMensal, type PontoMensal, type TrechoLinha } from "@/modules/combustivel/consumo/calculo";
import { historicoDoVeiculo, montarRelatorioConsumo } from "@/modules/combustivel/consumo/servico";

const RECURSO = "combustivel.relatorios" as const;

/** "eq:<uuid>" ou "pl:<uuid>:<PLACA>". */
const chaveVeiculoSchema = z
  .string()
  .regex(/^(eq:[0-9a-f-]{36}|pl:[0-9a-f-]{36}:[A-Z0-9]{1,20})$/i, { error: "Veículo inválido" });

export type ResultadoHistorico =
  | { ok: true; trechos: TrechoLinha[]; mensal: PontoMensal[] }
  | { erro: string };

/** Cada abastecimento do veículo com a leitura e o consumo do trecho, e a evolução por mês. */
export async function carregarHistoricoVeiculo(chave: string): Promise<ResultadoHistorico> {
  try {
    await exigirPermissao(RECURSO, "ver");
  } catch {
    return { erro: "Sem permissão para ver o consumo" };
  }
  const valida = chaveVeiculoSchema.safeParse(chave);
  if (!valida.success) return { erro: "Veículo inválido" };
  try {
    const trechos = await historicoDoVeiculo(valida.data);
    return { ok: true, trechos: [...trechos].reverse(), mensal: consumoMensal(trechos) };
  } catch (erro) {
    return erroAcao("combustivel.consumo.historico", erro, "Não foi possível carregar o histórico do veículo");
  }
}

export type ResultadoPlanilhaConsumo = { ok: true; base64: string; nomeArquivo: string } | { erro: string };

/**
 * O Consumo do recorte em Excel: veículos, médias por tipo e o detalhe de cada trecho.
 * Recebe a query string da tela (o filtro global). Exportar é ler: `combustivel.relatorios/ver`.
 * Roda na função da página de Consumo, que declara `maxDuration`.
 */
export async function gerarPlanilhaConsumo(consulta: string): Promise<ResultadoPlanilhaConsumo> {
  try {
    await exigirPermissao(RECURSO, "ver");
  } catch {
    return { erro: "Sem permissão para exportar o consumo" };
  }
  if (typeof consulta !== "string" || consulta.length > 4000) return { erro: "Filtro inválido" };
  try {
    const filtro = filtroGlobalDaUrl(new URLSearchParams(consulta));
    const periodo = filtro.periodo ?? SEM_LIMITE;
    const relatorio = await montarRelatorioConsumo(filtro, periodo);
    const { planilhaConsumo } = await import("@/modules/combustivel/consumo/planilha");
    const fechado = periodoFechado(filtro.periodo);
    const workbook = await planilhaConsumo(relatorio, fechado ? rotuloPeriodo(periodo) : "Todo o período");
    const conteudo = await workbook.xlsx.writeBuffer();
    return {
      ok: true,
      base64: Buffer.from(conteudo).toString("base64"),
      nomeArquivo: fechado ? `Consumo de combustivel ${periodo.de} a ${periodo.ate}.xlsx` : "Consumo de combustivel.xlsx",
    };
  } catch (erro) {
    // O texto real sobe: a Vercel do erp-emt é plano hobby e não tem log de aplicação.
    return { erro: `Não foi possível gerar a planilha: ${textoDoErro(erro)}` };
  }
}
