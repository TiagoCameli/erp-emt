"use server";

import { revalidatePath } from "next/cache";

import { erroAcao, semLancar } from "@/lib/erros";
import { mensagemDeNegocio } from "@/lib/erros-banco";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { abrirMedicaoSchema, type AbrirMedicaoInput } from "@/modules/medicao/medicoes/schemas";
import type { SugestaoMedicao } from "@/modules/medicao/medicoes/tipos";

/**
 * Abrir medição (`medicao.medicoes`, só "criar": fechar, revisar e aprovar ficam na Fase 5, decisão
 * do Tiago de 28/09/2026). As duas RPCs (`fn_mc_medicao_sugestao` e `fn_mc_medicao_abrir`) conferem
 * de novo a permissão E o acesso ao contrato (D3); a checagem aqui só evita a ida ao banco sem
 * permissão, e a mensagem de recusa (P0001, pt-BR) volta como está (spec: "erro do banco vira
 * mensagem").
 */

const RECURSO = "medicao.medicoes" as const;
const ROTA = "/medicao/medicoes";

async function pode(): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, "criar");
    return true;
  } catch {
    return false;
  }
}

function revalidar() {
  try {
    revalidatePath(ROTA);
  } catch {
    // O sucesso já aconteceu.
  }
}

const textoOuNulo = (v: unknown) => v === null || typeof v === "string";

/** Valida o retorno da RPC. `periodo_manual` ausente (banco antes da migration) vira false. */
function lerSugestao(valor: unknown): SugestaoMedicao | null {
  if (typeof valor !== "object" || valor === null) return null;
  const s = valor as Record<string, unknown>;
  if (typeof s.numero !== "number" || !textoOuNulo(s.periodo_inicio) || !textoOuNulo(s.periodo_fim)) return null;
  if (s.periodo_manual !== undefined && typeof s.periodo_manual !== "boolean") return null;
  return { ...(s as unknown as SugestaoMedicao), periodo_manual: s.periodo_manual === true };
}

export type ResultadoSugestao = { ok: true; sugestao: SugestaoMedicao } | { erro: string };

/** Período sugerido da próxima medição do contrato (spec 5.4): o que o drawer pré-preenche. */
export async function sugestaoMedicao(contratoId: string): Promise<ResultadoSugestao> {
  return semLancar("medicao.medicoes.sugestao", async () => {
    if (!(await pode())) return { erro: "Sem permissão para abrir medição" };
    if (!idSchema.safeParse(contratoId).success) return { erro: "Contrato inválido" };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_mc_medicao_sugestao", { p_contrato: contratoId });
    if (error) {
      return erroAcao(
        "medicao.medicoes.sugestao",
        error,
        mensagemDeNegocio(error, "Não foi possível sugerir o período da medição. Tente novamente"),
      );
    }
    const sugestao = lerSugestao(data);
    if (!sugestao) {
      return erroAcao("medicao.medicoes.sugestao", data, "O banco devolveu a sugestão num formato inesperado.");
    }
    return { ok: true, sugestao };
  });
}

export type ResultadoAbrir = { ok: true; id: string } | { erro: string };

/** Abre a próxima medição do contrato com o período escolhido (editado ou não a partir da sugestão). */
export async function abrirMedicao(dados: AbrirMedicaoInput): Promise<ResultadoAbrir> {
  return semLancar("medicao.medicoes.abrir", async () => {
    if (!(await pode())) return { erro: "Sem permissão para abrir medição" };
    const validado = abrirMedicaoSchema.safeParse(dados);
    if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_mc_medicao_abrir", {
      p_contrato: validado.data.contratoId,
      p_inicio: validado.data.inicio,
      p_fim: validado.data.fim,
    });
    if (error) {
      return erroAcao("medicao.medicoes.abrir", error, mensagemDeNegocio(error, "Não foi possível abrir a medição. Tente novamente"));
    }
    revalidar();
    return { ok: true, id: typeof data === "string" ? data : "" };
  });
}
