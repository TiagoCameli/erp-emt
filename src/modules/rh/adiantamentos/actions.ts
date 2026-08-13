"use server";

import { revalidatePath } from "next/cache";

import type { Acao } from "@/config/recursos";
import { erroAcao } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  adiantamentoSchema,
  competenciaSchema,
  type AdiantamentoInput,
} from "@/modules/rh/adiantamentos/schemas";

const RECURSO = "rh.adiantamentos" as const;
const ROTA = "/rh/adiantamentos";
const TABELA = "rh_adiantamentos" as const;

export type ResultadoAcao = { ok: true } | { erro: string };

/** Converte o throw de exigirPermissao no contrato { erro } das actions. */
async function checarPermissao(acao: Acao): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

/**
 * Erro de uma RPC: só devolve `error.message` ao usuário quando é um
 * `raise exception` nosso (SQLSTATE `P0001`, o default do plpgsql sem
 * `USING ERRCODE`). Qualquer outro código (permission denied, violação de
 * RLS, erro de conexão etc.) é infraestrutura do Postgres/PostgREST e vai só
 * pro log — nunca pro toast, senão "permission denied for column..." vaza
 * pro usuário.
 */
function mensagemDeNegocio(
  error: { code?: string; message?: string } | null | undefined,
  fallback: string,
): string {
  if (error?.code === "P0001" && error.message) return error.message;
  return fallback;
}

/**
 * "Já entrou em folha" virou "já teve parcela descontada em folha": a coluna
 * `rh_adiantamentos.folha_id` deixou de existir (Task 3 do parcelamento) e o
 * vínculo com a folha vive na parcela.
 *
 * A leitura vai pela RPC `fn_adiantamento_em_folha` (security definer,
 * fail-closed) e NÃO por um `exists` direto em `rh_adiantamento_parcelas`: a
 * policy de select daquela tabela exige `rh.adiantamentos:ver`, então um perfil
 * com `editar` (ou `excluir`) sem `ver` leria vazio e a trava falharia ABERTA.
 * A função devolve `true` (= "está em folha" = travado) quando falta a
 * permissão. Mesmo motivo de `fn_adiantamento_pagamento_comprometido`.
 */
async function garantirForaDeFolha(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  origem: string,
): Promise<ResultadoAcao> {
  const { data: emFolha, error } = await supabase.rpc(
    "fn_adiantamento_em_folha",
    { p_adiantamento_id: id },
  );

  if (error) {
    return erroAcao(
      origem,
      error,
      "Não foi possível conferir se o adiantamento já entrou em folha",
    );
  }
  if (emFolha) {
    return {
      erro:
        "Este adiantamento já teve parcela descontada em folha. Desaprove a folha e regere antes",
    };
  }
  return { ok: true };
}

/**
 * Garante que o adiantamento existe, ainda não teve parcela descontada em folha
 * e não tem lançamento. Trava de EDITAR: com `lancamento_id` preenchido (todo
 * adiantamento nasce assim, via `fn_registrar_adiantamento`) a RLS já recusa
 * o update por completo — aqui só devolvemos a mensagem amigável antes de
 * gastar a viagem ao banco. Mesmo padrão de `rh/diaristas/actions.ts`.
 */
async function garantirEditavel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
): Promise<ResultadoAcao> {
  const { data, error } = await supabase
    .from(TABELA)
    .select("lancamento_id")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return erroAcao(
      "rh.adiantamentos.garantirEditavel",
      error,
      "Não foi possível carregar o adiantamento",
    );
  }
  if (!data) return { erro: "Adiantamento não encontrado" };

  const foraDeFolha = await garantirForaDeFolha(
    supabase,
    id,
    "rh.adiantamentos.garantirEditavel",
  );
  if ("erro" in foraDeFolha) return foraDeFolha;

  if (data.lancamento_id !== null) {
    return {
      erro:
        "Adiantamento já gerou lançamento no Financeiro: não dá para editar, só excluir e recriar",
    };
  }
  return { ok: true };
}

/**
 * Garante que o adiantamento existe, ainda não teve parcela descontada em folha
 * e o lançamento dele (se já existir) não tem pagamento comprometido (parcela
 * aprovada, paga ou conciliada). Trava de EXCLUIR: diferente de editar,
 * excluir um adiantamento limpo (com lançamento ainda pendente) continua
 * válido — é o `fn_excluir_adiantamento` que apaga os dois juntos. As duas
 * checagens vão por RPC security definer e fail-closed (`fn_adiantamento_em_folha`
 * e `fn_adiantamento_pagamento_comprometido`) porque um perfil
 * só-rh.adiantamentos não enxerga `lancamento_parcelas`/`extrato_transacoes`
 * pela RLS deles, e um perfil sem `ver` não enxerga as parcelas do adiantamento.
 */
async function garantirExcluivel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
): Promise<ResultadoAcao> {
  const { data, error } = await supabase
    .from(TABELA)
    .select("lancamento_id")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return erroAcao(
      "rh.adiantamentos.garantirExcluivel",
      error,
      "Não foi possível carregar o adiantamento",
    );
  }
  if (!data) return { erro: "Adiantamento não encontrado" };

  const foraDeFolha = await garantirForaDeFolha(
    supabase,
    id,
    "rh.adiantamentos.garantirExcluivel",
  );
  if ("erro" in foraDeFolha) return foraDeFolha;

  if (data.lancamento_id !== null) {
    const { data: comprometido, error: erroComprometido } = await supabase.rpc(
      "fn_adiantamento_pagamento_comprometido",
      { p_lancamento_id: data.lancamento_id },
    );

    if (erroComprometido) {
      return erroAcao(
        "rh.adiantamentos.garantirExcluivel",
        erroComprometido,
        "Não foi possível conferir o pagamento do adiantamento",
      );
    }
    if (comprometido) {
      return {
        erro:
          "O pagamento deste adiantamento já foi aprovado, pago ou conciliado. Estorne o pagamento antes de excluir",
      };
    }
  }
  return { ok: true };
}

/**
 * Cria um adiantamento. Vai pela RPC `fn_registrar_adiantamento`, que grava o
 * adiantamento, o lançamento a_pagar dele (no centro de custo do colaborador)
 * e o plano de parcelas do desconto na mesma transação: um insert direto
 * seguido de outra chamada deixaria um dos três órfão se a segunda falhasse.
 *
 * `parcelas` é só a QUANTIDADE: quem divide o valor é o servidor, que refaz a
 * conta de `dividirEmParcelas` em centavos. A prévia da tela é informativa.
 */
export async function criarAdiantamento(
  dados: AdiantamentoInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Sem permissão para criar adiantamentos" };
  }

  const validado = adiantamentoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_registrar_adiantamento", {
    p_dados: {
      colaborador_id: validado.data.colaboradorId,
      competencia: validado.data.competencia,
      valor: validado.data.valor,
      data: validado.data.data,
      descricao: validado.data.descricao ?? null,
      parcelas: validado.data.parcelas,
    },
  });

  if (error) {
    return erroAcao(
      "rh.adiantamentos.criar",
      error,
      mensagemDeNegocio(
        error,
        "Não foi possível salvar o adiantamento. Tente novamente",
      ),
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Edita um adiantamento. Só funciona enquanto ele não tem lançamento — como
 * todo adiantamento nasce com um (via `fn_registrar_adiantamento`), na
 * prática não há mais janela para editar depois de criado: corrigir um
 * valor ou uma data é excluir e recriar. Ver `garantirEditavel`.
 */
export async function editarAdiantamento(
  id: string,
  dados: AdiantamentoInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar adiantamentos" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Adiantamento inválido" };

  const validado = adiantamentoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();

  const aberto = await garantirEditavel(supabase, idValido.data);
  if ("erro" in aberto) return aberto;

  const { error } = await supabase
    .from(TABELA)
    .update({
      colaborador_id: validado.data.colaboradorId,
      competencia: validado.data.competencia,
      valor: validado.data.valor,
      data: validado.data.data,
      descricao: validado.data.descricao ?? null,
    })
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "rh.adiantamentos.editar",
      error,
      "Não foi possível salvar o adiantamento. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Junta as parcelas em aberto do adiantamento numa só, na competência
 * informada, preservando o total. Vai pela RPC `fn_quitar_adiantamento`
 * (definer), que é quem pode escrever em `rh_adiantamento_parcelas`:
 * `authenticated` só tem SELECT naquela tabela.
 *
 * Não usa `garantirEditavel`: quitar não é editar o adiantamento. Todo
 * adiantamento nasce com lançamento (o dinheiro já saiu inteiro na concessão) e
 * ter parcela já descontada em folha é justamente o caso normal de quem tem
 * saldo para quitar. As travas de quitação são as três da própria função: folha
 * aprovada, folha em aprovação e nenhuma parcela em aberto.
 *
 * As mensagens das três recusas são `raise exception` nossos (SQLSTATE P0001),
 * então `mensagemDeNegocio` as entrega ao usuário; qualquer outro código de erro
 * vira mensagem genérica e vai só pro log.
 */
export async function quitarAdiantamento(
  id: string,
  competencia: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para quitar adiantamentos" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Adiantamento inválido" };

  const competenciaValida = competenciaSchema.safeParse(competencia);
  if (!competenciaValida.success) {
    return { erro: "Competência inválida" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_quitar_adiantamento", {
    p_adiantamento: idValido.data,
    p_competencia: competenciaValida.data,
  });

  if (error) {
    return erroAcao(
      "rh.adiantamentos.quitar",
      error,
      mensagemDeNegocio(
        error,
        "Não foi possível quitar o adiantamento. Tente novamente",
      ),
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Remove um adiantamento. Bloqueia se já entrou numa folha ou tem pagamento
 * comprometido. Vai pela RPC `fn_excluir_adiantamento`, que apaga o
 * adiantamento e o lançamento dele junto, na mesma transação: por isso não é
 * mais um `.delete()` direto na tabela (que só apagaria o adiantamento e
 * deixaria o lançamento órfão).
 */
export async function removerAdiantamento(id: string): Promise<ResultadoAcao> {
  if (!(await checarPermissao("excluir"))) {
    return { erro: "Sem permissão para excluir adiantamentos" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Adiantamento inválido" };

  const supabase = await createClient();

  const aberto = await garantirExcluivel(supabase, idValido.data);
  if ("erro" in aberto) return aberto;

  const { error } = await supabase.rpc("fn_excluir_adiantamento", {
    p_id: idValido.data,
  });

  if (error) {
    return erroAcao(
      "rh.adiantamentos.remover",
      error,
      mensagemDeNegocio(
        error,
        "Não foi possível excluir o adiantamento. Tente novamente",
      ),
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}
