"use server";

import { z } from "zod";

import { erroAcao, textoDoErro } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { detectarNaBase, noPeriodo, rotuloOrigemEquipamento } from "@/modules/combustivel/anomalias/base";
import { carregarBaseCombustivel } from "@/modules/combustivel/anomalias/queries";
import { listarInsumosCombustivel } from "@/modules/combustivel/entradas/queries";
import {
  consolidarMensal,
  consolidarPorEquipamento,
  consolidarPorObra,
} from "@/modules/combustivel/relatorios/consolidar";
import { diaValido, diasDoMes, mesValido } from "@/modules/combustivel/relatorios/periodo";
import {
  cadastrosDaBase,
  lerEntradasDoPeriodo,
  lerNomesDeUsuarios,
  lerTransferenciasDoPeriodo,
  lerTransportadorasAtivas,
} from "@/modules/combustivel/relatorios/queries";

export type ResultadoPlanilhaCombustivel = { ok: true; base64: string; nomeArquivo: string } | { erro: string };

const dia = z.string().refine((valor) => diaValido(valor) !== null, { error: "Período inválido" });
const mes = z.string().refine((valor) => mesValido(valor) !== null, { error: "Mês inválido" });

/** Os parâmetros de cada modal de relatório da origem. */
const pedidoSchema = z.discriminatedUnion("tipo", [
  z.strictObject({ tipo: z.literal("mensal"), mes }),
  z.strictObject({ tipo: z.literal("obra"), obraId: idSchema, mes }),
  z.strictObject({ tipo: z.literal("equipamento"), equipamentoId: idSchema, de: dia, ate: dia }),
  z.strictObject({ tipo: z.literal("bruto"), mes }),
]);

/**
 * Gera um dos quatro relatórios da origem em Excel (Mensal Consolidado, Por Obra, Por
 * Equipamento, Raw Export). Exportar é ler: a permissão é `combustivel.relatorios/ver`,
 * a mesma que abre a tela.
 *
 * Como na origem, as anomalias de cada relatório saem da detecção com o escopo do
 * relatório como `saidasNoPeriodo` e o banco inteiro como `saidasTodas`.
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
  const dados = validado.data;

  try {
    const base = await carregarBaseCombustivel();
    const cadastros = cadastrosDaBase(base);
    const contexto = { cadastros, combustivelNome: base.combustivelNome };
    const planilhas = await import("@/modules/combustivel/relatorios/planilhas");

    let workbook;
    let nomeArquivo: string;

    if (dados.tipo === "equipamento") {
      let { de, ate } = dados;
      if (de > ate) [de, ate] = [ate, de];
      const equipamento = base.equipamentos.find((e) => e.id === dados.equipamentoId && !e.sentinela);
      if (!equipamento) return { erro: "Equipamento não encontrado" };
      const saidas = base.saidas.filter(
        (s) => s.tipoConsumidor === "equipamento_proprio" && s.equipamentoIdReal === equipamento.id && noPeriodo(s, de, ate),
      );
      if (saidas.length === 0) return { erro: "Sem saídas para este equipamento no período. Tente um intervalo maior" };
      const entradas = await lerEntradasDoPeriodo({ de, ate });
      workbook = planilhas.montarPorEquipamento(
        { rotulo: rotuloOrigemEquipamento(equipamento), tipo: equipamento.tipo, marca: equipamento.marca },
        { de, ate },
        consolidarPorEquipamento(saidas, entradas, cadastros),
        { ...contexto, anomalias: detectarNaBase(base, saidas) },
      );
      nomeArquivo = planilhas.nomeArquivoPorEquipamento(equipamento.codigo?.trim() || equipamento.descricao, de, ate);
    } else {
      const periodo = diasDoMes(dados.mes);
      const saidasNoMes = base.saidas.filter((s) => noPeriodo(s, periodo.de, periodo.ate));

      if (dados.tipo === "mensal") {
        const entradas = await lerEntradasDoPeriodo(periodo);
        if (saidasNoMes.length === 0 && entradas.length === 0) {
          return { erro: "Sem movimentação no mês selecionado. Escolha outro mês" };
        }
        workbook = planilhas.montarMensal(dados.mes, consolidarMensal(saidasNoMes, entradas, cadastros), {
          ...contexto,
          anomalias: detectarNaBase(base, saidasNoMes),
        });
        nomeArquivo = planilhas.nomeArquivoMensal(dados.mes);
      } else if (dados.tipo === "obra") {
        const obraNome = base.obraNome.get(dados.obraId);
        if (!obraNome) return { erro: "Obra não encontrada" };
        const saidasObra = saidasNoMes.filter((s) => s.obraId === dados.obraId);
        if (saidasObra.length === 0) return { erro: "Sem saídas desta obra no mês selecionado. Escolha outro mês" };
        const entradas = await lerEntradasDoPeriodo(periodo);
        workbook = planilhas.montarPorObra(obraNome, dados.mes, consolidarPorObra(saidasObra, entradas, cadastros), {
          ...contexto,
          anomalias: detectarNaBase(base, saidasObra),
        });
        nomeArquivo = planilhas.nomeArquivoPorObra(obraNome, dados.mes);
      } else {
        const [entradas, transferencias, transportadoras, combustiveis] = await Promise.all([
          lerEntradasDoPeriodo(periodo),
          lerTransferenciasDoPeriodo(periodo),
          lerTransportadorasAtivas(),
          listarInsumosCombustivel(),
        ]);
        const usuarioNome = await lerNomesDeUsuarios(
          [...saidasNoMes, ...entradas, ...transferencias]
            .map((l) => l.createdBy)
            .filter((id): id is string => id !== null),
        );
        workbook = planilhas.montarBruto(
          dados.mes,
          {
            saidas: saidasNoMes,
            entradas,
            transferencias,
            tanques: base.tanques,
            usuarioNome,
            equipamentosAtivos: base.equipamentos.filter((e) => e.ativo && !e.sentinela),
            transportadoras,
            combustiveis: combustiveis.filter((c) => c.ativo).map((c) => ({ nome: c.nome, unidade: c.unidade })),
          },
          contexto,
        );
        nomeArquivo = planilhas.nomeArquivoBruto(dados.mes);
      }
    }

    workbook.created = new Date();
    const conteudo = await workbook.xlsx.writeBuffer();
    return { ok: true, base64: Buffer.from(conteudo).toString("base64"), nomeArquivo };
  } catch (erro) {
    // O texto real sobe: a Vercel do erp-emt é plano hobby e não tem log de aplicação.
    return erroAcao("combustivel.relatorios.gerarPlanilha", erro, `Não foi possível gerar a planilha: ${textoDoErro(erro)}`);
  }
}
