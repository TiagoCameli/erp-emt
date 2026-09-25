"use server";

import { revalidatePath } from "next/cache";

import { erroAcao } from "@/lib/erros";
import { dataHojeISO } from "@/lib/formatadores";
import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { montarPainel } from "@/modules/financeiro/aplicacoes/calculo";
import { montarPlanilhaAplicacoes } from "@/modules/financeiro/aplicacoes/planilha";
import { carregarAplicacoes } from "@/modules/financeiro/aplicacoes/queries";
import {
  paraCentavo,
  posicaoSchema,
  type PosicaoInput,
} from "@/modules/financeiro/aplicacoes/schemas";

const RECURSO = "financeiro.aplicacoes" as const;

/**
 * Gravar posição gera (ou refaz) o lançamento de rendimento na subconta, então
 * mexe no saldo e no DRE: as telas que mostram os dois são revalidadas juntas.
 */
const ROTAS = [
  "/financeiro/aplicacoes",
  "/financeiro/contas-bancarias",
  "/financeiro/relatorios",
  "/financeiro/lancamentos",
  "/financeiro/recebimentos",
  "/gestao",
];

function revalidar() {
  for (const rota of ROTAS) revalidatePath(rota);
}

export type ResultadoAcao = { ok: true; id?: string } | { erro: string };

async function pode(acao: "ver" | "editar"): Promise<boolean> {
  const usuario = await getUsuarioLogado();
  return temPermissao(usuario, RECURSO, acao);
}

/**
 * Grava a posição do extrato (cria, ou regrava a do mesmo dia). O rendimento
 * sai da `fn_salvar_posicao_aplicacao`, que é quem barra de verdade: permissão
 * de editar, saldo visível, data não futura e nada antes da abertura.
 */
export async function salvarPosicao(dados: PosicaoInput): Promise<ResultadoAcao> {
  if (!(await pode("editar"))) {
    return { erro: "Sem permissão para gravar posição de aplicação" };
  }
  const validado = posicaoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }
  const v = validado.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_salvar_posicao_aplicacao", {
    p_aplicacao_id: v.aplicacaoId,
    p_data: v.data,
    p_saldo_liquido: paraCentavo(v.saldoLiquido),
    p_saldo_bruto: v.saldoBruto === undefined ? undefined : paraCentavo(v.saldoBruto),
    p_ir: v.ir === undefined ? undefined : paraCentavo(v.ir),
    p_iof: v.iof === undefined ? undefined : paraCentavo(v.iof),
    p_observacoes: v.observacoes || undefined,
  });
  if (error) {
    return erroAcao(
      "financeiro.aplicacoes.salvarPosicao",
      error,
      error.message || "Não foi possível gravar a posição",
    );
  }
  revalidar();
  return { ok: true, id: data };
}

/** Exclui a posição (lixeira com motivo) e estorna o rendimento dela. */
export async function excluirPosicao(id: string, motivo: string): Promise<ResultadoAcao> {
  if (!(await pode("editar"))) {
    return { erro: "Sem permissão para excluir posição de aplicação" };
  }
  if (!idSchema.safeParse(id).success) return { erro: "Posição inválida" };
  if (motivo.trim() === "") return { erro: "Informe o motivo da exclusão" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_excluir_posicao_aplicacao", {
    p_id: id,
    p_motivo: motivo.trim(),
  });
  if (error) {
    return erroAcao(
      "financeiro.aplicacoes.excluirPosicao",
      error,
      error.message || "Não foi possível excluir a posição",
    );
  }
  revalidar();
  return { ok: true };
}

export interface Simulacao {
  dataAnterior: string | null;
  saldoAnterior: number | null;
  aplicado: number;
  resgatado: number;
  rendimento: number;
  eAbertura: boolean;
}

/**
 * O rendimento que a posição vai gerar, ANTES de salvar, pela mesma conta do
 * banco. Uma cópia da regra em TypeScript divergiria no primeiro detalhe (a
 * tarifa do resgate, a transferência do mesmo dia).
 */
export async function simularPosicao(
  aplicacaoId: string,
  data: string,
  saldoLiquido: number,
): Promise<Simulacao | { erro: string }> {
  if (!(await pode("ver"))) return { erro: "Sem permissão" };
  if (!idSchema.safeParse(aplicacaoId).success) return { erro: "Aplicação inválida" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !Number.isFinite(saldoLiquido)) {
    return { erro: "Dados incompletos" };
  }
  const supabase = await createClient();
  const { data: linhas, error } = await supabase.rpc("fn_simular_posicao_aplicacao", {
    p_aplicacao_id: aplicacaoId,
    p_data: data,
    p_saldo_liquido: paraCentavo(saldoLiquido),
  });
  if (error) return { erro: error.message };
  const l = linhas?.[0];
  if (!l) return { erro: "Sem permissão para ver o saldo desta aplicação" };
  return {
    dataAnterior: l.data_anterior,
    saldoAnterior: l.saldo_anterior === null ? null : Number(l.saldo_anterior),
    aplicado: Number(l.aplicado),
    resgatado: Number(l.resgatado),
    rendimento: Number(l.rendimento),
    eAbertura: l.e_abertura,
  };
}

export type ResultadoPlanilha =
  | { ok: true; base64: string; nomeArquivo: string }
  | { erro: string };

/** Exportar Excel: as mesmas linhas da tela, montadas pelo mesmo cálculo. */
export async function exportarAplicacoes(): Promise<ResultadoPlanilha> {
  if (!(await pode("ver"))) return { erro: "Sem permissão para exportar" };
  try {
    const dados = await carregarAplicacoes();
    const hoje = dataHojeISO();
    const painel = montarPainel(dados.aplicacoes, dados.linhas, dados.movimentos, hoje);
    const workbook = montarPlanilhaAplicacoes(painel, dados, hoje);
    const conteudo = await workbook.xlsx.writeBuffer();
    return {
      ok: true,
      base64: Buffer.from(conteudo).toString("base64"),
      nomeArquivo: `aplicacoes-${hoje}.xlsx`,
    };
  } catch (erro) {
    return erroAcao(
      "financeiro.aplicacoes.exportarAplicacoes",
      erro,
      "Não foi possível gerar a planilha. Tente novamente",
    );
  }
}
