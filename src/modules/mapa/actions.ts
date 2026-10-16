"use server";

import { revalidatePath } from "next/cache";

import type { Json } from "@/lib/database.types";
import { erroAcao, textoDoErro } from "@/lib/erros";
import { idSchemaCom } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { carregarEstadoMapa } from "@/modules/mapa/queries";
import { paraFichaNumeros } from "@/modules/mapa/dados";
import {
  assinalarOperadorSchema,
  colocarLocalSchema,
  desenharObraSchema,
  editarLocalSchema,
  encerrarLocacaoSchema,
  girarEquipamentoSchema,
  iniciarLocacaoSchema,
  marcarEstadoSchema,
  moverEquipamentosSchema,
  moverPessoasSchema,
  posicionarObjetoSchema,
  acoplarImplementoSchema,
  tamanhoDepositoSchema,
  rumoDepositoSchema,
  posicionarObraSchema,
  raioLocalSchema,
  tirarObraSchema,
  vincularLocalSchema,
} from "@/modules/mapa/schemas";
import type { EstadoMapa, FichaNumeros } from "@/modules/mapa/tipos";

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

/** Botões de estado da ficha (operando, parado, em rota, quebrado na obra, conserto, fora). */
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

/** "Adicionar obra": põe uma obra ativa do cadastro no ponto tocado. */
export async function posicionarObra(dados: unknown): Promise<ResultadoMapa> {
  const bloqueio = await semPermissao("editar");
  if (bloqueio) return { erro: bloqueio };
  const validado = posicionarObraSchema.safeParse(dados);
  if (!validado.success)
    return { erro: validado.error.issues[0]?.message ?? "Pedido inválido" };
  const v = validado.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_mapa_obra_posicionar", {
      p_obra: v.obraId,
      p_lng: v.lng,
      p_lat: v.lat,
    });
    if (error)
      return erroAcao(
        "mapa.obraPosicionar",
        error,
        mensagemDaRpc(error, "Não foi possível pôr a obra no mapa"),
      );
    return concluir(1);
  } catch (erro) {
    return erroAcao(
      "mapa.obraPosicionar",
      erro,
      `Não foi possível pôr a obra no mapa: ${textoDoErro(erro)}`,
    );
  }
}

/**
 * "Adicionar localização" no ponto tocado: dá ponto a um local existente ou cria um local novo
 * (criar pede mapa.mapa/criar) e, se veio `vincular`, liga o tanque ou depósito a ele. São duas
 * RPCs: se a segunda falhar, o local fica no mapa e o erro diz que faltou o vínculo.
 */
export async function colocarLocal(dados: unknown): Promise<ResultadoMapa> {
  const validado = colocarLocalSchema.safeParse(dados);
  if (!validado.success)
    return { erro: validado.error.issues[0]?.message ?? "Pedido inválido" };
  const v = validado.data;
  const bloqueio = await semPermissao(v.localidadeId ? "editar" : "criar");
  if (bloqueio)
    return {
      erro: v.localidadeId
        ? bloqueio
        : "Sem permissão para criar locais no Mapa",
    };
  try {
    const supabase = await createClient();
    const { data: id, error } = await supabase.rpc("fn_mapa_local_editar", {
      p_id: v.localidadeId ?? null,
      p_nome: v.nome ?? null,
      p_tipos: v.tipos ?? null,
      p_lng: v.lng,
      p_lat: v.lat,
    });
    if (error || !id)
      return erroAcao(
        "mapa.localSalvar",
        error,
        mensagemDaRpc(error, "Não foi possível salvar o local"),
      );
    if (v.vincular) {
      const { error: erroVinculo } = await supabase.rpc(
        "fn_mapa_vincular_local",
        { p_alvo: v.vincular.alvo, p_id: v.vincular.id, p_localidade: id },
      );
      if (erroVinculo)
        return erroAcao(
          "mapa.vincularLocal",
          erroVinculo,
          `O local ficou no mapa, mas o vínculo falhou: ${mensagemDaRpc(erroVinculo, "tente ligar de novo")}`,
        );
    }
    return concluir(1);
  } catch (erro) {
    return erroAcao(
      "mapa.localSalvar",
      erro,
      `Não foi possível salvar o local: ${textoDoErro(erro)}`,
    );
  }
}

/** Liga um tanque ou depósito do Estoque a um local que já está no mapa. */
export async function vincularLocal(dados: unknown): Promise<ResultadoMapa> {
  const bloqueio = await semPermissao("editar");
  if (bloqueio) return { erro: bloqueio };
  const validado = vincularLocalSchema.safeParse(dados);
  if (!validado.success)
    return { erro: validado.error.issues[0]?.message ?? "Pedido inválido" };
  const v = validado.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_mapa_vincular_local", {
      p_alvo: v.alvo,
      p_id: v.id,
      p_localidade: v.localidadeId,
    });
    if (error)
      return erroAcao(
        "mapa.vincularLocal",
        error,
        mensagemDaRpc(error, "Não foi possível ligar ao local"),
      );
    return concluir(1);
  } catch (erro) {
    return erroAcao(
      "mapa.vincularLocal",
      erro,
      `Não foi possível ligar ao local: ${textoDoErro(erro)}`,
    );
  }
}

/** Tamanho da área de um local (raio em metros); null volta ao padrão. */
export async function ajustarRaioLocal(dados: unknown): Promise<ResultadoMapa> {
  const bloqueio = await semPermissao("editar");
  if (bloqueio) return { erro: bloqueio };
  const validado = raioLocalSchema.safeParse(dados);
  if (!validado.success)
    return { erro: validado.error.issues[0]?.message ?? "Pedido inválido" };
  const v = validado.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_mapa_local_raio", {
      p_id: v.localidadeId,
      p_raio: v.raioM,
    });
    if (error)
      return erroAcao(
        "mapa.localRaio",
        error,
        mensagemDaRpc(error, "Não foi possível mudar a área do local"),
      );
    return concluir(1);
  } catch (erro) {
    return erroAcao(
      "mapa.localRaio",
      erro,
      `Não foi possível mudar a área do local: ${textoDoErro(erro)}`,
    );
  }
}

/** Rumo da máquina no mapa; null volta a seguir a pista. Não é movimentação. */
export async function girarEquipamento(dados: unknown): Promise<ResultadoMapa> {
  const bloqueio = await semPermissao("editar");
  if (bloqueio) return { erro: bloqueio };
  const validado = girarEquipamentoSchema.safeParse(dados);
  if (!validado.success)
    return { erro: validado.error.issues[0]?.message ?? "Pedido inválido" };
  const v = validado.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_mapa_girar_equipamento", {
      p_id: v.equipamentoId,
      p_heading: v.rumo,
    });
    if (error)
      return erroAcao(
        "mapa.girar",
        error,
        mensagemDaRpc(error, "Não foi possível girar a máquina"),
      );
    return concluir(1);
  } catch (erro) {
    return erroAcao(
      "mapa.girar",
      erro,
      `Não foi possível girar a máquina: ${textoDoErro(erro)}`,
    );
  }
}

/** Nome e tipos do local (a posição muda pelo "Mover no mapa", em `colocarLocal`). */
export async function editarLocal(dados: unknown): Promise<ResultadoMapa> {
  const bloqueio = await semPermissao("editar");
  if (bloqueio) return { erro: bloqueio };
  const validado = editarLocalSchema.safeParse(dados);
  if (!validado.success)
    return { erro: validado.error.issues[0]?.message ?? "Pedido inválido" };
  const v = validado.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_mapa_local_editar", {
      p_id: v.localidadeId,
      p_nome: v.nome,
      p_tipos: v.tipos,
      p_lng: null,
      p_lat: null,
    });
    if (error)
      return erroAcao(
        "mapa.localEditar",
        error,
        mensagemDaRpc(error, "Não foi possível salvar o local"),
      );
    return concluir(1);
  } catch (erro) {
    return erroAcao(
      "mapa.localEditar",
      erro,
      `Não foi possível salvar o local: ${textoDoErro(erro)}`,
    );
  }
}

/**
 * Obra desenhada: pavimentação vira trecho (linha com km inicial e final), edificação vira área
 * (polígono; o ponto de fechamento é repetido aqui). `substituir` desativa o desenho que a obra
 * já tinha; sem ele, acrescenta.
 */
export async function desenharObra(dados: unknown): Promise<ResultadoMapa> {
  const bloqueio = await semPermissao("editar");
  if (bloqueio) return { erro: bloqueio };
  const validado = desenharObraSchema.safeParse(dados);
  if (!validado.success)
    return { erro: validado.error.issues[0]?.message ?? "Pedido inválido" };
  const v = validado.data;
  const geojson =
    v.forma === "trecho"
      ? { type: "LineString", coordinates: v.pontos }
      : { type: "Polygon", coordinates: [[...v.pontos, v.pontos[0]]] };
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_mapa_obra_desenhar", {
      p_obra: v.obraId,
      p_forma: v.forma,
      p_geojson: geojson as Json,
      p_rodovia: v.forma === "trecho" ? (v.rodovia ?? null) : null,
      p_km_inicial: v.forma === "trecho" ? v.kmInicial : null,
      p_km_final: v.forma === "trecho" ? v.kmFinal : null,
      p_substituir: v.substituir,
    });
    if (error)
      return erroAcao(
        "mapa.obraDesenhar",
        error,
        mensagemDaRpc(error, "Não foi possível salvar o desenho da obra"),
      );
    return concluir(1);
  } catch (erro) {
    return erroAcao(
      "mapa.obraDesenhar",
      erro,
      `Não foi possível salvar o desenho da obra: ${textoDoErro(erro)}`,
    );
  }
}

/** Tira a obra do mapa: ponto, trechos e área de edificação. O cadastro da obra fica. */
export async function tirarObra(dados: unknown): Promise<ResultadoMapa> {
  const bloqueio = await semPermissao("editar");
  if (bloqueio) return { erro: bloqueio };
  const validado = tirarObraSchema.safeParse(dados);
  if (!validado.success)
    return { erro: validado.error.issues[0]?.message ?? "Pedido inválido" };
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_mapa_obra_tirar", {
      p_obra: validado.data.obraId,
    });
    if (error)
      return erroAcao(
        "mapa.obraTirar",
        error,
        mensagemDaRpc(error, "Não foi possível tirar a obra do mapa"),
      );
    return concluir(1);
  } catch (erro) {
    return erroAcao(
      "mapa.obraTirar",
      erro,
      `Não foi possível tirar a obra do mapa: ${textoDoErro(erro)}`,
    );
  }
}

/** Números da ficha da máquina (abastecimento, consumo, manutenção e gasto). Pede só ver. */
export async function carregarFichaEquipamento(
  equipamentoId: string,
): Promise<{ ok: true; ficha: FichaNumeros } | { erro: string }> {
  try {
    await exigirPermissao("mapa.mapa", "ver");
  } catch {
    return { erro: "Sem permissão para ver o Mapa" };
  }
  const id = idSchemaCom("Equipamento inválido").safeParse(equipamentoId);
  if (!id.success) return { erro: "Equipamento inválido" };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_mapa_ficha_equipamento", {
      p_id: id.data,
    });
    if (error)
      return erroAcao(
        "mapa.fichaEquipamento",
        error,
        mensagemDaRpc(error, "Não foi possível carregar os números da máquina"),
      );
    const ficha = paraFichaNumeros(data);
    if (!ficha) return { erro: "Resposta inesperada ao carregar a máquina" };
    return { ok: true, ficha };
  } catch (erro) {
    return erroAcao(
      "mapa.fichaEquipamento",
      erro,
      `Não foi possível carregar os números da máquina: ${textoDoErro(erro)}`,
    );
  }
}

/** Acopla um implemento no equipamento do card, ou desacopla (equipamentoId null). */
export async function acoplarImplemento(
  dados: unknown,
): Promise<ResultadoMapa> {
  const bloqueio = await semPermissao("editar");
  if (bloqueio) return { erro: bloqueio };
  const validado = acoplarImplementoSchema.safeParse(dados);
  if (!validado.success)
    return { erro: validado.error.issues[0]?.message ?? "Pedido inválido" };
  const v = validado.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_mapa_acoplar_implemento", {
      p_implemento: v.implementoId,
      p_equipamento: v.equipamentoId,
    });
    if (error)
      return erroAcao(
        "mapa.acoplarImplemento",
        error,
        mensagemDaRpc(error, "Não foi possível acoplar o implemento"),
      );
    return concluir(1);
  } catch (erro) {
    return erroAcao(
      "mapa.acoplarImplemento",
      erro,
      `Não foi possível acoplar o implemento: ${textoDoErro(erro)}`,
    );
  }
}

/** Tamanho do depósito no mapa (largura, comprimento e altura em metros), escolhido na ficha. */
export async function definirTamanhoDeposito(
  dados: unknown,
): Promise<ResultadoMapa> {
  const bloqueio = await semPermissao("editar");
  if (bloqueio) return { erro: bloqueio };
  const validado = tamanhoDepositoSchema.safeParse(dados);
  if (!validado.success)
    return { erro: validado.error.issues[0]?.message ?? "Pedido inválido" };
  const v = validado.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_mapa_deposito_tamanho", {
      p_id: v.id,
      p_largura: v.largura,
      p_comprimento: v.comprimento,
      p_altura: v.altura,
    });
    if (error)
      return erroAcao(
        "mapa.depositoTamanho",
        error,
        mensagemDaRpc(error, "Não foi possível mudar o tamanho do depósito"),
      );
    return concluir(1);
  } catch (erro) {
    return erroAcao(
      "mapa.depositoTamanho",
      erro,
      `Não foi possível mudar o tamanho do depósito: ${textoDoErro(erro)}`,
    );
  }
}

/** Põe ou move um tanque, pilha ou depósito do Estoque no ponto tocado. */
export async function posicionarObjeto(dados: unknown): Promise<ResultadoMapa> {
  const bloqueio = await semPermissao("editar");
  if (bloqueio) return { erro: bloqueio };
  const validado = posicionarObjetoSchema.safeParse(dados);
  if (!validado.success)
    return { erro: validado.error.issues[0]?.message ?? "Pedido inválido" };
  const v = validado.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_mapa_objeto_posicionar", {
      p_alvo: v.alvo,
      p_id: v.id,
      p_lng: v.lng,
      p_lat: v.lat,
    });
    if (error)
      return erroAcao(
        "mapa.objetoPosicionar",
        error,
        mensagemDaRpc(error, "Não foi possível pôr no mapa"),
      );
    return concluir(1);
  } catch (erro) {
    return erroAcao(
      "mapa.objetoPosicionar",
      erro,
      `Não foi possível pôr no mapa: ${textoDoErro(erro)}`,
    );
  }
}

/** Rumo do depósito no mapa (graus, sentido horário a partir do norte), escolhido na ficha. */
export async function girarDeposito(dados: unknown): Promise<ResultadoMapa> {
  const bloqueio = await semPermissao("editar");
  if (bloqueio) return { erro: bloqueio };
  const validado = rumoDepositoSchema.safeParse(dados);
  if (!validado.success)
    return { erro: validado.error.issues[0]?.message ?? "Pedido inválido" };
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_mapa_deposito_rumo", {
      p_id: validado.data.id,
      p_rumo: validado.data.rumo,
    });
    if (error)
      return erroAcao(
        "mapa.depositoRumo",
        error,
        mensagemDaRpc(error, "Não foi possível girar o depósito"),
      );
    return concluir(1);
  } catch (erro) {
    return erroAcao(
      "mapa.depositoRumo",
      erro,
      `Não foi possível girar o depósito: ${textoDoErro(erro)}`,
    );
  }
}
