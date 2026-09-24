"use server";

import { z } from "zod";

import { erroAcao, textoDoErro } from "@/lib/erros";
import { dataHojeISO } from "@/lib/formatadores";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import {
  nomeArquivoExtrato,
  type MovimentoExtrato,
  type SaldoTransportadora,
} from "@/modules/frete/conta-corrente/extrato";
import { buscarSaldo, listarMovimentos } from "@/modules/frete/conta-corrente/queries";

/**
 * Exportações do extrato da transportadora (Excel com as 7 abas da origem e
 * PDF). Exportar é ler: pede `frete.conta-corrente/ver`, a mesma que abre a
 * tela. Os movimentos são relidos aqui, no servidor, e não vêm da tela.
 *
 * Rodam na função da PÁGINA do extrato, que declara `maxDuration` (ver
 * src/app/max-duration-de-quem-exporta.test.ts). exceljs e pdfmake entram por
 * `await import`: import de topo do pdfmake derruba o módulo inteiro de actions
 * se o pdfkit não achar as fontes (aconteceu na folha).
 */

export type ResultadoArquivo = { ok: true; base64: string; nomeArquivo: string } | { erro: string };

const pedidoSchema = z.strictObject({
  transportadoraId: idSchema,
  meses: z.array(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/, { error: "Mês inválido" })).max(120),
});

type Carregado =
  | { erro: string }
  | { saldo: SaldoTransportadora; movimentos: MovimentoExtrato[]; meses: string[] };

async function carregar(pedido: unknown): Promise<Carregado> {
  const validado = pedidoSchema.safeParse(pedido);
  if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Pedido inválido" };
  const saldo = await buscarSaldo(validado.data.transportadoraId);
  if (!saldo) return { erro: "Transportadora não encontrada" };
  const movimentos = await listarMovimentos(validado.data.transportadoraId);
  if (movimentos.length === 0) return { erro: "Sem movimentos para exportar" };
  return { saldo, movimentos, meses: validado.data.meses };
}

async function podeVer(): Promise<boolean> {
  try {
    await exigirPermissao("frete.conta-corrente", "ver");
    return true;
  } catch {
    return false;
  }
}

export async function gerarPlanilhaExtratoFrete(pedido: unknown): Promise<ResultadoArquivo> {
  if (!(await podeVer())) return { erro: "Sem permissão para exportar o extrato" };
  try {
    const dados = await carregar(pedido);
    if ("erro" in dados) return { erro: dados.erro };
    const { montarExtratoWorkbook } = await import("@/modules/frete/conta-corrente/planilha");
    const workbook = montarExtratoWorkbook(dados.saldo.nome, dados.movimentos, dados.meses, new Date());
    const conteudo = await workbook.xlsx.writeBuffer();
    return {
      ok: true,
      base64: Buffer.from(conteudo).toString("base64"),
      nomeArquivo: nomeArquivoExtrato(dados.saldo.nome, dataHojeISO(), "xlsx"),
    };
  } catch (erro) {
    return erroAcao("frete.contaCorrente.planilha", erro, `Não foi possível gerar a planilha: ${textoDoErro(erro)}`);
  }
}

export async function gerarPdfExtratoFrete(pedido: unknown): Promise<ResultadoArquivo> {
  if (!(await podeVer())) return { erro: "Sem permissão para exportar o extrato" };
  try {
    const dados = await carregar(pedido);
    if ("erro" in dados) return { erro: dados.erro };
    const { documentoDoExtrato } = await import("@/modules/frete/conta-corrente/pdf");
    const { gerarPdf } = await import("@/lib/pdf");
    const bytes = await gerarPdf(documentoDoExtrato(dados.saldo.nome, dados.movimentos, dados.meses, new Date()));
    return {
      ok: true,
      base64: bytes.toString("base64"),
      nomeArquivo: nomeArquivoExtrato(dados.saldo.nome, dataHojeISO(), "pdf"),
    };
  } catch (erro) {
    return erroAcao("frete.contaCorrente.pdf", erro, `Não foi possível gerar o PDF: ${textoDoErro(erro)}`);
  }
}
