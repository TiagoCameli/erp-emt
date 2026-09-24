"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { EventoTrilha } from "@/components/canonicos";
import { erroAcao, logErroServidor, semLancar } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { type ColunaImportacao, lerEValidarXlsx } from "@/lib/importacao";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { traduzirErroFrete } from "@/modules/frete/pagamentos/erros";
import {
  COLUNAS_PAGAMENTOS,
  lerLinhaPagamento,
  type LinhaCruaPagamento,
} from "@/modules/frete/pagamentos/importacao";
import { listarTransportadoras, trilhaDoRegistro } from "@/modules/frete/pagamentos/queries";
import { pDadosDoPagamento, type DadosPagamento } from "@/modules/frete/pagamentos/regras";
import { pagamentoSchema } from "@/modules/frete/pagamentos/schemas";

/**
 * Mutações da aba Pagamentos de frete (`frete.pagamentos`).
 *
 * Permissão tripla: a RPC confere `tem_permissao` no banco (a tabela nem tem grant de
 * escrita), aqui `exigirPermissao`, e a tela esconde o botão. Na origem os botões Editar e
 * Excluir da lista usavam as chaves do frete (`editar_frete`, `excluir_frete`); no ERP cada
 * aba tem o seu recurso, e é ele que vale nos três lugares.
 *
 * O pagamento debita a conta corrente da transportadora pelo gatilho do banco. Não gera
 * lançamento no Financeiro (decisão f do plano).
 */

const RECURSO = "frete.pagamentos" as const;
const TABELA = "frete_pagamentos";
const ROTAS = ["/frete/pagamentos", "/frete", "/frete/conta-corrente"];

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoSalvar = { ok: true; id: string } | { erro: string };

const motivoSchema = z.string().trim().min(1);

async function temAcao(acao: "criar" | "editar" | "excluir"): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

/** Restaurar pede editar a Lixeira E excluir na aba (o mesmo que a `fn_frete_restaurar` confere). */
async function podeRestaurar(): Promise<boolean> {
  try {
    await exigirPermissao("administracao.lixeira", "editar");
    await exigirPermissao(RECURSO, "excluir");
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
      logErroServidor("frete.pagamentos.revalidar", erro);
    }
  }
}

/** Cria (id nulo) ou edita um pagamento pela `fn_frete_pagamento_salvar`. */
export async function salvarPagamento(id: string | null, dados: DadosPagamento): Promise<ResultadoSalvar> {
  return semLancar("frete.pagamentos.salvar", async () => {
    const criando = id === null;
    if (!(await temAcao(criando ? "criar" : "editar"))) {
      return { erro: criando ? "Sem permissão para registrar pagamento" : "Sem permissão para editar pagamento" };
    }
    if (!criando && !idSchema.safeParse(id).success) return { erro: "Pagamento inválido" };

    const validado = pagamentoSchema.safeParse(dados);
    if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_frete_pagamento_salvar", {
      // Os tipos gerados não aceitam null nos argumentos; a RPC aceita.
      p_id: id as unknown as string,
      p_dados: pDadosDoPagamento(validado.data),
    });
    if (error) {
      return erroAcao(
        "frete.pagamentos.salvar",
        error,
        traduzirErroFrete(error, "Não foi possível salvar o pagamento. Tente novamente"),
      );
    }

    revalidar();
    return { ok: true, id: data ?? id ?? "" };
  });
}

/** Exclui (lixeira, com motivo). O gatilho tira o débito da conta corrente. */
export async function excluirPagamento(id: string, motivo: string): Promise<ResultadoAcao> {
  return semLancar("frete.pagamentos.excluir", async () => {
    if (!(await temAcao("excluir"))) return { erro: "Sem permissão para excluir pagamento" };
    if (!idSchema.safeParse(id).success) return { erro: "Pagamento inválido" };
    const motivoValido = motivoSchema.safeParse(motivo);
    if (!motivoValido.success) return { erro: "Informe o motivo da exclusão" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_frete_excluir", {
      p_tabela: TABELA,
      p_id: id,
      p_motivo: motivoValido.data,
    });
    if (error) {
      return erroAcao(
        "frete.pagamentos.excluir",
        error,
        traduzirErroFrete(error, "Não foi possível excluir o pagamento. Tente novamente"),
      );
    }
    revalidar();
    return { ok: true };
  });
}

/** Tira da lixeira (`fn_frete_restaurar`). O gatilho recria o débito. */
export async function restaurarPagamento(id: string): Promise<ResultadoAcao> {
  return semLancar("frete.pagamentos.restaurar", async () => {
    if (!(await podeRestaurar())) return { erro: "Sem permissão para restaurar pagamento" };
    if (!idSchema.safeParse(id).success) return { erro: "Pagamento inválido" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_frete_restaurar", { p_tabela: TABELA, p_id: id });
    if (error) {
      return erroAcao(
        "frete.pagamentos.restaurar",
        error,
        traduzirErroFrete(error, "Não foi possível restaurar o pagamento. Tente novamente"),
      );
    }
    revalidar();
    return { ok: true };
  });
}

/** Trilha do detalhe. Vazia para quem não vê a Auditoria. */
export async function carregarTrilhaPagamento(id: string): Promise<EventoTrilha[]> {
  try {
    await exigirPermissao(RECURSO, "ver");
    if (!idSchema.safeParse(id).success) return [];
    return await trilhaDoRegistro(TABELA, id, "Pagamento", "m");
  } catch (erro) {
    logErroServidor("frete.pagamentos.trilha", erro);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Importação
// ---------------------------------------------------------------------------

const COLUNAS_IMPORT: ColunaImportacao<LinhaCruaPagamento>[] = COLUNAS_PAGAMENTOS.map((c) => ({
  chave: c.chave,
  rotulo: c.rotulo,
}));

interface LinhaPronta {
  linha: number;
  dados: DadosPagamento;
}

interface PlanilhaLida {
  prontas: LinhaPronta[];
  invalidas: { linha: number; erros: string[] }[];
  totalLinhas: number;
}

async function lerPlanilha(formData: FormData): Promise<PlanilhaLida> {
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File)) throw new Error("Nenhum arquivo enviado");
  const resultado = await lerEValidarXlsx<LinhaCruaPagamento>(Buffer.from(await arquivo.arrayBuffer()), COLUNAS_IMPORT);
  const cadastro = (await listarTransportadoras()).map((t) => ({ id: t.id, nomes: t.nomes }));

  const prontas: LinhaPronta[] = [];
  const invalidas = resultado.invalidas.map((l) => ({ linha: l.linha, erros: l.erros }));
  for (const linha of resultado.validas) {
    const lida = lerLinhaPagamento(linha.dados, cadastro);
    if (lida.dados) prontas.push({ linha: linha.linha, dados: lida.dados });
    else invalidas.push({ linha: linha.linha, erros: lida.erros });
  }
  invalidas.sort((a, b) => a.linha - b.linha);
  return { prontas, invalidas, totalLinhas: resultado.totalLinhas };
}

export interface ResumoImportacao {
  validas: number;
  invalidas: { linha: number; erros: string[] }[];
  totalLinhas: number;
}

/** Prévia. Não lança: falha de leitura volta como linha recusada. */
export async function validarImportPagamentos(formData: FormData): Promise<ResumoImportacao> {
  try {
    await exigirPermissao(RECURSO, "criar");
    const lida = await lerPlanilha(formData);
    return { validas: lida.prontas.length, invalidas: lida.invalidas, totalLinhas: lida.totalLinhas };
  } catch (erro) {
    logErroServidor("frete.pagamentos.validarImport", erro);
    const mensagem = erro instanceof Error && erro.message ? erro.message : "Não foi possível ler a planilha";
    return { validas: 0, invalidas: [{ linha: 1, erros: [mensagem] }], totalLinhas: 0 };
  }
}

export type ResultadoImportacao =
  | { importadas: number; falhas: { linha: number; erro: string }[] }
  | { erro: string };

/**
 * Grava as linhas válidas uma a uma pela mesma RPC do formulário (como a origem, em
 * sequência). Uma linha que o banco recusa não derruba as outras: volta em `falhas` com o
 * número da linha e o motivo.
 */
export async function importarPagamentos(formData: FormData): Promise<ResultadoImportacao> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para importar pagamentos" };
  }

  let lida: PlanilhaLida;
  try {
    lida = await lerPlanilha(formData);
  } catch (erro) {
    return erroAcao(
      "frete.pagamentos.importar",
      erro,
      erro instanceof Error && erro.message ? erro.message : "Não foi possível ler a planilha",
    );
  }
  if (lida.prontas.length === 0) return { erro: "Nenhuma linha válida para importar" };

  const supabase = await createClient();
  let importadas = 0;
  const falhas: { linha: number; erro: string }[] = [];
  for (const pronta of lida.prontas) {
    try {
      const { error } = await supabase.rpc("fn_frete_pagamento_salvar", {
        p_id: null as unknown as string,
        p_dados: pDadosDoPagamento(pronta.dados),
      });
      if (error) {
        logErroServidor("frete.pagamentos.importar", error);
        falhas.push({ linha: pronta.linha, erro: traduzirErroFrete(error, "Não foi possível gravar a linha") });
      } else importadas += 1;
    } catch (erro) {
      logErroServidor("frete.pagamentos.importar", erro);
      falhas.push({ linha: pronta.linha, erro: "Não foi possível gravar a linha" });
    }
  }

  if (importadas > 0) revalidar();
  return { importadas, falhas };
}
