"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao, logErroServidor, semLancar } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { traduzirErroEstoque } from "@/modules/estoque/erros";
import { transferenciaSchema, type TransferenciaInput } from "@/modules/estoque/transferencias/schemas";

/**
 * Transferências manuais (`estoque.transferencias`). A RPC grava a transferência e o banco
 * gera a saída na origem e a entrada no destino; saldo insuficiente e local inativo voltam
 * com a frase do banco. Nenhuma action lança.
 */

const RECURSO = "estoque.transferencias" as const;
const ROTAS = ["/estoque/transferencias", "/estoque/entradas", "/estoque/saidas", "/estoque/posicao", "/estoque/pilhas"];

export type ResultadoAcao = { ok: true } | { erro: string };

const motivoSchema = z.string().trim().min(1);

async function temAcao(acao: "criar" | "editar" | "excluir"): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

function revalidar(): void {
  for (const rota of ROTAS) {
    try {
      revalidatePath(rota);
    } catch (erro) {
      logErroServidor("estoque.transferencias.revalidar", erro);
    }
  }
}

/** Cria (id nulo) ou edita uma transferência manual. */
export async function salvarTransferencia(id: string | null, dados: TransferenciaInput): Promise<ResultadoAcao> {
  return semLancar("estoque.transferencias.salvar", async () => {
    const criando = id === null;
    if (!(await temAcao(criando ? "criar" : "editar"))) {
      return { erro: criando ? "Sem permissão para registrar transferência" : "Sem permissão para editar transferência" };
    }
    if (!criando && !idSchema.safeParse(id).success) return { erro: "Transferência inválida" };

    const validado = transferenciaSchema.safeParse(dados);
    if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
    const d = validado.data;

    const supabase = await createClient();
    // Os tipos gerados não aceitam null; a RPC aceita (p_id nulo = criar; um local de cada lado).
    const nulo = (valor: string | null) => valor as unknown as string;
    const { error } = await supabase.rpc("fn_estoque_salvar_transferencia", {
      p_id: nulo(id),
      p_origem_deposito: nulo(d.origem.depositoId),
      p_origem_tanque: nulo(d.origem.tanqueId),
      p_origem_pilha: nulo(d.origem.pilhaId),
      p_destino_deposito: nulo(d.destino.depositoId),
      p_destino_tanque: nulo(d.destino.tanqueId),
      p_destino_pilha: nulo(d.destino.pilhaId),
      p_insumo: d.insumoId,
      p_quantidade: d.quantidade,
      p_data_saida: d.dataSaida,
      p_data_chegada: d.dataChegada,
      p_custo_adicional: d.custoAdicional,
      p_observacoes: d.observacoes ?? undefined,
    });
    if (error) {
      return erroAcao(
        "estoque.transferencias.salvar",
        error,
        traduzirErroEstoque(error, "Não foi possível salvar a transferência. Tente novamente"),
      );
    }

    revalidar();
    return { ok: true };
  });
}

export async function excluirTransferencia(id: string, motivo: string): Promise<ResultadoAcao> {
  return semLancar("estoque.transferencias.excluir", async () => {
    if (!(await temAcao("excluir"))) return { erro: "Sem permissão para excluir transferência" };
    if (!idSchema.safeParse(id).success) return { erro: "Transferência inválida" };
    const motivoValido = motivoSchema.safeParse(motivo);
    if (!motivoValido.success) return { erro: "Informe o motivo da exclusão" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_estoque_excluir_transferencia", { p_id: id, p_motivo: motivoValido.data });
    if (error) {
      return erroAcao(
        "estoque.transferencias.excluir",
        error,
        traduzirErroEstoque(error, "Não foi possível excluir a transferência. Tente novamente"),
      );
    }
    revalidar();
    return { ok: true };
  });
}

export async function restaurarTransferencia(id: string): Promise<ResultadoAcao> {
  return semLancar("estoque.transferencias.restaurar", async () => {
    if (!(await temAcao("excluir"))) return { erro: "Sem permissão para restaurar transferência" };
    if (!idSchema.safeParse(id).success) return { erro: "Transferência inválida" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_estoque_restaurar_transferencia", { p_id: id });
    if (error) {
      return erroAcao(
        "estoque.transferencias.restaurar",
        error,
        traduzirErroEstoque(error, "Não foi possível restaurar a transferência. Tente novamente"),
      );
    }
    revalidar();
    return { ok: true };
  });
}
