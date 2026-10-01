"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao, textoDoErro } from "@/lib/erros";
import { dataHojeISO } from "@/lib/formatadores";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { montarPainel } from "@/modules/frete/carretas-emt/calculo";
import { carregarCarretasEmt } from "@/modules/frete/carretas-emt/queries";
import { TIPOS_FRETE } from "@/modules/frete/fretes/schemas";

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
  tipo: z.enum(["", ...TIPOS_FRETE]).default(""),
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
    const sufixo = [validado.data.placa.toLowerCase(), validado.data.tipo].filter(Boolean).map((p) => `-${p}`).join("");
    return {
      ok: true,
      base64: Buffer.from(conteudo).toString("base64"),
      nomeArquivo: `carretas-emt${sufixo}-${hoje}.xlsx`,
    };
  } catch (erro) {
    return erroAcao("frete.carretasEmt.planilha", erro, `Não foi possível gerar a planilha: ${textoDoErro(erro)}`);
  }
}

const conferirSchema = z.strictObject({
  regra: z.enum(["R1", "R2"]),
  freteIds: z.array(z.uuid({ error: "Frete inválido" })).min(1, { error: "Nenhum frete no alerta" }).max(500),
  conferida: z.boolean(),
});

/**
 * Marca (ou desmarca) como conferidos os fretes de um alerta de rota. Conferir esconde o alerta só
 * desses fretes: frete novo fora do padrão volta a aparecer. Pede frete.carretas-emt/editar, aqui e
 * na RPC; a conferência fica auditada em frete_anomalias_conferidas.
 */
export async function conferirAlertasCarretas(dados: unknown): Promise<{ ok: true; total: number } | { erro: string }> {
  try {
    await exigirPermissao("frete.carretas-emt", "editar");
  } catch {
    return { erro: "Sem permissão para conferir os alertas das Carretas EMT" };
  }
  const validado = conferirSchema.safeParse(dados);
  if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Pedido inválido" };
  const { regra, freteIds, conferida } = validado.data;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_frete_carretas_conferir", {
      p_chaves: [...new Set(freteIds)].map((id) => `${regra}-${id}`),
      p_conferida: conferida,
    });
    if (error) {
      return erroAcao("frete.carretasEmt.conferir", error, error.code === "P0001" && error.message ? error.message : "Não foi possível gravar a conferência");
    }
    try {
      revalidatePath("/frete/carretas-emt");
    } catch {
      // a gravação já aconteceu
    }
    return { ok: true, total: data ?? freteIds.length };
  } catch (erro) {
    return erroAcao("frete.carretasEmt.conferir", erro, "Não foi possível gravar a conferência. Tente novamente");
  }
}
