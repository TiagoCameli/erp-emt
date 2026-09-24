"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao, semLancar } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { traduzErroMovimento } from "@/modules/combustivel/transferencias/erros";
import {
  dataHoraIso,
  transferenciaSchema,
  type TransferenciaInput,
} from "@/modules/combustivel/transferencias/schemas";

/**
 * Mutações das transferências entre tanques (`combustivel.transferencias`).
 *
 * Permissão tripla: a RPC checa `tem_permissao` no banco, aqui
 * `exigirPermissao`, e a tela esconde o botão. A tabela não tem grant de
 * escrita: tudo passa por `fn_comb_salvar_transferencia` (o valor vem da tela,
 * como na origem; null mantém o salvo na edição), `fn_comb_excluir` (lixeira
 * com motivo) e `fn_comb_restaurar`. Nenhuma action lança: tudo volta `{ erro }`.
 */

const RECURSO = "combustivel.transferencias" as const;
const ROTA = "/combustivel/transferencias";
const ROTA_TANQUES = "/combustivel/tanques";

export type ResultadoAcao = { ok: true } | { erro: string };

/** O salvar devolve o id da transferência: é nele que os anexos da fila são pendurados. */
export type ResultadoSalvarTransferencia = { ok: true; id: string | null } | { erro: string };

const motivoSchema = z.string().trim().min(1);

async function temAcao(acao: "ver" | "criar" | "editar" | "excluir"): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

/** Depois do commit nada vira falha: a revalidação que estoura não desfaz o registro. */
function revalidar() {
  for (const rota of [ROTA, ROTA_TANQUES, "/combustivel"]) {
    try {
      revalidatePath(rota);
    } catch {
      // O sucesso já aconteceu.
    }
  }
}

/** Cria (id null) ou edita uma transferência. */
export async function salvarTransferencia(
  id: string | null,
  dados: TransferenciaInput,
): Promise<ResultadoSalvarTransferencia> {
  return semLancar("combustivel.transferencias.salvar", async () => {
    const editando = id !== null;
    if (!(await temAcao(editando ? "editar" : "criar"))) {
      return { erro: editando ? "Sem permissão para editar transferências" : "Sem permissão para lançar transferências" };
    }

    let idValido: string | null = null;
    if (editando) {
      const conferido = idSchema.safeParse(id);
      if (!conferido.success) return { erro: "Transferência inválida" };
      idValido = conferido.data;
    }

    const validado = transferenciaSchema.safeParse(dados);
    if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_comb_salvar_transferencia", {
      // A RPC aceita null para criar; o tipo gerado não sabe disso.
      p_id: idValido as unknown as string,
      p_origem: validado.data.origemId,
      p_destino: validado.data.destinoId,
      p_litros: validado.data.litros,
      p_data_hora: validado.data.dataHora,
      p_observacoes: validado.data.observacoes,
      // Sem valor (null), o parâmetro fica de fora: o default da RPC é null, e o
      // banco mantém o valor salvo (edição) ou calcula pelo preço médio (criação).
      ...(validado.data.valorTotal !== null ? { p_valor_total: validado.data.valorTotal } : {}),
    });

    if (error) {
      return erroAcao(
        "combustivel.transferencias.salvar",
        error,
        traduzErroMovimento(error, "Não foi possível salvar a transferência. Tente novamente"),
      );
    }

    revalidar();
    return { ok: true as const, id: typeof data === "string" && data !== "" ? data : idValido };
  });
}

/** Move a transferência para a lixeira, com motivo. Os gatilhos refazem nível e PEPS. */
export async function excluirTransferencia(id: string, motivo: string): Promise<ResultadoAcao> {
  return semLancar("combustivel.transferencias.excluir", async () => {
    if (!(await temAcao("excluir"))) return { erro: "Sem permissão para excluir transferências" };

    const idValido = idSchema.safeParse(id);
    if (!idValido.success) return { erro: "Transferência inválida" };

    const motivoValido = motivoSchema.safeParse(motivo);
    if (!motivoValido.success) return { erro: "Informe o motivo da exclusão" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_comb_excluir", {
      p_tabela: "combustivel_transferencias",
      p_id: idValido.data,
      p_motivo: motivoValido.data,
    });

    if (error) {
      return erroAcao(
        "combustivel.transferencias.excluir",
        error,
        traduzErroMovimento(error, "Não foi possível excluir a transferência. Tente novamente"),
      );
    }

    revalidar();
    return { ok: true };
  });
}

/**
 * Tira a transferência da lixeira (Lixeira da origem). Pede a lixeira
 * (`administracao.lixeira`/editar) e a exclusão do recurso, como a RPC. Os
 * gatilhos refazem nível, PEPS e saldo; se o saldo não fechar, a mensagem da
 * trava vai para a tela.
 */
export async function restaurarTransferencia(id: string): Promise<ResultadoAcao> {
  return semLancar("combustivel.transferencias.restaurar", async () => {
    if (!(await temPermissaoDeRestaurar())) return { erro: "Sem permissão para restaurar transferências" };

    const idValido = idSchema.safeParse(id);
    if (!idValido.success) return { erro: "Transferência inválida" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_comb_restaurar", {
      p_tabela: "combustivel_transferencias",
      p_id: idValido.data,
    });

    if (error) {
      return erroAcao(
        "combustivel.transferencias.restaurar",
        error,
        traduzErroMovimento(error, "Não foi possível restaurar a transferência. Tente novamente"),
      );
    }

    revalidar();
    return { ok: true };
  });
}

async function temPermissaoDeRestaurar(): Promise<boolean> {
  try {
    await exigirPermissao("administracao.lixeira", "editar");
    await exigirPermissao(RECURSO, "excluir");
    return true;
  } catch {
    return false;
  }
}

/**
 * Preço médio da vida inteira do tanque (todas as entradas e transferências
 * recebidas), o `calcularPrecoMedioTanque` da origem. É o que o formulário usa
 * para preencher o valor na criação.
 */
export async function consultarPrecoMedioTanque(
  tanqueId: string,
): Promise<{ ok: true; preco: number } | { erro: string }> {
  return semLancar("combustivel.transferencias.preco_medio", async () => {
    if (!(await temAcao("ver"))) return { erro: "Sem permissão para ver transferências" };

    const tanque = idSchema.safeParse(tanqueId);
    if (!tanque.success) return { erro: "Tanque inválido" };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_comb_preco_medio_tanque", { p_tanque: tanque.data });
    if (error) {
      return erroAcao("combustivel.transferencias.preco_medio", error, "Não foi possível consultar o preço médio do tanque");
    }
    const preco = Number(data ?? 0);
    return { ok: true, preco: Number.isFinite(preco) ? preco : 0 };
  });
}

/**
 * Combustível do tanque na data (o que vai ser transferido), pelo nome. Null
 * quando o tanque não tem fonte rastreável nessa data.
 */
export async function consultarCombustivelNaData(
  tanqueId: string,
  dataHora: string,
): Promise<{ ok: true; nome: string | null } | { erro: string }> {
  return semLancar("combustivel.transferencias.combustivel_na_data", async () => {
    if (!(await temAcao("ver"))) return { erro: "Sem permissão para ver transferências" };

    const tanque = idSchema.safeParse(tanqueId);
    const data = dataHoraIso.safeParse(dataHora);
    if (!tanque.success || !data.success) return { erro: "Tanque ou data inválidos" };

    const supabase = await createClient();
    const { data: insumoId, error } = await supabase.rpc("fn_comb_combustivel_na_data", {
      p_tanque: tanque.data,
      p_data: data.data,
    });
    if (error) {
      return erroAcao("combustivel.transferencias.combustivel_na_data", error, "Não foi possível consultar o combustível");
    }
    if (!insumoId) return { ok: true, nome: null };

    const { data: insumo, error: erroInsumo } = await supabase
      .from("insumos")
      .select("nome")
      .eq("id", insumoId)
      .maybeSingle();
    if (erroInsumo) {
      return erroAcao("combustivel.transferencias.combustivel_na_data", erroInsumo, "Não foi possível consultar o combustível");
    }
    return { ok: true, nome: insumo?.nome ?? null };
  });
}

/**
 * Litros no tanque até a data, sem contar a própria transferência em edição.
 * É só a dica do formulário: quem decide é a trava do banco ao salvar.
 */
export async function consultarEstoqueTransferencia(
  tanqueId: string,
  dataHora: string,
  excluirId: string | null,
): Promise<{ ok: true; litros: number } | { erro: string }> {
  return semLancar("combustivel.transferencias.estoque", async () => {
    if (!(await temAcao("ver"))) return { erro: "Sem permissão para ver transferências" };

    const tanque = idSchema.safeParse(tanqueId);
    const data = dataHoraIso.safeParse(dataHora);
    if (!tanque.success || !data.success) return { erro: "Tanque ou data inválidos" };
    const excluir = excluirId === null ? null : idSchema.safeParse(excluirId);
    if (excluir && !excluir.success) return { erro: "Transferência inválida" };

    const supabase = await createClient();
    const { data: litros, error } = await supabase.rpc("fn_comb_estoque_na_data", {
      p_tanque: tanque.data,
      p_data: data.data,
      ...(excluir ? { p_excluir: excluir.data } : {}),
    });

    if (error) {
      return erroAcao("combustivel.transferencias.estoque", error, "Não foi possível consultar o estoque do tanque");
    }
    return { ok: true, litros: Number(litros ?? 0) };
  });
}
