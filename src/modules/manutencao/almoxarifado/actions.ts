"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao, semLancar } from "@/lib/erros";
import { mensagemDeNegocio } from "@/lib/erros-banco";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { traduzErroExclusao } from "@/modules/cadastros/_shared/exclusao";
import {
  ERRO_DEPOSITO_REPETIDO,
  ERRO_PECA_REPETIDA,
  ehRepetido,
  traduzErroEntrada,
} from "@/modules/manutencao/almoxarifado/erros";
import {
  depositoSchema,
  edicaoEntradaSchema,
  entradaSchema,
  itensParaRpc,
  pecaSchema,
  type DepositoInput,
  type EdicaoEntradaInput,
  type EntradaInput,
  type PecaInput,
} from "@/modules/manutencao/almoxarifado/schemas";

/**
 * Mutações do almoxarifado de peças (`manutencao.almoxarifado`).
 *
 * Permissão tripla: a RLS e as RPCs checam `tem_permissao` no banco, aqui
 * `exigirPermissao`, e a tela esconde o botão. Nenhuma action lança: tudo volta
 * `{ erro }` (o `semLancar` é a rede para o que escapar).
 *
 * Entradas só por RPC (a tabela não tem grant de escrita). Depósito e peça são
 * cadastro com RLS, gravados direto na tabela.
 */

const RECURSO = "manutencao.almoxarifado" as const;
const ROTA = "/manutencao/almoxarifado";
const ROTA_ENTRADAS = `${ROTA}/entradas`;
const ROTA_DEPOSITOS = `${ROTA}/depositos`;
const ROTA_PECAS = `${ROTA}/pecas`;

export type ResultadoAcao = { ok: true } | { erro: string };

const motivoSchema = z.string().trim().min(1);

/** Primeira mensagem do zod, para o toast. */
function primeiraMensagem(erro: z.ZodError): string {
  return erro.issues[0]?.message ?? "Dados inválidos";
}

/** Garante a permissão sem deixar o throw do `exigirPermissao` escapar. */
async function temAcao(
  acao: "criar" | "editar" | "excluir",
): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

/**
 * Revalida as telas afetadas. Depois do commit nada pode virar falha: se a
 * revalidação estourar, o registro já foi gravado e a tela recarrega sozinha
 * na próxima navegação.
 */
function revalidar(...rotas: string[]) {
  for (const rota of rotas) {
    try {
      revalidatePath(rota);
    } catch {
      // Ver comentário acima: o sucesso já aconteceu.
    }
  }
}

// ---------------------------------------------------------------------------
// Depósitos
// ---------------------------------------------------------------------------

function linhaDeposito(dados: DepositoInput) {
  return {
    nome: dados.nome,
    endereco: dados.endereco === "" ? null : dados.endereco,
    ativo: dados.ativo,
  };
}

export async function criarDeposito(dados: DepositoInput): Promise<ResultadoAcao> {
  return semLancar("manutencao.almoxarifado.criarDeposito", async () => {
    if (!(await temAcao("criar"))) return { erro: "Sem permissão para criar depósitos" };

    const validado = depositoSchema.safeParse(dados);
    if (!validado.success) return { erro: primeiraMensagem(validado.error) };

    const supabase = await createClient();
    const { error } = await supabase
      .from("almoxarifado_depositos")
      .insert(linhaDeposito(validado.data));

    if (error) {
      if (ehRepetido(error)) return { erro: ERRO_DEPOSITO_REPETIDO };
      return erroAcao(
        "manutencao.almoxarifado.criarDeposito",
        error,
        "Não foi possível salvar o depósito. Tente novamente",
      );
    }

    revalidar(ROTA_DEPOSITOS, ROTA, ROTA_ENTRADAS);
    return { ok: true };
  });
}

export async function editarDeposito(
  id: string,
  dados: DepositoInput,
): Promise<ResultadoAcao> {
  return semLancar("manutencao.almoxarifado.editarDeposito", async () => {
    if (!(await temAcao("editar"))) return { erro: "Sem permissão para editar depósitos" };

    const idValido = idSchema.safeParse(id);
    if (!idValido.success) return { erro: "Depósito inválido" };

    const validado = depositoSchema.safeParse(dados);
    if (!validado.success) return { erro: primeiraMensagem(validado.error) };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("almoxarifado_depositos")
      .update(linhaDeposito(validado.data))
      .eq("id", idValido.data)
      .select("id");

    if (error) {
      if (ehRepetido(error)) return { erro: ERRO_DEPOSITO_REPETIDO };
      return erroAcao(
        "manutencao.almoxarifado.editarDeposito",
        error,
        "Não foi possível salvar o depósito. Tente novamente",
      );
    }
    if (!data || data.length === 0) return { erro: "Depósito não encontrado" };

    revalidar(ROTA_DEPOSITOS, ROTA, ROTA_ENTRADAS);
    return { ok: true };
  });
}

export async function alternarAtivoDeposito(
  id: string,
  ativo: boolean,
): Promise<ResultadoAcao> {
  return semLancar("manutencao.almoxarifado.alternarAtivoDeposito", async () => {
    if (!(await temAcao("editar"))) return { erro: "Sem permissão para editar depósitos" };

    const idValido = idSchema.safeParse(id);
    if (!idValido.success) return { erro: "Depósito inválido" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("almoxarifado_depositos")
      .update({ ativo })
      .eq("id", idValido.data)
      .select("id");

    if (error) {
      return erroAcao(
        "manutencao.almoxarifado.alternarAtivoDeposito",
        error,
        "Não foi possível alterar o status. Tente novamente",
      );
    }
    if (!data || data.length === 0) return { erro: "Depósito não encontrado" };

    revalidar(ROTA_DEPOSITOS, ROTA_ENTRADAS);
    return { ok: true };
  });
}

/** Move o depósito para a lixeira, com motivo. Em uso (FK) não sai. */
export async function excluirDeposito(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  return semLancar("manutencao.almoxarifado.excluirDeposito", async () => {
    if (!(await temAcao("excluir"))) return { erro: "Sem permissão para excluir depósitos" };

    const idValido = idSchema.safeParse(id);
    if (!idValido.success) return { erro: "Depósito inválido" };

    const motivoValido = motivoSchema.safeParse(motivo);
    if (!motivoValido.success) return { erro: "Informe o motivo da exclusão" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_excluir_cadastro", {
      p_tabela: "almoxarifado_depositos",
      p_id: idValido.data,
      p_motivo: motivoValido.data,
    });

    if (error) {
      // A FK recusa depósito com entrada, saída ou saldo (23503): vira "em uso".
      const emUso = traduzErroExclusao(
        error.code === "23503" ? { message: "foreign key" } : error,
      );
      return erroAcao(
        "manutencao.almoxarifado.excluirDeposito",
        error,
        emUso ?? mensagemDeNegocio(error, "Não foi possível excluir o depósito. Tente novamente"),
      );
    }

    revalidar(ROTA_DEPOSITOS, ROTA, ROTA_ENTRADAS);
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Peças (almoxarifado_itens)
// ---------------------------------------------------------------------------

function linhaPeca(dados: PecaInput) {
  return {
    insumo_id: dados.insumoId,
    tipo_oleo_id: dados.tipoOleoId,
    estoque_minimo: dados.estoqueMinimo,
    estoque_maximo: dados.estoqueMaximo,
    equipamento_ids: dados.equipamentoIds,
    observacoes: dados.observacoes,
    ativo: dados.ativo,
  };
}

export async function criarPeca(dados: PecaInput): Promise<ResultadoAcao> {
  return semLancar("manutencao.almoxarifado.criarPeca", async () => {
    if (!(await temAcao("criar"))) return { erro: "Sem permissão para cadastrar peças" };

    const validado = pecaSchema.safeParse(dados);
    if (!validado.success) return { erro: primeiraMensagem(validado.error) };

    const supabase = await createClient();
    const { error } = await supabase
      .from("almoxarifado_itens")
      .insert(linhaPeca(validado.data));

    if (error) {
      if (ehRepetido(error)) return { erro: ERRO_PECA_REPETIDA };
      return erroAcao(
        "manutencao.almoxarifado.criarPeca",
        error,
        "Não foi possível salvar a peça. Tente novamente",
      );
    }

    revalidar(ROTA_PECAS, ROTA);
    return { ok: true };
  });
}

export async function editarPeca(id: string, dados: PecaInput): Promise<ResultadoAcao> {
  return semLancar("manutencao.almoxarifado.editarPeca", async () => {
    if (!(await temAcao("editar"))) return { erro: "Sem permissão para editar peças" };

    const idValido = idSchema.safeParse(id);
    if (!idValido.success) return { erro: "Peça inválida" };

    const validado = pecaSchema.safeParse(dados);
    if (!validado.success) return { erro: primeiraMensagem(validado.error) };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("almoxarifado_itens")
      .update(linhaPeca(validado.data))
      .eq("id", idValido.data)
      .select("id");

    if (error) {
      if (ehRepetido(error)) return { erro: ERRO_PECA_REPETIDA };
      return erroAcao(
        "manutencao.almoxarifado.editarPeca",
        error,
        "Não foi possível salvar a peça. Tente novamente",
      );
    }
    if (!data || data.length === 0) return { erro: "Peça não encontrada" };

    revalidar(ROTA_PECAS, ROTA);
    return { ok: true };
  });
}

export async function alternarAtivoPeca(id: string, ativo: boolean): Promise<ResultadoAcao> {
  return semLancar("manutencao.almoxarifado.alternarAtivoPeca", async () => {
    if (!(await temAcao("editar"))) return { erro: "Sem permissão para editar peças" };

    const idValido = idSchema.safeParse(id);
    if (!idValido.success) return { erro: "Peça inválida" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("almoxarifado_itens")
      .update({ ativo })
      .eq("id", idValido.data)
      .select("id");

    if (error) {
      return erroAcao(
        "manutencao.almoxarifado.alternarAtivoPeca",
        error,
        "Não foi possível alterar o status. Tente novamente",
      );
    }
    if (!data || data.length === 0) return { erro: "Peça não encontrada" };

    revalidar(ROTA_PECAS);
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Entradas (só por RPC)
// ---------------------------------------------------------------------------

/** Registra uma NF com N itens numa chamada só da `fn_almox_registrar_entrada`. */
export async function registrarEntrada(
  dados: EntradaInput,
): Promise<{ ok: true; itens: number } | { erro: string }> {
  return semLancar("manutencao.almoxarifado.registrarEntrada", async () => {
    if (!(await temAcao("criar"))) return { erro: "Sem permissão para registrar entradas" };

    const validado = entradaSchema.safeParse(dados);
    if (!validado.success) return { erro: primeiraMensagem(validado.error) };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_almox_registrar_entrada", {
      p_deposito: validado.data.depositoId,
      p_fornecedor: validado.data.fornecedorId,
      p_nota_fiscal: validado.data.notaFiscal,
      p_data: validado.data.data,
      p_itens: itensParaRpc(validado.data.itens),
      p_observacoes: validado.data.observacoes,
    });

    if (error) {
      return erroAcao(
        "manutencao.almoxarifado.registrarEntrada",
        error,
        mensagemDeNegocio(error, "Não foi possível registrar a entrada. Tente novamente"),
      );
    }

    revalidar(ROTA_ENTRADAS, ROTA);
    return { ok: true, itens: typeof data === "number" ? data : validado.data.itens.length };
  });
}

/** Edita uma linha de entrada. A trava de saldo do banco recusa se já foi usada. */
export async function editarEntrada(
  id: string,
  dados: EdicaoEntradaInput,
): Promise<ResultadoAcao> {
  return semLancar("manutencao.almoxarifado.editarEntrada", async () => {
    if (!(await temAcao("editar"))) return { erro: "Sem permissão para editar entradas" };

    const idValido = idSchema.safeParse(id);
    if (!idValido.success) return { erro: "Entrada inválida" };

    const validado = edicaoEntradaSchema.safeParse(dados);
    if (!validado.success) return { erro: primeiraMensagem(validado.error) };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_almox_editar_entrada", {
      p_id: idValido.data,
      p_quantidade: validado.data.quantidade,
      p_valor_unitario: validado.data.valorUnitario,
      p_data: validado.data.data,
      p_nota_fiscal: validado.data.notaFiscal,
      p_fornecedor: validado.data.fornecedorId,
    });

    if (error) {
      return erroAcao(
        "manutencao.almoxarifado.editarEntrada",
        error,
        traduzErroEntrada(error, "Não foi possível salvar a entrada. Tente novamente"),
      );
    }

    revalidar(ROTA_ENTRADAS, ROTA);
    return { ok: true };
  });
}

/** Exclui (soft delete) uma linha de entrada, com motivo. */
export async function excluirEntrada(id: string, motivo: string): Promise<ResultadoAcao> {
  return semLancar("manutencao.almoxarifado.excluirEntrada", async () => {
    if (!(await temAcao("excluir"))) return { erro: "Sem permissão para excluir entradas" };

    const idValido = idSchema.safeParse(id);
    if (!idValido.success) return { erro: "Entrada inválida" };

    const motivoValido = motivoSchema.safeParse(motivo);
    if (!motivoValido.success) return { erro: "Informe o motivo da exclusão" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_almox_excluir_entrada", {
      p_id: idValido.data,
      p_motivo: motivoValido.data,
    });

    if (error) {
      return erroAcao(
        "manutencao.almoxarifado.excluirEntrada",
        error,
        traduzErroEntrada(error, "Não foi possível excluir a entrada. Tente novamente"),
      );
    }

    revalidar(ROTA_ENTRADAS, ROTA);
    return { ok: true };
  });
}
