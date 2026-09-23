"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao, logErroServidor, semLancar } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { lerAlocacoesDaSaida } from "@/modules/combustivel/abastecimentos/queries";
import {
  montarDadosSaida,
  regrasSaida,
  saidaSchema,
  type SaidaInput,
} from "@/modules/combustivel/abastecimentos/schemas";
import { traduzirErroCombustivel } from "@/modules/combustivel/entradas/erros";
import { dataHoraIsoSchema } from "@/modules/combustivel/entradas/schemas";
import type { Json } from "@/lib/database.types";

/**
 * Mutações da aba Abastecimentos (`combustivel.saidas`).
 *
 * Permissão tripla: a RPC checa `tem_permissao` (a tabela nem tem grant de
 * escrita), aqui `exigirPermissao`, e a tela esconde o botão. Nenhuma action
 * lança. O contexto das regras (tanque externo, etapa do equipamento, alocações
 * de antes) é relido do banco: a tela manda o que ela acha, e o servidor não
 * confia.
 */

const RECURSO = "combustivel.saidas" as const;
const ROTA_LISTA = "/combustivel/abastecimentos";

export type ResultadoSalvar = { ok: true; id: string } | { erro: string };
export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoEstoque = { ok: true; litros: number } | { erro: string };

const motivoSchema = z.string().trim().min(1);

async function temAcao(acao: "ver" | "criar" | "editar" | "excluir"): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lista, painel, tanques e o DETALHE concreto: `revalidatePath` da lista não
 * alcança `/combustivel/abastecimentos/[id]`. Depois do commit nada vira falha.
 */
function revalidar(id: string | null): void {
  const rotas = [ROTA_LISTA, "/combustivel", "/combustivel/tanques", "/combustivel/anomalias"];
  if (id) rotas.push(`${ROTA_LISTA}/${id}`);
  for (const rota of rotas) {
    try {
      revalidatePath(rota);
    } catch (erro) {
      logErroServidor("combustivel.saidas.revalidar", erro);
    }
  }
}

/** Cria (id nulo) ou edita um abastecimento pela `fn_comb_salvar_saida`. */
export async function salvarAbastecimento(id: string | null, dados: SaidaInput): Promise<ResultadoSalvar> {
  return semLancar("combustivel.saidas.salvar", async () => {
    const criando = id === null;
    if (!(await temAcao(criando ? "criar" : "editar"))) {
      return { erro: criando ? "Sem permissão para lançar abastecimento" : "Sem permissão para editar abastecimento" };
    }
    if (!criando && !idSchema.safeParse(id).success) return { erro: "Abastecimento inválido" };

    const validado = saidaSchema.safeParse(dados);
    if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
    const d = validado.data;

    const supabase = await createClient();
    const [tanque, etapa] = await Promise.all([
      d.origem === "tanque" && d.tanqueId
        ? supabase.from("tanques").select("eh_externo").eq("id", d.tanqueId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      d.tipoConsumidor === "equipamento_proprio" && d.equipamentoId
        ? supabase.from("centros_custo").select("id").eq("equipamento_id", d.equipamentoId).limit(1).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (tanque.error || etapa.error) {
      return erroAcao(
        "combustivel.saidas.salvar",
        tanque.error ?? etapa.error,
        "Não foi possível conferir o tanque e o equipamento. Tente novamente",
      );
    }
    const contexto = { tanqueExterno: tanque.data?.eh_externo ?? false, equipamentoTemEtapa: etapa.data !== null };

    const problemas = regrasSaida(d, contexto);
    if (problemas.length > 0) return { erro: problemas[0].mensagem };

    const alocacoesOriginais = criando ? [] : await lerAlocacoesDaSaida(id);
    if (alocacoesOriginais === null) {
      return { erro: "Não foi possível ler as alocações do abastecimento. Tente novamente" };
    }

    const { data, error } = await supabase.rpc("fn_comb_salvar_saida", {
      // Os tipos gerados não aceitam null nos argumentos; a RPC aceita.
      p_id: id as unknown as string,
      p_dados: montarDadosSaida(d, { tanqueExterno: contexto.tanqueExterno, alocacoesOriginais }) as unknown as Json,
    });

    if (error) {
      return erroAcao(
        "combustivel.saidas.salvar",
        error,
        traduzirErroCombustivel(error, "Não foi possível salvar o abastecimento. Tente novamente"),
      );
    }

    const salvo = typeof data === "string" ? data : (id ?? "");
    revalidar(salvo || null);
    return { ok: true, id: salvo };
  });
}

/** Exclui (lixeira, com motivo). Os gatilhos refazem PEPS, nível e conta corrente. */
export async function excluirAbastecimento(id: string, motivo: string): Promise<ResultadoAcao> {
  return semLancar("combustivel.saidas.excluir", async () => {
    if (!(await temAcao("excluir"))) return { erro: "Sem permissão para excluir abastecimento" };
    if (!idSchema.safeParse(id).success) return { erro: "Abastecimento inválido" };
    const motivoValido = motivoSchema.safeParse(motivo);
    if (!motivoValido.success) return { erro: "Informe o motivo da exclusão" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_comb_excluir", {
      p_tabela: "combustivel_saidas",
      p_id: id,
      p_motivo: motivoValido.data,
    });
    if (error) {
      return erroAcao(
        "combustivel.saidas.excluir",
        error,
        traduzirErroCombustivel(error, "Não foi possível excluir o abastecimento. Tente novamente"),
      );
    }

    revalidar(id);
    return { ok: true };
  });
}

/**
 * Litros no tanque na data (`fn_comb_estoque_na_data`), sem contar o próprio
 * abastecimento na edição. Só leitura: pede "ver" na aba.
 */
export async function consultarEstoqueNaData(
  tanqueId: string,
  dataIso: string,
  excluirId: string | null,
): Promise<ResultadoEstoque> {
  return semLancar("combustivel.saidas.estoque", async () => {
    if (!(await temAcao("ver"))) return { erro: "Sem permissão para ver abastecimentos" };
    if (!idSchema.safeParse(tanqueId).success) return { erro: "Tanque inválido" };
    if (!dataHoraIsoSchema.safeParse(dataIso).success) return { erro: "Data inválida" };
    if (excluirId !== null && !idSchema.safeParse(excluirId).success) return { erro: "Abastecimento inválido" };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_comb_estoque_na_data", {
      p_tanque: tanqueId,
      p_data: dataIso,
      ...(excluirId ? { p_excluir: excluirId } : {}),
    });
    if (error) {
      return erroAcao("combustivel.saidas.estoque", error, "Não foi possível consultar o estoque do tanque");
    }
    return { ok: true, litros: Number(data ?? 0) };
  });
}
