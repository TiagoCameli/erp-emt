"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

type ResultadoAcao = { erro: string } | undefined;

const salvarConfiguracaoSchema = z.discriminatedUnion("chave", [
  z.object({
    chave: z.literal("tolerancia_divergencia_nf_percentual"),
    valor: z
      .number({ error: "Informe um número" })
      .min(0, "O valor mínimo é 0%")
      .max(100, "O valor máximo é 100%"),
  }),
  z.object({
    chave: z.literal("encargos_estimados_percentual"),
    valor: z
      .number({ error: "Informe um número" })
      .min(0, "O valor mínimo é 0%")
      .max(300, "O valor máximo é 300%"),
  }),
  z.object({
    chave: z.literal("banco_horas_ativo"),
    valor: z.boolean({ error: "Valor inválido" }),
  }),
]);

const CHAVES_CONHECIDAS = new Set<string>([
  "tolerancia_divergencia_nf_percentual",
  "encargos_estimados_percentual",
  "banco_horas_ativo",
]);

/**
 * Salva o valor de uma configuração conhecida do sistema.
 * Valida o valor pela chave e grava em configuracoes (RLS cobre a escrita).
 */
export async function salvarConfiguracao(
  chave: string,
  valor: number | boolean,
): Promise<ResultadoAcao> {
  const usuario = await exigirPermissao("administracao.configuracoes", "editar");

  if (!CHAVES_CONHECIDAS.has(chave)) {
    return { erro: "Configuração desconhecida" };
  }

  const resultado = salvarConfiguracaoSchema.safeParse({ chave, valor });
  if (!resultado.success) {
    return {
      erro: resultado.error.issues[0]?.message ?? "Valor inválido",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("configuracoes")
    .update({
      valor: resultado.data.valor,
      updated_by: usuario.id,
      updated_at: new Date().toISOString(),
    })
    .eq("chave", resultado.data.chave);

  if (error) {
    return { erro: "Não foi possível salvar a configuração" };
  }

  revalidatePath("/administracao/configuracoes");
  return undefined;
}
