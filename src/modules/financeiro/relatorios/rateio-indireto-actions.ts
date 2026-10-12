"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

type Resultado = { ok: true } | { erro: string };

const mesSchema = z.string().regex(/^\d{4}-\d{2}$/, { error: "Mês inválido" });
const motivoSchema = z.string().trim().min(3, { error: "Informe o motivo" }).max(500);

const salvarSchema = z.object({
  mes: mesSchema,
  percentuais: z.array(z.object({ centroId: idSchema, percentual: z.number().min(0).max(100) })).min(1),
  motivo: motivoSchema,
  confirmar: z.boolean(),
});

/** Quem ajusta o rateio é quem fecha o mês. O banco confere de novo. */
async function podeAjustar(): Promise<boolean> {
  const usuario = await getUsuarioLogado();
  return temPermissao(usuario, "financeiro.competencias", "aprovar");
}

export async function salvarRateioIndireto(dados: z.input<typeof salvarSchema>): Promise<Resultado> {
  if (!(await podeAjustar())) return { erro: "Sem permissão para ajustar o rateio (precisa poder fechar o mês)" };
  const v = salvarSchema.safeParse(dados);
  if (!v.success) return { erro: v.error.issues[0]?.message ?? "Dados inválidos" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_rateio_indireto_salvar", {
    p_mes: `${v.data.mes}-01`,
    // Seis casas, como a coluna do banco.
    p_percentuais: v.data.percentuais.map((p) => ({ centroId: p.centroId, percentual: Math.round(p.percentual * 1e6) / 1e6 })),
    p_motivo: v.data.motivo,
    p_confirmar: v.data.confirmar,
  });
  if (error) return erroAcao("financeiro.relatorios.salvarRateioIndireto", error, error.message || "Não foi possível salvar o rateio");
  revalidatePath("/financeiro/relatorios");
  return { ok: true };
}

export async function voltarRateioAutomatico(dados: { mes: string; motivo: string }): Promise<Resultado> {
  if (!(await podeAjustar())) return { erro: "Sem permissão para ajustar o rateio (precisa poder fechar o mês)" };
  const v = z.object({ mes: mesSchema, motivo: motivoSchema }).safeParse(dados);
  if (!v.success) return { erro: v.error.issues[0]?.message ?? "Dados inválidos" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_rateio_indireto_automatico", { p_mes: `${v.data.mes}-01`, p_motivo: v.data.motivo });
  if (error) return erroAcao("financeiro.relatorios.voltarRateioAutomatico", error, error.message || "Não foi possível voltar ao automático");
  revalidatePath("/financeiro/relatorios");
  return { ok: true };
}
