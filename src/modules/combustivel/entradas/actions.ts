"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao, logErroServidor, semLancar } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { traduzirErroCombustivel } from "@/modules/combustivel/entradas/erros";
import { entradaSchema, type EntradaInput } from "@/modules/combustivel/entradas/schemas";

/**
 * Mutações da aba Entradas (`combustivel.entradas`).
 *
 * Permissão tripla: a RPC checa `tem_permissao` no banco (e a tabela nem tem
 * grant de escrita), aqui `exigirPermissao`, e a tela esconde o botão. Nenhuma
 * action lança: tudo volta `{ erro }`. As travas do banco (capacidade, mistura,
 * tanque externo, data no futuro, ciclo fechado, saldo) chegam à tela com o
 * texto delas.
 */

const RECURSO = "combustivel.entradas" as const;
const ROTAS = ["/combustivel/entradas", "/combustivel", "/combustivel/tanques"];

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

/**
 * Restaurar é a Lixeira da origem (`restaurar_lixeira_combustivel`). No ERP pede as duas
 * permissões que a `fn_comb_restaurar` confere: editar a lixeira E excluir na aba.
 */
async function podeRestaurar(): Promise<boolean> {
  try {
    await exigirPermissao("administracao.lixeira", "editar");
    await exigirPermissao(RECURSO, "excluir");
    return true;
  } catch {
    return false;
  }
}

/** Depois do commit nada vira falha: revalidar que lança só vai para o log. */
function revalidar(): void {
  for (const rota of ROTAS) {
    try {
      revalidatePath(rota);
    } catch (erro) {
      logErroServidor("combustivel.entradas.revalidar", erro);
    }
  }
}

/** Cria (id nulo) ou edita uma entrada pela `fn_comb_salvar_entrada`. */
export async function salvarEntrada(id: string | null, dados: EntradaInput): Promise<ResultadoAcao> {
  return semLancar("combustivel.entradas.salvar", async () => {
    const criando = id === null;
    if (!(await temAcao(criando ? "criar" : "editar"))) {
      return { erro: criando ? "Sem permissão para lançar entrada" : "Sem permissão para editar entrada" };
    }
    if (!criando && !idSchema.safeParse(id).success) return { erro: "Entrada inválida" };

    const validado = entradaSchema.safeParse(dados);
    if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
    const d = validado.data;

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_comb_salvar_entrada", {
      // Os tipos gerados não aceitam null nos argumentos; a RPC aceita.
      p_id: id as unknown as string,
      p_tanque: d.tanqueId,
      p_insumo: d.insumoId,
      p_quantidade: d.quantidade,
      p_valor_unitario: d.valorUnitario,
      p_fornecedor: d.fornecedorId,
      p_nota_fiscal: d.notaFiscal as unknown as string,
      p_data_hora: d.dataHora,
      p_observacoes: d.observacoes as unknown as string,
    });

    if (error) {
      return erroAcao(
        "combustivel.entradas.salvar",
        error,
        traduzirErroCombustivel(error, "Não foi possível salvar a entrada. Tente novamente"),
      );
    }

    revalidar();
    return { ok: true };
  });
}

/** Exclui (lixeira, com motivo). Os gatilhos refazem nível e PEPS do tanque. */
export async function excluirEntrada(id: string, motivo: string): Promise<ResultadoAcao> {
  return semLancar("combustivel.entradas.excluir", async () => {
    if (!(await temAcao("excluir"))) return { erro: "Sem permissão para excluir entrada" };
    if (!idSchema.safeParse(id).success) return { erro: "Entrada inválida" };
    const motivoValido = motivoSchema.safeParse(motivo);
    if (!motivoValido.success) return { erro: "Informe o motivo da exclusão" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_comb_excluir", {
      p_tabela: "combustivel_entradas",
      p_id: id,
      p_motivo: motivoValido.data,
    });

    if (error) {
      return erroAcao(
        "combustivel.entradas.excluir",
        error,
        traduzirErroCombustivel(error, "Não foi possível excluir a entrada. Tente novamente"),
      );
    }

    revalidar();
    return { ok: true };
  });
}

/**
 * Tira a entrada da lixeira (`fn_comb_restaurar`). Os gatilhos refazem nível e PEPS do
 * tanque; se a volta deixar o saldo negativo em algum momento, o banco recusa.
 */
export async function restaurarEntrada(id: string): Promise<ResultadoAcao> {
  return semLancar("combustivel.entradas.restaurar", async () => {
    if (!(await podeRestaurar())) return { erro: "Sem permissão para restaurar entrada" };
    if (!idSchema.safeParse(id).success) return { erro: "Entrada inválida" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_comb_restaurar", { p_tabela: "combustivel_entradas", p_id: id });
    if (error) {
      return erroAcao(
        "combustivel.entradas.restaurar",
        error,
        traduzirErroCombustivel(error, "Não foi possível restaurar a entrada. Tente novamente"),
      );
    }

    revalidar();
    return { ok: true };
  });
}
