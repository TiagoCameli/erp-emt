"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao, logErroServidor, semLancar } from "@/lib/erros";
import { mensagemDeNegocio } from "@/lib/erros-banco";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { listarCentrosCusto, type CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import { traduzErroExclusao } from "@/modules/cadastros/_shared/exclusao";
import { codificarLocal } from "@/modules/estoque/calculo";
import { traduzirErroEstoque } from "@/modules/estoque/erros";
import { pilhaSchema, type PilhaInput } from "@/modules/estoque/pilhas/schemas";
import { enderecoParaColocar } from "@/modules/mapa/colocar-na-criacao";

/**
 * Cadastro das pilhas (`estoque.pilhas`). A tela grava nome, insumo e observações (grant por
 * coluna; o insumo só troca enquanto a pilha não tem movimento); entrada e saída são as do Estoque, e o status muda sozinho no banco.
 * Nenhuma action lança: tudo volta `{ erro }`.
 */

const RECURSO = "estoque.pilhas" as const;
const ROTAS = ["/estoque/pilhas", "/estoque/entradas", "/estoque/saidas", "/estoque/posicao", "/estoque/movimentacoes"];

/** `id` e `mapa` só na criação: o endereço que abre o /mapa para marcar o lugar da pilha. */
export type ResultadoAcao = { ok: true; id?: string; mapa?: string | null } | { erro: string };

const motivoSchema = z.string().trim().min(1);

async function temAcao(acao: "criar" | "editar" | "excluir"): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
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
      logErroServidor("estoque.pilhas.revalidar", erro);
    }
  }
}

function linhaPilha(dados: PilhaInput) {
  return {
    nome: dados.nome,
    insumo_id: dados.insumoId,
    localidade_id: dados.localidadeId,
    observacoes: dados.observacoes === "" ? null : dados.observacoes,
  };
}

const CHECK_VIOLADO = "23514";

/** As travas do banco (insumo inativo, insumo de outro módulo, troca com movimento) já falam português. */
function erroDeSalvar(error: { code?: string; message?: string }): string {
  if (error.code === CHECK_VIOLADO) {
    return error.message?.includes("localidade") ? "Escolha o local da pilha" : "Escolha o insumo da pilha";
  }
  return traduzirErroEstoque(error, "Não foi possível salvar a pilha. Tente novamente");
}

export async function criarPilha(dados: PilhaInput): Promise<ResultadoAcao> {
  return semLancar("estoque.pilhas.criar", async () => {
    if (!(await temAcao("criar"))) return { erro: "Sem permissão para criar pilhas" };

    const validado = pilhaSchema.safeParse(dados);
    if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };

    const supabase = await createClient();
    const { data: nova, error } = await supabase
      .from("estoque_pilhas")
      .insert(linhaPilha(validado.data))
      .select("id")
      .single();
    if (error) return erroAcao("estoque.pilhas.criar", error, erroDeSalvar(error));

    revalidar();
    return { ok: true, id: nova.id, mapa: await enderecoParaColocar("pilha", nova.id) };
  });
}

export async function editarPilha(id: string, dados: PilhaInput): Promise<ResultadoAcao> {
  return semLancar("estoque.pilhas.editar", async () => {
    if (!(await temAcao("editar"))) return { erro: "Sem permissão para editar pilhas" };

    const idValido = idSchema.safeParse(id);
    if (!idValido.success) return { erro: "Pilha inválida" };

    const validado = pilhaSchema.safeParse(dados);
    if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("estoque_pilhas")
      .update(linhaPilha(validado.data))
      .eq("id", idValido.data)
      .select("id");
    if (error) return erroAcao("estoque.pilhas.editar", error, erroDeSalvar(error));
    if (!data || data.length === 0) return { erro: "Pilha não encontrada" };

    revalidar();
    return { ok: true };
  });
}

/** Lixeira, com motivo. Pilha que já teve entrada ou saída está em uso: a FK recusa. */
export async function excluirPilha(id: string, motivo: string): Promise<ResultadoAcao> {
  return semLancar("estoque.pilhas.excluir", async () => {
    if (!(await temAcao("excluir"))) return { erro: "Sem permissão para excluir pilhas" };

    const idValido = idSchema.safeParse(id);
    if (!idValido.success) return { erro: "Pilha inválida" };
    const motivoValido = motivoSchema.safeParse(motivo);
    if (!motivoValido.success) return { erro: "Informe o motivo da exclusão" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_excluir_cadastro", {
      p_tabela: "estoque_pilhas",
      p_id: idValido.data,
      p_motivo: motivoValido.data,
    });
    if (error) {
      const emUso = traduzErroExclusao(error.code === "23503" ? { message: "foreign key" } : error);
      return erroAcao(
        "estoque.pilhas.excluir",
        error,
        emUso ?? mensagemDeNegocio(error, "Não foi possível excluir a pilha. Tente novamente"),
      );
    }

    revalidar();
    return { ok: true };
  });
}

/** O que o Mapa precisa para abrir a entrada avulsa ou a saída já na pilha tocada. */
export type DadosMovimentoPilha =
  | {
      ok: true;
      /** `codificarLocal("pilha", id)`. */
      local: string;
      nome: string;
      insumo: { id: string; nome: string; unidade: string | null };
      saldo: number;
      /** Só para quem registra saída; vazio para quem só dá entrada. */
      centros: CentroCustoOpcao[];
    }
  | { erro: string };

async function temAcaoEm(recurso: "estoque.entradas" | "estoque.saidas"): Promise<boolean> {
  try {
    await exigirPermissao(recurso, "criar");
    return true;
  } catch {
    return false;
  }
}

/**
 * Carregado ao clicar no card da pilha no Mapa, não junto com o Mapa: a tela já é pesada e os
 * centros de custo só interessam a quem registra a saída. Quem decide é a action de salvar.
 */
export async function carregarMovimentoDaPilha(id: string): Promise<DadosMovimentoPilha> {
  return semLancar("estoque.pilhas.movimento", async (): Promise<DadosMovimentoPilha> => {
    const [entrada, saida] = await Promise.all([temAcaoEm("estoque.entradas"), temAcaoEm("estoque.saidas")]);
    if (!entrada && !saida) return { erro: "Sem permissão para registrar entrada ou saída" };
    const idValido = idSchema.safeParse(id);
    if (!idValido.success) return { erro: "Pilha inválida" };

    const supabase = await createClient();
    const [{ data, error }, centros] = await Promise.all([
      supabase
        .from("estoque_pilhas")
        .select("id, nome, saldo, insumo_id, insumos(nome, unidades_medida(sigla))")
        .eq("id", idValido.data)
        .maybeSingle(),
      saida ? listarCentrosCusto() : Promise.resolve<CentroCustoOpcao[]>([]),
    ]);
    if (error) return erroAcao("estoque.pilhas.movimento", error, "Não foi possível carregar a pilha. Tente novamente");
    if (!data) return { erro: "Pilha não encontrada" };
    if (!data.insumo_id) return { erro: "Esta pilha está sem material: escolha o insumo dela no Estoque, aba Pilhas" };

    return {
      ok: true,
      local: codificarLocal("pilha", data.id),
      nome: data.nome,
      insumo: {
        id: data.insumo_id,
        nome: data.insumos?.nome ?? "",
        unidade: data.insumos?.unidades_medida?.sigla ?? null,
      },
      saldo: Number(data.saldo),
      centros,
    };
  });
}
