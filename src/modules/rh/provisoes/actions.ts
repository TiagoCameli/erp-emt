"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao } from "@/lib/erros";
import { mensagemDeNegocio } from "@/lib/erros-banco";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { traduzErroExclusao } from "@/modules/cadastros/_shared/exclusao";
import {
  provisaoSchema,
  type ProvisaoInput,
} from "@/modules/rh/provisoes/schemas";

const RECURSO = "rh.encargos" as const;
const ROTA = "/rh/encargos";
const TABELA = "folha_provisoes" as const;

export type ResultadoAcao = { ok: true } | { erro: string };

const motivoSchema = z.string().trim().min(1);

/**
 * Cria ou edita uma provisão da folha (nome + percentual). A presença de `id`
 * decide a operação.
 *
 * O teto de 100% na SOMA dos percentuais ativos vive no trigger
 * `trg_trava_soma_provisoes` (não dá para validar no Zod: depende das outras
 * linhas da tabela), e chega aqui como `P0001`. `mensagemDeNegocio` é o que
 * entrega essa mensagem ao campo em vez do genérico "Tente novamente" — a
 * trava dispararia e o usuário não descobriria por quê.
 */
export async function salvarProvisao(
  dados: ProvisaoInput,
  id?: string,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, id ? "editar" : "criar");
  } catch {
    return { erro: `Sem permissão para ${id ? "editar" : "criar"} provisões` };
  }

  const validado = provisaoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const linha = {
    nome: validado.data.nome,
    percentual: validado.data.percentual,
    ativo: validado.data.ativo,
  };

  const supabase = await createClient();

  if (id) {
    const idValido = idSchema.safeParse(id);
    if (!idValido.success) return { erro: "Provisão inválida" };

    const { error } = await supabase
      .from(TABELA)
      .update(linha)
      .eq("id", idValido.data);

    if (error) {
      if (error.code === "23505") {
        return { erro: "Já existe uma provisão com este nome" };
      }
      return erroAcao(
        "rh.provisoes.editar",
        error,
        mensagemDeNegocio(
          error,
          "Não foi possível salvar a provisão. Tente novamente",
        ),
      );
    }
  } else {
    const { error } = await supabase.from(TABELA).insert(linha);

    if (error) {
      if (error.code === "23505") {
        return { erro: "Já existe uma provisão com este nome" };
      }
      return erroAcao(
        "rh.provisoes.criar",
        error,
        mensagemDeNegocio(
          error,
          "Não foi possível salvar a provisão. Tente novamente",
        ),
      );
    }
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Exclusão física: move a provisão para a lixeira via RPC, com motivo. */
export async function removerProvisao(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "excluir");
  } catch {
    return { erro: "Sem permissão para excluir provisões" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Provisão inválida" };

  const motivoValido = motivoSchema.safeParse(motivo);
  if (!motivoValido.success) return { erro: "Informe o motivo da exclusão" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_excluir_cadastro", {
    p_tabela: TABELA,
    p_id: idValido.data,
    p_motivo: motivoValido.data,
  });

  if (error) {
    const traduzido = traduzErroExclusao(error);
    if (traduzido) return erroAcao("rh.provisoes.excluir", error, traduzido);
    return erroAcao(
      "rh.provisoes.excluir",
      error,
      "Não foi possível excluir a provisão. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}
