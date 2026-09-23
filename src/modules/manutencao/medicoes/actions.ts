"use server";

import { revalidatePath } from "next/cache";

import { erroAcao } from "@/lib/erros";
import { dataHojeISO } from "@/lib/formatadores";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  dataNoFuturo,
  editarMedicaoSchema,
  registrarMedicaoSchema,
  type EditarMedicaoInput,
  type RegistrarMedicaoInput,
} from "@/modules/manutencao/medicoes/schemas";
import { buscarUltimaLeitura, type UltimaLeitura } from "@/modules/manutencao/medicoes/queries";

const RECURSO = "manutencao.medicoes" as const;
const ROTA = "/manutencao/medicoes";
const ERRO_FUTURO = "A data da leitura não pode ser depois de hoje";

export type ResultadoAcao = { ok: true } | { erro: string };

/**
 * Erro da RPC para a tela. As travas da fn_registrar_medicao e da
 * fn_editar_medicao são `raise exception` (P0001) com texto já pensado para o
 * usuário ("Este equipamento não controla horímetro nem km"): esse texto sobe.
 * Qualquer outro erro vira a mensagem genérica, com o real no log.
 */
function erroDaRpc(contexto: string, error: { code?: string; message?: string }, generica: string) {
  if (error.code === "P0001" && error.message) return erroAcao(contexto, error, error.message);
  return erroAcao(contexto, error, generica);
}

/** Lança a leitura pela RPC (origem manual, sem id de fila offline). */
export async function registrar(dados: RegistrarMedicaoInput): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para lançar horímetro ou km" };
  }

  const validado = registrarMedicaoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }
  if (dataNoFuturo(validado.data.data, dataHojeISO())) return { erro: ERRO_FUTURO };

  try {
    const supabase = await createClient();

    // A RPC não olha `ativo`; a tela só oferece equipamento ativo, e a action confere.
    const { data: equipamento, error: erroEquipamento } = await supabase
      .from("equipamentos")
      .select("ativo")
      .eq("id", validado.data.equipamentoId)
      .maybeSingle();
    if (erroEquipamento) {
      return erroAcao("manutencao.medicoes.registrar", erroEquipamento, "Não foi possível lançar a leitura. Tente novamente");
    }
    if (!equipamento) return { erro: "Equipamento não encontrado" };
    if (!equipamento.ativo) return { erro: "Equipamento inativo não recebe leitura nova" };

    const { error } = await supabase.rpc("fn_registrar_medicao", {
      p_equipamento: validado.data.equipamentoId,
      p_data: validado.data.data,
      p_valor: validado.data.valor,
      p_origem: "manual",
      p_observacoes: validado.data.observacoes,
    });
    if (error) {
      return erroDaRpc("manutencao.medicoes.registrar", error, "Não foi possível lançar a leitura. Tente novamente");
    }
  } catch (erro) {
    return erroAcao("manutencao.medicoes.registrar", erro, "Não foi possível lançar a leitura. Tente novamente");
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Corrige data, valor e observação de uma leitura pela RPC. */
export async function editar(dados: EditarMedicaoInput): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para editar leitura" };
  }

  const validado = editarMedicaoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }
  if (dataNoFuturo(validado.data.data, dataHojeISO())) return { erro: ERRO_FUTURO };

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_editar_medicao", {
      p_id: validado.data.id,
      p_data: validado.data.data,
      p_valor: validado.data.valor,
      p_observacoes: validado.data.observacoes,
    });
    if (error) {
      return erroDaRpc("manutencao.medicoes.editar", error, "Não foi possível salvar a leitura. Tente novamente");
    }
  } catch (erro) {
    return erroAcao("manutencao.medicoes.editar", erro, "Não foi possível salvar a leitura. Tente novamente");
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Última leitura do equipamento, para o formulário mostrar e avisar quando a
 * nova é menor. `ignorarId` tira da conta a própria leitura em edição.
 */
export async function ultimaLeitura(
  equipamentoId: string,
  ignorarId?: string,
): Promise<{ ultima: UltimaLeitura | null } | { erro: string }> {
  try {
    await exigirPermissao(RECURSO, "ver");
  } catch {
    return { erro: "Sem permissão para ver horímetro e km" };
  }

  const idValido = idSchema.safeParse(equipamentoId);
  if (!idValido.success) return { erro: "Equipamento inválido" };
  let ignorar: string | undefined;
  if (ignorarId !== undefined) {
    const ignorarValido = idSchema.safeParse(ignorarId);
    if (!ignorarValido.success) return { erro: "Leitura inválida" };
    ignorar = ignorarValido.data;
  }

  try {
    return { ultima: await buscarUltimaLeitura(idValido.data, ignorar) };
  } catch (erro) {
    return erroAcao("manutencao.medicoes.ultimaLeitura", erro, "Não foi possível carregar a última leitura");
  }
}
