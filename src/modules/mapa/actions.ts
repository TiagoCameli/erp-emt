"use server";

import { revalidatePath } from "next/cache";

import type { Json } from "@/lib/database.types";
import { erroAcao, textoDoErro } from "@/lib/erros";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { carregarEstadoMapa } from "@/modules/mapa/queries";
import {
  assinalarOperadorSchema,
  encerrarLocacaoSchema,
  iniciarLocacaoSchema,
  marcarEstadoSchema,
  moverEquipamentosSchema,
  moverPessoasSchema,
} from "@/modules/mapa/schemas";
import type { EstadoMapa } from "@/modules/mapa/tipos";

/**
 * Mutações do Mapa. Cada uma pede mapa.mapa/editar aqui E na RPC (fn_mapa_exigir), valida o
 * pedido com o schema do módulo e devolve o estado novo do mapa junto com o `ok`, para a tela
 * trocar o que desenha sem recarregar a página. Erro vira `{ erro }` sempre: Server Action do
 * mapa não lança para o cliente (src/lib/erros.ts).
 *
 * A mensagem de negócio da RPC (raise exception: "fora de qualquer zona", "tem posição por
 * GPS", "é da Colorado: entra por locação") sobe para o toast como está, porque é ela que diz
 * à pessoa o que fazer.
 */

export type ResultadoMapa =
  | { ok: true; total: number; estado: EstadoMapa | null }
  | { erro: string };

type ErroRpc = { code?: string; message?: string } | null;

function mensagemDaRpc(error: ErroRpc, reserva: string): string {
  if (
    error &&
    (error.code === "P0001" || error.code === "42501") &&
    error.message
  )
    return error.message;
  return reserva;
}

async function semPermissao(acao: "editar" | "criar"): Promise<string | null> {
  try {
    await exigirPermissao("mapa.mapa", acao);
    return null;
  } catch {
    return acao === "criar"
      ? "Sem permissão para adicionar máquinas no Mapa"
      : "Sem permissão para editar o Mapa";
  }
}

async function concluir(total: number): Promise<ResultadoMapa> {
  try {
    revalidatePath("/mapa");
  } catch {
    // a gravação já aconteceu
  }
  const { estado } = await carregarEstadoMapa();
  return { ok: true, total, estado };
}

/** Relê o mapa (botão "Atualizar" e volta do foco na aba). Pede só ver, como a página. */
export async function recarregarEstado(): Promise<
  { ok: true; estado: EstadoMapa } | { erro: string }
> {
  try {
    await exigirPermissao("mapa.mapa", "ver");
  } catch {
    return { erro: "Sem permissão para ver o Mapa" };
  }
  const { estado, erro } = await carregarEstadoMapa();
  if (!estado) return { erro: erro ?? "Não foi possível recarregar o mapa" };
  return { ok: true, estado };
}

/**
 * Arraste (1..n máquinas) ou "posicionar" de quem ainda não tem posição. Uma chamada da RPC por
 * máquina, cada uma com o próprio ponto: o banco resolve a zona de novo e grava alocação +
 * movimentação (`fn_mapa_mover_equipamentos`). Se uma falhar no meio, as anteriores ficam (cada
 * movimentação é independente) e o erro diz qual parou.
 */
export async function moverEquipamentos(
  dados: unknown,
): Promise<ResultadoMapa> {
  const bloqueio = await semPermissao("editar");
  if (bloqueio) return { erro: bloqueio };
  const validado = moverEquipamentosSchema.safeParse(dados);
  if (!validado.success)
    return { erro: validado.error.issues[0]?.message ?? "Pedido inválido" };
  const {
    itens,
    data,
    motivo,
    ajuste,
    deslocamento,
    conserto_motivo,
    conserto_previsao,
  } = validado.data;
  const vistos = new Set<string>();
  let total = 0;
  try {
    const supabase = await createClient();
    for (const item of itens) {
      if (vistos.has(item.id)) continue;
      vistos.add(item.id);
      const destino: Record<string, unknown> = { lng: item.lng, lat: item.lat };
      if (ajuste) destino.ajuste = true;
      else if (item.estado) destino.estado = item.estado;
      if (deslocamento) destino.deslocamento = deslocamento;
      if (conserto_motivo) destino.conserto_motivo = conserto_motivo;
      if (conserto_previsao) destino.conserto_previsao = conserto_previsao;
      const { data: n, error } = await supabase.rpc(
        "fn_mapa_mover_equipamentos",
        {
          p_ids: [item.id],
          p_destino: destino as Json,
          p_data: data,
          p_motivo: motivo ?? "",
        },
      );
      if (error) {
        const mensagem = mensagemDaRpc(
          error,
          "Não foi possível mover o equipamento",
        );
        return erroAcao(
          "mapa.mover",
          error,
          total > 0
            ? `${mensagem} (${total} de ${vistos.size} já movidos)`
            : mensagem,
        );
      }
      total += n ?? 1;
    }
    return concluir(total);
  } catch (erro) {
    return erroAcao(
      "mapa.mover",
      erro,
      `Não foi possível mover: ${textoDoErro(erro)}`,
    );
  }
}

/** Botões de estado da ficha (operando, parado, em rota, quebrado na obra, conserto). */
export async function marcarEstado(dados: unknown): Promise<ResultadoMapa> {
  const bloqueio = await semPermissao("editar");
  if (bloqueio) return { erro: bloqueio };
  const validado = marcarEstadoSchema.safeParse(dados);
  if (!validado.success)
    return { erro: validado.error.issues[0]?.message ?? "Pedido inválido" };
  const { id, estado, motivo, descricao, deslocamento, previsao } =
    validado.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_mapa_marcar_estado", {
      p_id: id,
      p_estado: estado,
      p_motivo: motivo ?? "",
      p_descricao: descricao || null,
      p_deslocamento: deslocamento ? (deslocamento as Json) : null,
      p_previsao: previsao || null,
    });
    if (error)
      return erroAcao(
        "mapa.estado",
        error,
        mensagemDaRpc(error, "Não foi possível mudar o estado"),
      );
    return concluir(1);
  } catch (erro) {
    return erroAcao(
      "mapa.estado",
      erro,
      `Não foi possível mudar o estado: ${textoDoErro(erro)}`,
    );
  }
}

/** Assinala (ou tira, com null) o operador de uma máquina. */
export async function assinalarOperador(
  dados: unknown,
): Promise<ResultadoMapa> {
  const bloqueio = await semPermissao("editar");
  if (bloqueio) return { erro: bloqueio };
  const validado = assinalarOperadorSchema.safeParse(dados);
  if (!validado.success)
    return { erro: validado.error.issues[0]?.message ?? "Pedido inválido" };
  const { equipamentoId, colaboradorId, motivo } = validado.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_mapa_assinalar_operador", {
      p_equipamento: equipamentoId,
      p_colaborador: colaboradorId,
      p_motivo: motivo || null,
    });
    if (error)
      return erroAcao(
        "mapa.operador",
        error,
        mensagemDaRpc(error, "Não foi possível assinalar o operador"),
      );
    return concluir(1);
  } catch (erro) {
    return erroAcao(
      "mapa.operador",
      erro,
      `Não foi possível assinalar o operador: ${textoDoErro(erro)}`,
    );
  }
}

/** Arraste de pessoas: para uma máquina (vira operador) ou para um ponto (posição manual). */
export async function moverPessoas(dados: unknown): Promise<ResultadoMapa> {
  const bloqueio = await semPermissao("editar");
  if (bloqueio) return { erro: bloqueio };
  const validado = moverPessoasSchema.safeParse(dados);
  if (!validado.success)
    return { erro: validado.error.issues[0]?.message ?? "Pedido inválido" };
  const { ids, destino, data, motivo } = validado.data;
  try {
    const supabase = await createClient();
    const { data: total, error } = await supabase.rpc(
      "fn_mapa_mover_colaboradores",
      {
        p_ids: [...new Set(ids)],
        p_destino: destino as Json,
        p_data: data,
        p_motivo: motivo ?? "",
      },
    );
    if (error)
      return erroAcao(
        "mapa.moverPessoas",
        error,
        mensagemDaRpc(error, "Não foi possível mover a pessoa"),
      );
    return concluir(total ?? ids.length);
  } catch (erro) {
    return erroAcao(
      "mapa.moverPessoas",
      erro,
      `Não foi possível mover: ${textoDoErro(erro)}`,
    );
  }
}

/**
 * "Adicionar máquina alugada": abre a locação (Colorado ou terceiro) e põe a máquina no mapa
 * sem posição; a pessoa posiciona em seguida. Máquina nova no cadastro exige
 * cadastros.equipamentos/criar, que a RPC confere.
 */
export async function iniciarLocacao(dados: unknown): Promise<ResultadoMapa> {
  const bloqueio = await semPermissao("editar");
  if (bloqueio) return { erro: bloqueio };
  const validado = iniciarLocacaoSchema.safeParse(dados);
  if (!validado.success)
    return { erro: validado.error.issues[0]?.message ?? "Pedido inválido" };
  const v = validado.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_mapa_locacao_iniciar", {
      p_equipamento: v.equipamentoId,
      p_fornecedor: v.fornecedorId,
      p_tipo_aluguel: v.tipoAluguel,
      p_valor_unitario: v.valorUnitario,
      p_inicio: v.inicio || null,
      p_destino: null,
      p_fim_previsto: v.fimPrevisto || null,
      p_medicao_inicio: v.medicaoInicio ?? null,
      p_observacao: v.observacao || null,
      p_novo: v.novo ? (v.novo as Json) : null,
    });
    if (error)
      return erroAcao(
        "mapa.locacaoIniciar",
        error,
        mensagemDaRpc(error, "Não foi possível iniciar a locação"),
      );
    return concluir(1);
  } catch (erro) {
    return erroAcao(
      "mapa.locacaoIniciar",
      erro,
      `Não foi possível iniciar a locação: ${textoDoErro(erro)}`,
    );
  }
}

/** Encerra a locação em curso: a máquina sai do mapa e a vigência fecha na data informada. */
export async function encerrarLocacao(dados: unknown): Promise<ResultadoMapa> {
  const bloqueio = await semPermissao("editar");
  if (bloqueio) return { erro: bloqueio };
  const validado = encerrarLocacaoSchema.safeParse(dados);
  if (!validado.success)
    return { erro: validado.error.issues[0]?.message ?? "Pedido inválido" };
  const v = validado.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_mapa_locacao_encerrar", {
      p_equipamento: v.equipamentoId,
      p_fim: v.fim || null,
      p_medicao_fim: v.medicaoFim ?? null,
      p_motivo: v.motivo || null,
    });
    if (error)
      return erroAcao(
        "mapa.locacaoEncerrar",
        error,
        mensagemDaRpc(error, "Não foi possível encerrar a locação"),
      );
    return concluir(1);
  } catch (erro) {
    return erroAcao(
      "mapa.locacaoEncerrar",
      erro,
      `Não foi possível encerrar a locação: ${textoDoErro(erro)}`,
    );
  }
}
