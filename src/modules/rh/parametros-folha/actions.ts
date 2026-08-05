"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { traduzErroExclusao } from "@/modules/cadastros/_shared/exclusao";
import {
  faixaInssSchema,
  faixaIrrfSchema,
  parametrosSchema,
  type FaixaInssInput,
  type FaixaIrrfInput,
  type ParametrosInput,
} from "@/modules/rh/parametros-folha/schemas";

const RECURSO = "rh.parametros-folha" as const;
const ROTA = "/rh/parametros-folha";

export type ResultadoAcao = { ok: true } | { erro: string };

const motivoSchema = z.string().trim().min(1);

/** Cria ou edita uma faixa de INSS. A presença de `id` decide a operação. */
export async function salvarFaixaInss(
  dados: FaixaInssInput,
  id?: string,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, id ? "editar" : "criar");
  } catch {
    return {
      erro: `Sem permissão para ${id ? "editar" : "criar"} faixas de INSS`,
    };
  }

  const validado = faixaInssSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const linha = {
    limite_ate: validado.data.limiteAte,
    aliquota: validado.data.aliquota,
  };

  const supabase = await createClient();

  if (id) {
    const idValido = idSchema.safeParse(id);
    if (!idValido.success) return { erro: "Faixa inválida" };

    const { error } = await supabase
      .from("folha_inss_faixas")
      .update(linha)
      .eq("id", idValido.data);

    if (error) {
      return erroAcao(
        "rh.parametros-folha.inss.editar",
        error,
        "Não foi possível salvar a faixa de INSS. Tente novamente",
      );
    }
  } else {
    const { error } = await supabase.from("folha_inss_faixas").insert(linha);

    if (error) {
      return erroAcao(
        "rh.parametros-folha.inss.criar",
        error,
        "Não foi possível salvar a faixa de INSS. Tente novamente",
      );
    }
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Exclusão física: move a faixa de INSS para a lixeira via RPC, com motivo. */
export async function removerFaixaInss(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "excluir");
  } catch {
    return { erro: "Sem permissão para excluir faixas de INSS" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Faixa inválida" };

  const motivoValido = motivoSchema.safeParse(motivo);
  if (!motivoValido.success) return { erro: "Informe o motivo da exclusão" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_excluir_cadastro", {
    p_tabela: "folha_inss_faixas",
    p_id: idValido.data,
    p_motivo: motivoValido.data,
  });

  if (error) {
    const traduzido = traduzErroExclusao(error);
    if (traduzido) {
      return erroAcao("rh.parametros-folha.inss.excluir", error, traduzido);
    }
    return erroAcao(
      "rh.parametros-folha.inss.excluir",
      error,
      "Não foi possível excluir a faixa de INSS. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Cria ou edita uma faixa de IRRF. A presença de `id` decide a operação. */
export async function salvarFaixaIrrf(
  dados: FaixaIrrfInput,
  id?: string,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, id ? "editar" : "criar");
  } catch {
    return {
      erro: `Sem permissão para ${id ? "editar" : "criar"} faixas de IRRF`,
    };
  }

  const validado = faixaIrrfSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const linha = {
    limite_ate: validado.data.limiteAte,
    aliquota: validado.data.aliquota,
    parcela_deduzir: validado.data.parcelaDeduzir,
  };

  const supabase = await createClient();

  if (id) {
    const idValido = idSchema.safeParse(id);
    if (!idValido.success) return { erro: "Faixa inválida" };

    const { error } = await supabase
      .from("folha_irrf_faixas")
      .update(linha)
      .eq("id", idValido.data);

    if (error) {
      return erroAcao(
        "rh.parametros-folha.irrf.editar",
        error,
        "Não foi possível salvar a faixa de IRRF. Tente novamente",
      );
    }
  } else {
    const { error } = await supabase.from("folha_irrf_faixas").insert(linha);

    if (error) {
      return erroAcao(
        "rh.parametros-folha.irrf.criar",
        error,
        "Não foi possível salvar a faixa de IRRF. Tente novamente",
      );
    }
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Exclusão física: move a faixa de IRRF para a lixeira via RPC, com motivo. */
export async function removerFaixaIrrf(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "excluir");
  } catch {
    return { erro: "Sem permissão para excluir faixas de IRRF" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Faixa inválida" };

  const motivoValido = motivoSchema.safeParse(motivo);
  if (!motivoValido.success) return { erro: "Informe o motivo da exclusão" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_excluir_cadastro", {
    p_tabela: "folha_irrf_faixas",
    p_id: idValido.data,
    p_motivo: motivoValido.data,
  });

  if (error) {
    const traduzido = traduzErroExclusao(error);
    if (traduzido) {
      return erroAcao("rh.parametros-folha.irrf.excluir", error, traduzido);
    }
    return erroAcao(
      "rh.parametros-folha.irrf.excluir",
      error,
      "Não foi possível excluir a faixa de IRRF. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Salva os parâmetros escalares da folha: UPSERT da linha singleton (id=1).
 * Não existe "criar" separado de "editar" nesta config — sempre gated por
 * `editar`, tanto na primeira gravação quanto nas seguintes.
 */
export async function salvarParametros(
  dados: ParametrosInput,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para editar os parâmetros da folha" };
  }

  const validado = parametrosSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("folha_parametros").upsert({
    id: 1,
    irrf_deducao_por_dependente: validado.data.irrfDeducaoPorDependente,
    irrf_desconto_simplificado: validado.data.irrfDescontoSimplificado,
    fgts_percentual: validado.data.fgtsPercentual,
  });

  if (error) {
    return erroAcao(
      "rh.parametros-folha.parametros.editar",
      error,
      "Não foi possível salvar os parâmetros da folha. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}
