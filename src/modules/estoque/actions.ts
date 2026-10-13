"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao, logErroServidor, semLancar } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { traduzirErroEstoque } from "@/modules/estoque/erros";
import { entradaSchema, saidaSchema, type EntradaInput, type SaidaInput } from "@/modules/estoque/schemas";

/**
 * Mutações das abas Entradas (`estoque.entradas`) e Saídas (`estoque.saidas`).
 *
 * Permissão tripla: a RPC checa `tem_permissao` no banco (as tabelas nem têm grant de
 * escrita), aqui `exigirPermissao`, e a tela esconde o botão. Nenhuma action lança:
 * tudo volta `{ erro }`. Saldo insuficiente, OC sem saldo do item e centro inativo
 * chegam à tela com o texto do banco. Nada aqui toca o Financeiro.
 */

type Aba = "estoque.entradas" | "estoque.saidas";
type Tabela = "estoque_entradas" | "estoque_saidas";

const ROTAS = ["/estoque/entradas", "/estoque/saidas", "/estoque/posicao"];

export type ResultadoAcao = { ok: true } | { erro: string };

const motivoSchema = z.string().trim().min(1);

async function temAcao(recurso: Aba, acao: "criar" | "editar" | "excluir"): Promise<boolean> {
  try {
    await exigirPermissao(recurso, acao);
    return true;
  } catch {
    return false;
  }
}

/** Depois do commit nada vira falha: revalidar que lança só vai para o log. */
function revalidar(): void {
  for (const rota of ROTAS) {
    try {
      revalidatePath(rota);
    } catch (erro) {
      logErroServidor("estoque.revalidar", erro);
    }
  }
}

/** Cria (id nulo) ou edita uma entrada, avulsa ou de item de OC. */
export async function salvarEntrada(id: string | null, dados: EntradaInput): Promise<ResultadoAcao> {
  return semLancar("estoque.entradas.salvar", async () => {
    const criando = id === null;
    if (!(await temAcao("estoque.entradas", criando ? "criar" : "editar"))) {
      return { erro: criando ? "Sem permissão para registrar entrada" : "Sem permissão para editar entrada" };
    }
    if (!criando && !idSchema.safeParse(id).success) return { erro: "Entrada inválida" };

    const validado = entradaSchema.safeParse(dados);
    if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
    const d = validado.data;

    const supabase = await createClient();
    // Os tipos gerados não aceitam null nos argumentos; a RPC aceita (p_id nulo = criar,
    // item de OC nulo = avulsa, insumo e valor nulos = os da OC; depósito OU tanque).
    const { error } = await supabase.rpc("fn_estoque_salvar_entrada", {
      p_id: id as unknown as string,
      p_deposito: d.depositoId as unknown as string,
      p_tanque: d.tanqueId as unknown as string,
      p_insumo: d.insumoId as unknown as string,
      p_quantidade: d.quantidade,
      p_valor_unitario: d.valorUnitario as unknown as number,
      p_data: d.data,
      p_oc_item: d.ocItemId ?? undefined,
      p_nota_fiscal: d.notaFiscal ?? undefined,
      p_observacoes: d.observacoes ?? undefined,
    });

    if (error) {
      return erroAcao(
        "estoque.entradas.salvar",
        error,
        traduzirErroEstoque(error, "Não foi possível salvar a entrada. Tente novamente"),
      );
    }

    revalidar();
    return { ok: true };
  });
}

/** Cria (id nulo) ou edita uma saída. O custo é o PEPS das entradas, calculado no banco. */
export async function salvarSaida(id: string | null, dados: SaidaInput): Promise<ResultadoAcao> {
  return semLancar("estoque.saidas.salvar", async () => {
    const criando = id === null;
    if (!(await temAcao("estoque.saidas", criando ? "criar" : "editar"))) {
      return { erro: criando ? "Sem permissão para registrar saída" : "Sem permissão para editar saída" };
    }
    if (!criando && !idSchema.safeParse(id).success) return { erro: "Saída inválida" };

    const validado = saidaSchema.safeParse(dados);
    if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
    const d = validado.data;

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_estoque_salvar_saida", {
      p_id: id as unknown as string,
      p_deposito: d.depositoId as unknown as string,
      p_tanque: d.tanqueId as unknown as string,
      p_insumo: d.insumoId,
      p_quantidade: d.quantidade,
      p_data: d.data,
      p_centro_custo: d.centroCustoId,
      p_observacoes: d.observacoes ?? undefined,
    });

    if (error) {
      return erroAcao(
        "estoque.saidas.salvar",
        error,
        traduzirErroEstoque(error, "Não foi possível salvar a saída. Tente novamente"),
      );
    }

    revalidar();
    return { ok: true };
  });
}

const ABA_DA_TABELA: Record<Tabela, Aba> = {
  estoque_entradas: "estoque.entradas",
  estoque_saidas: "estoque.saidas",
};

const NOME_DA_TABELA: Record<Tabela, string> = {
  estoque_entradas: "entrada",
  estoque_saidas: "saída",
};

/** Exclui com motivo. O PEPS é refeito; se uma saída dependia da entrada, o banco recusa. */
export async function excluirMovimento(tabela: Tabela, id: string, motivo: string): Promise<ResultadoAcao> {
  return semLancar(`estoque.${tabela}.excluir`, async () => {
    const nome = NOME_DA_TABELA[tabela];
    if (!nome) return { erro: "Movimento inválido" };
    if (!(await temAcao(ABA_DA_TABELA[tabela], "excluir"))) return { erro: `Sem permissão para excluir ${nome}` };
    if (!idSchema.safeParse(id).success) return { erro: "Movimento inválido" };
    const motivoValido = motivoSchema.safeParse(motivo);
    if (!motivoValido.success) return { erro: "Informe o motivo da exclusão" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_estoque_excluir", {
      p_tabela: tabela,
      p_id: id,
      p_motivo: motivoValido.data,
    });
    if (error) {
      return erroAcao(
        `estoque.${tabela}.excluir`,
        error,
        traduzirErroEstoque(error, `Não foi possível excluir a ${nome}. Tente novamente`),
      );
    }

    revalidar();
    return { ok: true };
  });
}

/** Volta da lixeira. Pede a mesma permissão de excluir; o PEPS é refeito e pode recusar. */
export async function restaurarMovimento(tabela: Tabela, id: string): Promise<ResultadoAcao> {
  return semLancar(`estoque.${tabela}.restaurar`, async () => {
    const nome = NOME_DA_TABELA[tabela];
    if (!nome) return { erro: "Movimento inválido" };
    if (!(await temAcao(ABA_DA_TABELA[tabela], "excluir"))) return { erro: `Sem permissão para restaurar ${nome}` };
    if (!idSchema.safeParse(id).success) return { erro: "Movimento inválido" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_estoque_restaurar", { p_tabela: tabela, p_id: id });
    if (error) {
      return erroAcao(
        `estoque.${tabela}.restaurar`,
        error,
        traduzirErroEstoque(error, `Não foi possível restaurar a ${nome}. Tente novamente`),
      );
    }

    revalidar();
    return { ok: true };
  });
}
