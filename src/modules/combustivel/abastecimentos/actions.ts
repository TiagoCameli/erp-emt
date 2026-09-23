"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao, logErroServidor, semLancar } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  combustivelDaUltimaEntrada,
  precoFifoDaSaida,
  relogioRioBranco,
  type FIFOResult,
} from "@/modules/combustivel/_shared/fifo-ts";
import {
  lerAlocacoesDaSaida,
  lerMovimentosFifoDoTanque,
  lerSnapshotDaSaida,
} from "@/modules/combustivel/abastecimentos/queries";
import {
  montarDadosSaida,
  regrasSaida,
  saidaSchema,
  tipoIncompativel,
  usaSnapshotSalvo,
  type SaidaInput,
} from "@/modules/combustivel/abastecimentos/schemas";
import { traduzirErroCombustivel } from "@/modules/combustivel/entradas/erros";
import { dataHoraIsoSchema } from "@/modules/combustivel/entradas/schemas";
import { buscarUltimaLeitura } from "@/modules/manutencao/medicoes/queries";
import type { Json } from "@/lib/database.types";

/**
 * Mutações da aba Abastecimentos (`combustivel.saidas`).
 *
 * Permissão tripla: a RPC checa `tem_permissao` (a tabela nem tem grant de
 * escrita), aqui `exigirPermissao`, e a tela esconde o botão. Nenhuma action
 * lança. O contexto das regras (tanque externo, preço médio do tanque, snapshot
 * salvo, alocações de antes) é relido do banco: a tela manda o que ela acha, e o
 * servidor não confia.
 *
 * Editar: na origem a edição pede a senha de edição, menos para o Administrador.
 * No ERP a senha vira a permissão `combustivel.saidas` / editar (mudança
 * necessária: o ERP não tem senha de edição, tem permissão por ação).
 */

const RECURSO = "combustivel.saidas" as const;
const ROTA_LISTA = "/combustivel/abastecimentos";

export type ResultadoSalvar = { ok: true; id: string } | { erro: string };
export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoEstoque = { ok: true; litros: number } | { erro: string };
export type ResultadoFifo = ({ ok: true } & FIFOResult) | { erro: string };
export type ResultadoLeitura = { ok: true; valor: number | null } | { erro: string };
export type ResultadoCiclo = { ok: true; inicio: string | null } | { erro: string };

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
 * Restaurar é a Lixeira da origem (`restaurar_lixeira_combustivel`). No ERP pede as duas
 * permissões que a `fn_comb_restaurar` confere: editar a Lixeira E excluir na aba.
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

    const problemas = regrasSaida(d);
    if (problemas.length > 0) return { erro: problemas[0].mensagem };

    const supabase = await createClient();
    const noTanque = d.origem === "tanque" && d.tanqueId !== null;
    const tanque = noTanque
      ? await supabase.from("tanques").select("eh_externo").eq("id", d.tanqueId as string).maybeSingle()
      : { data: null, error: null };
    if (tanque.error) {
      return erroAcao("combustivel.saidas.salvar", tanque.error, "Não foi possível conferir o tanque. Tente novamente");
    }
    const tanqueExterno = tanque.data?.eh_externo ?? false;

    const [alocacoesOriginais, salvo] = criando
      ? [[], null]
      : await Promise.all([lerAlocacoesDaSaida(id), lerSnapshotDaSaida(id)]);
    if (alocacoesOriginais === null) {
      return { erro: "Não foi possível ler as alocações do abastecimento. Tente novamente" };
    }

    // O preço médio do tanque da origem: snapshot salvo (edição sem trocar tanque nem
    // origem) ou o FIFO em TS, com os movimentos vivos do tanque.
    let precoMedioTanque = 0;
    if (noTanque) {
      const movimentos = await lerMovimentosFifoDoTanque(d.tanqueId as string);
      if (!movimentos) return { erro: "Não foi possível calcular o preço do tanque. Tente novamente" };
      const tipoDoTanque = tanqueExterno ? "" : combustivelDaUltimaEntrada(movimentos.entradas, d.tanqueId as string);
      if (
        tipoIncompativel({
          origem: d.origem,
          temTanque: true,
          tanqueEhExterno: tanqueExterno,
          tipoDoTanque,
          tipoDaSaida: d.insumoId,
        })
      ) {
        return { erro: "Combustível incompatível: a saída é de um combustível e o tanque hoje tem outro" };
      }
      precoMedioTanque = usaSnapshotSalvo(salvo, { tanqueId: d.tanqueId, origem: d.origem })
        ? (salvo?.precoMedioTanque ?? 0)
        : precoFifoDaSaida(movimentos, {
            tanqueId: d.tanqueId as string,
            dataHora: relogioRioBranco(d.dataHora),
            litros: d.litros,
            tipoCombustivel: d.insumoId ?? undefined,
            excluirSaidaId: id ?? undefined,
          }).precoMedio;
    }

    const { data, error } = await supabase.rpc("fn_comb_salvar_saida", {
      // Os tipos gerados não aceitam null nos argumentos; a RPC aceita.
      p_id: id as unknown as string,
      p_dados: montarDadosSaida(d, { tanqueExterno, precoMedioTanque, alocacoesOriginais }) as unknown as Json,
    });

    if (error) {
      return erroAcao(
        "combustivel.saidas.salvar",
        error,
        traduzirErroCombustivel(error, "Não foi possível salvar o abastecimento. Tente novamente"),
      );
    }

    const salvoId = typeof data === "string" ? data : (id ?? "");
    revalidar(salvoId || null);
    return { ok: true, id: salvoId };
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
 * Tira o abastecimento da lixeira (`fn_comb_restaurar`). Os gatilhos refazem PEPS, nível
 * e conta corrente; se a volta deixar o saldo negativo em algum momento, o banco recusa.
 */
export async function restaurarAbastecimento(id: string): Promise<ResultadoAcao> {
  return semLancar("combustivel.saidas.restaurar", async () => {
    if (!(await podeRestaurar())) return { erro: "Sem permissão para restaurar abastecimento" };
    if (!idSchema.safeParse(id).success) return { erro: "Abastecimento inválido" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_comb_restaurar", { p_tabela: "combustivel_saidas", p_id: id });
    if (error) {
      return erroAcao(
        "combustivel.saidas.restaurar",
        error,
        traduzirErroCombustivel(error, "Não foi possível restaurar o abastecimento. Tente novamente"),
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

/**
 * O FIFO em TS da origem para a tela: preço médio, lotes consumidos e litros sem
 * suprimento de uma saída de `litros` no tanque, na data, do combustível. Na edição,
 * `excluirSaidaId` tira a própria saída do replay. Só leitura: pede "ver".
 */
export async function calcularPrecoFifo(
  tanqueId: string,
  dataIso: string,
  litros: number,
  insumoId: string | null,
  excluirSaidaId: string | null,
): Promise<ResultadoFifo> {
  return semLancar("combustivel.saidas.fifo", async () => {
    if (!(await temAcao("ver"))) return { erro: "Sem permissão para ver abastecimentos" };
    if (!idSchema.safeParse(tanqueId).success) return { erro: "Tanque inválido" };
    if (!dataHoraIsoSchema.safeParse(dataIso).success) return { erro: "Data inválida" };
    if (typeof litros !== "number" || !Number.isFinite(litros) || litros < 0) return { erro: "Litros inválidos" };
    if (insumoId !== null && !idSchema.safeParse(insumoId).success) return { erro: "Combustível inválido" };
    if (excluirSaidaId !== null && !idSchema.safeParse(excluirSaidaId).success) return { erro: "Abastecimento inválido" };

    const movimentos = await lerMovimentosFifoDoTanque(tanqueId);
    if (!movimentos) return { erro: "Não foi possível calcular o preço do tanque" };
    const resultado = precoFifoDaSaida(movimentos, {
      tanqueId,
      dataHora: relogioRioBranco(dataIso),
      litros,
      tipoCombustivel: insumoId ?? undefined,
      excluirSaidaId: excluirSaidaId ?? undefined,
    });
    return { ok: true, ...resultado };
  });
}

/** Última leitura (horímetro ou km) do equipamento, para o aviso de leitura menor da origem. */
export async function consultarUltimaLeitura(equipamentoId: string): Promise<ResultadoLeitura> {
  return semLancar("combustivel.saidas.leitura", async () => {
    if (!(await temAcao("ver"))) return { erro: "Sem permissão para ver abastecimentos" };
    if (!idSchema.safeParse(equipamentoId).success) return { erro: "Equipamento inválido" };
    const leitura = await buscarUltimaLeitura(equipamentoId);
    return { ok: true, valor: leitura?.valor ?? null };
  });
}

/**
 * Início do ciclo aberto do tanque (`fn_comb_inicio_ciclo_aberto`): na edição, a saída
 * de antes dele é de ciclo fechado e a origem trava tanque, litros e data.
 */
export async function consultarInicioCiclo(tanqueId: string): Promise<ResultadoCiclo> {
  return semLancar("combustivel.saidas.ciclo", async () => {
    if (!(await temAcao("ver"))) return { erro: "Sem permissão para ver abastecimentos" };
    if (!idSchema.safeParse(tanqueId).success) return { erro: "Tanque inválido" };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_comb_inicio_ciclo_aberto", { p_tanque: tanqueId });
    if (error) return erroAcao("combustivel.saidas.ciclo", error, "Não foi possível consultar o ciclo do tanque");
    return { ok: true, inicio: typeof data === "string" && data ? data : null };
  });
}
