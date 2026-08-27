"use server";

import { revalidatePath } from "next/cache";

import { erroAcao } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  cartaoDoTextoRapido,
  cartaoSchema,
  type CartaoInput,
} from "@/modules/cadastros/cartoes/schemas";

const RECURSO = "cadastros.cartoes" as const;
const ROTA = "/cadastros/cartoes";

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoCriacao = { ok: true; id: string } | { erro: string };

const ERRO_NOME_DUPLICADO = "Já existe um cartão com este nome";

/** Dia em texto vira número, e vazio vira null (não zero). */
function diaParaBanco(valor: string): number | null {
  const limpo = valor.trim();
  return limpo === "" ? null : Number(limpo);
}

/**
 * Argumentos da RPC.
 *
 * Os parâmetros aceitam null em runtime (a função os declara sem DEFAULT e trata
 * o nulo), mas o tipo gerado não sabe disso: regenerar `database.types.ts` apaga
 * qualquer nota que se escreva lá. O cast fica aqui, onde sobrevive.
 */
function argumentos(id: string | null, dados: CartaoInput) {
  return {
    p_id: id as unknown as string,
    p_nome: dados.nome,
    p_ultimos_digitos: dados.ultimosDigitos,
    p_bandeira: (dados.bandeira || null) as unknown as string,
    p_banco: (dados.banco || null) as unknown as string,
    p_dia_fechamento: diaParaBanco(dados.diaFechamento) as unknown as number,
    p_dia_vencimento: diaParaBanco(dados.diaVencimento) as unknown as number,
    p_ativo: dados.ativo,
  };
}

/**
 * As rotas revalidadas: o cadastro em si, e as duas telas onde o cartão é
 * escolhido. Sem elas, o cartão criado agora não aparece no combo da OC até o
 * próximo hard refresh — que foi como o fornecedor novo sumia antes de 26/08.
 */
function revalidarTudo(): void {
  revalidatePath(ROTA);
  revalidatePath("/compras/ordens");
  revalidatePath("/financeiro/lancamentos");
}

/**
 * Cria um cartão de crédito. A escrita passa pela RPC fn_salvar_cartao_credito
 * (security definer): não há grant de INSERT nem UPDATE em `cartoes_credito`
 * para o client, e a RPC revalida a permissão e normaliza os dígitos.
 */
export async function criarCartao(
  dados: CartaoInput,
): Promise<ResultadoCriacao> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para criar cartões de crédito" };
  }

  const validado = cartaoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc(
    "fn_salvar_cartao_credito",
    argumentos(null, validado.data),
  );

  if (error || !id) {
    if (error?.code === "23505") return { erro: ERRO_NOME_DUPLICADO };
    return erroAcao(
      "cadastros.cartoes.criarCartao",
      error,
      error?.message || "Não foi possível salvar o cartão. Tente novamente",
    );
  }

  revalidarTudo();
  return { ok: true, id };
}

/**
 * Edita um cartão. Trocar os dígitos NÃO reescreve o histórico: os documentos
 * apontam para o id do cartão, então corrigir um final digitado errado corrige
 * tudo que já saiu por ele — que é o comportamento certo, porque é o mesmo
 * cartão físico.
 */
export async function editarCartao(
  id: string,
  dados: CartaoInput,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para editar cartões de crédito" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Cartão inválido" };

  const validado = cartaoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "fn_salvar_cartao_credito",
    argumentos(idValido.data, validado.data),
  );

  if (error) {
    if (error.code === "23505") return { erro: ERRO_NOME_DUPLICADO };
    return erroAcao(
      "cadastros.cartoes.editarCartao",
      error,
      error.message || "Não foi possível salvar o cartão. Tente novamente",
    );
  }

  revalidarTudo();
  return { ok: true };
}

/**
 * Cadastro rápido a partir da OC ou do lançamento, a partir do texto digitado no
 * combo.
 *
 * O mínimo para não abandonar a compra no meio. Bandeira, banco e os dias ficam
 * para depois, em Cadastros: são dados de conferência de fatura, e ninguém os
 * tem à mão lançando uma compra. Mesmo caminho do fornecedor rápido, criado em
 * 27/08/2026 pela mesma razão.
 *
 * O texto precisa trazer os quatro dígitos, porque é o que identifica o cartão e
 * não há de onde inferir: "Cartão obra 7712" vira nome "Cartão obra 7712" com
 * final 7712, e "7712" sozinho vira "Cartão 7712". Sem quatro dígitos no texto,
 * a criação é recusada com a instrução — melhor do que nascer um cartão que não
 * identifica nada.
 */
export async function criarCartaoRapido(
  texto: string,
): Promise<ResultadoCriacao> {
  const cartao = cartaoDoTextoRapido(texto);
  if (!cartao) {
    return {
      erro: "Inclua os quatro últimos dígitos no nome. Exemplo: Cartão obra 4829",
    };
  }

  return criarCartao({
    nome: cartao.nome,
    ultimosDigitos: cartao.ultimosDigitos,
    bandeira: "",
    banco: "",
    diaFechamento: "",
    diaVencimento: "",
    ativo: true,
  });
}
