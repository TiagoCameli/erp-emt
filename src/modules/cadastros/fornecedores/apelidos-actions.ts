"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

const ROTA = "/cadastros/fornecedores/apelidos";

type Resultado = { ok: true } | { erro: string };

function mensagem(e: { message?: string } | null, padrao: string): string {
  return e?.message || padrao;
}

const salvarSchema = z.object({
  fornecedorId: idSchema,
  apelido: z.string().trim().min(3, "O apelido precisa ter pelo menos 3 letras").max(200),
});

/** Cadastra um apelido bancário à mão (o banco normaliza o texto). */
export async function adicionarApelido(entrada: z.input<typeof salvarSchema>): Promise<Resultado> {
  try {
    await exigirPermissao("cadastros.fornecedores", "editar");
  } catch {
    return { erro: "Sem permissão para editar fornecedores" };
  }
  const dados = salvarSchema.safeParse(entrada);
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? "Dados inválidos" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_fornecedor_apelido_salvar", {
    p_fornecedor_id: dados.data.fornecedorId,
    p_colaborador_id: null as unknown as string,
    p_apelido: dados.data.apelido,
  });
  if (error) {
    return erroAcao(
      "cadastros.fornecedores.apelido.salvar",
      error,
      mensagem(error, "Não foi possível salvar o apelido"),
    );
  }
  revalidatePath(ROTA);
  return { ok: true };
}

/** Remove um apelido: a conciliação volta a pedir conferência desse nome. */
export async function removerApelido(id: string): Promise<Resultado> {
  try {
    await exigirPermissao("cadastros.fornecedores", "editar");
  } catch {
    return { erro: "Sem permissão para editar fornecedores" };
  }
  if (!idSchema.safeParse(id).success) return { erro: "Apelido inválido" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_fornecedor_apelido_remover", { p_id: id });
  if (error) {
    return erroAcao(
      "cadastros.fornecedores.apelido.remover",
      error,
      mensagem(error, "Não foi possível remover o apelido"),
    );
  }
  revalidatePath(ROTA);
  return { ok: true };
}
