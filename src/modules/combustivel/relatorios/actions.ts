"use server";

import { z } from "zod";

import { erroAcao, textoDoErro } from "@/lib/erros";
import { exigirPermissao } from "@/lib/permissoes";
import { TIPOS_RELATORIO } from "@/modules/combustivel/relatorios/consolidar";
import { diaValido } from "@/modules/combustivel/relatorios/periodo";
import {
  contarSaidasDoPeriodo,
  lerSaidasDoPeriodo,
  LIMITE_SAIDAS_RELATORIO,
} from "@/modules/combustivel/relatorios/queries";

export type ResultadoPlanilhaCombustivel = { ok: true; base64: string; nomeArquivo: string } | { erro: string };

const dia = z.string().refine((valor) => diaValido(valor) !== null, { error: "Período inválido" });

const pedidoSchema = z.strictObject({
  tipo: z.enum(TIPOS_RELATORIO, { error: "Relatório inválido" }),
  de: dia,
  ate: dia,
});

/**
 * Gera um dos relatórios do Combustível em Excel. Exportar é ler: a permissão é
 * `combustivel.relatorios/ver`, a mesma que abre a tela.
 *
 * Roda na função da PÁGINA de relatórios, que declara `maxDuration` (ver
 * src/app/max-duration-de-quem-exporta.test.ts). O módulo da planilha entra por
 * `await import`: ele puxa o exceljs, que é grande.
 */
export async function gerarPlanilhaCombustivel(pedido: unknown): Promise<ResultadoPlanilhaCombustivel> {
  try {
    await exigirPermissao("combustivel.relatorios", "ver");
  } catch {
    return { erro: "Sem permissão para exportar relatórios do combustível" };
  }

  const validado = pedidoSchema.safeParse(pedido);
  if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Pedido inválido" };
  const { tipo } = validado.data;
  let { de, ate } = validado.data;
  if (de > ate) [de, ate] = [ate, de];
  const periodo = { de, ate };

  try {
    const total = await contarSaidasDoPeriodo(periodo);
    if (total === 0) return { erro: "O período não tem nenhum abastecimento para exportar" };
    if (total > LIMITE_SAIDAS_RELATORIO) {
      return {
        erro: `O período tem ${total.toLocaleString("pt-BR")} abastecimentos, acima do limite de ${LIMITE_SAIDAS_RELATORIO.toLocaleString("pt-BR")} por arquivo. Escolha um período menor`,
      };
    }

    const saidas = await lerSaidasDoPeriodo(periodo);
    // Leu menos do que o banco contou: alguém mexeu no meio da leitura. Melhor pedir de novo
    // do que entregar planilha incompleta com cara de completa.
    if (saidas.length < total) {
      return erroAcao(
        "combustivel.relatorios.gerarPlanilha",
        new Error(`leitura incompleta: ${saidas.length} de ${total}`),
        `Li ${saidas.length.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} abastecimentos porque a lista mudou durante a exportação. Exporte de novo`,
      );
    }

    const { montarRelatorio, nomeArquivoRelatorio } = await import("@/modules/combustivel/relatorios/planilhas");
    const workbook = montarRelatorio(tipo, saidas, periodo);
    workbook.created = new Date();
    const conteudo = await workbook.xlsx.writeBuffer();
    return { ok: true, base64: Buffer.from(conteudo).toString("base64"), nomeArquivo: nomeArquivoRelatorio(tipo, periodo) };
  } catch (erro) {
    // O texto real sobe: a Vercel do erp-emt é plano hobby e não tem log de aplicação.
    return erroAcao(
      "combustivel.relatorios.gerarPlanilha",
      erro,
      `Não foi possível gerar a planilha: ${textoDoErro(erro)}`,
    );
  }
}
