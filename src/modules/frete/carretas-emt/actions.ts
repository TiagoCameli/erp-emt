"use server";

import { z } from "zod";

import { erroAcao, textoDoErro } from "@/lib/erros";
import { dataHojeISO } from "@/lib/formatadores";
import { exigirPermissao } from "@/lib/permissoes";
import { montarPainel } from "@/modules/frete/carretas-emt/calculo";
import { carregarCarretasEmt } from "@/modules/frete/carretas-emt/queries";

/**
 * Exportação da aba Carretas EMT. Exportar é ler: pede frete.carretas-emt/ver, a mesma que
 * abre a tela, e os números são relidos aqui (a RPC de novo), não vêm da tela.
 *
 * Roda na função da PÁGINA, que declara `maxDuration` (src/app/max-duration-de-quem-exporta.test.ts).
 */

export type ResultadoArquivo = { ok: true; base64: string; nomeArquivo: string } | { erro: string };

const MES = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: "Mês inválido" });
const pedidoSchema = z.strictObject({
  de: MES,
  ate: MES,
  placa: z.string().max(10),
});

export async function gerarPlanilhaCarretasEmt(pedido: unknown): Promise<ResultadoArquivo> {
  try {
    await exigirPermissao("frete.carretas-emt", "ver");
  } catch {
    return { erro: "Sem permissão para exportar as Carretas EMT" };
  }
  const validado = pedidoSchema.safeParse(pedido);
  if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Pedido inválido" };
  if (validado.data.de > validado.data.ate) return { erro: "O período começa depois de terminar" };
  try {
    const { dados, erro } = await carregarCarretasEmt();
    if (!dados) return { erro: erro ?? "Não foi possível carregar as Carretas EMT" };
    const hoje = dataHojeISO();
    const painel = montarPainel(dados, validado.data, hoje.slice(0, 7));
    const { montarPlanilhaCarretas } = await import("@/modules/frete/carretas-emt/planilha");
    const conteudo = await montarPlanilhaCarretas(painel).xlsx.writeBuffer();
    const sufixo = validado.data.placa ? `-${validado.data.placa.toLowerCase()}` : "";
    return {
      ok: true,
      base64: Buffer.from(conteudo).toString("base64"),
      nomeArquivo: `carretas-emt${sufixo}-${hoje}.xlsx`,
    };
  } catch (erro) {
    return erroAcao("frete.carretasEmt.planilha", erro, `Não foi possível gerar a planilha: ${textoDoErro(erro)}`);
  }
}
