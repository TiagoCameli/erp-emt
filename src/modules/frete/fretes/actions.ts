"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { EventoTrilha } from "@/components/canonicos";
import { erroAcao, logErroServidor, semLancar, textoDoErro } from "@/lib/erros";
import { dataHojeISO } from "@/lib/formatadores";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { contarAnexosPorDocumento, listarAnexosDoDocumento, type AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import { traduzirErroFrete } from "@/modules/frete/fretes/erros";
import { filtrarFretes, lerFiltrosFretes } from "@/modules/frete/fretes/filtros";
import { listarFretes, nomesDeUsuarios, lerChegadaDoFrete, trilhaDoFrete } from "@/modules/frete/fretes/queries";
import { dadosDaRpc, dataIsoValida, freteSchema, type FreteInput } from "@/modules/frete/fretes/schemas";

/**
 * Mutações da aba Fretes (`frete.fretes`).
 *
 * Permissão tripla: a RPC checa `tem_permissao` no banco (a tabela nem tem grant de
 * escrita), aqui `exigirPermissao`, e a tela esconde o botão. Nenhuma action lança:
 * tudo volta `{ erro }`.
 */

const RECURSO = "frete.fretes" as const;
const ROTAS = ["/frete/fretes", "/frete", "/frete/conta-corrente", "/frete/anomalias"];

export type ResultadoAcao = { ok: true } | { erro: string };

const motivoSchema = z.string().trim().min(1);

async function temAcao(acao: "ver" | "criar" | "editar" | "excluir"): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

/** Restaurar pede editar a Lixeira E excluir na aba (a `fn_frete_restaurar` confere as duas). */
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
      logErroServidor("frete.fretes.revalidar", erro);
    }
  }
}

/** Cria (id nulo) ou edita um frete pela `fn_frete_salvar`. Devolve o id (para os anexos). */
export async function salvarFrete(
  id: string | null,
  dados: FreteInput,
): Promise<{ ok: true; id: string } | { erro: string }> {
  return semLancar("frete.fretes.salvar", async () => {
    const criando = id === null;
    if (!(await temAcao(criando ? "criar" : "editar"))) {
      return { erro: criando ? "Sem permissão para lançar frete" : "Sem permissão para editar frete" };
    }
    if (!criando && !idSchema.safeParse(id).success) return { erro: "Frete inválido" };

    const validado = freteSchema.safeParse(dados);
    if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_frete_salvar", {
      // Os tipos gerados não aceitam null nos argumentos; a RPC aceita.
      p_id: id as unknown as string,
      p_dados: { ...dadosDaRpc(validado.data) },
    });
    if (error) {
      return erroAcao(
        "frete.fretes.salvar",
        error,
        traduzirErroFrete(error, "Não foi possível salvar o frete. Tente novamente"),
      );
    }

    revalidar();
    return { ok: true as const, id: (data as string | null) ?? (id as string) };
  });
}

/** Data de chegada editada na lista ou no detalhe (vazia limpa). Sem senha, como a origem. */
export async function registrarChegada(id: string, data: string | null): Promise<ResultadoAcao> {
  return semLancar("frete.fretes.chegada", async () => {
    if (!(await temAcao("editar"))) return { erro: "Sem permissão para editar frete" };
    if (!idSchema.safeParse(id).success) return { erro: "Frete inválido" };
    const dia = data && data.trim() !== "" ? data.trim() : null;
    if (dia !== null && !dataIsoValida(dia)) return { erro: "Data de chegada inválida" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_frete_registrar_chegada", {
      p_id: id,
      p_data: dia as unknown as string,
    });
    if (error) {
      return erroAcao(
        "frete.fretes.chegada",
        error,
        traduzirErroFrete(error, "Falha ao salvar a data de chegada. Tente novamente"),
      );
    }
    revalidar();
    return { ok: true };
  });
}

/**
 * A primeira foto da chegada preenche a data de chegada quando ela está vazia
 * (utils/freteFotoChegada.ts). A origem usava a data UTC; aqui é o dia de Rio Branco.
 * Confere no servidor: só grava se o frete tem foto da chegada e não tem data.
 */
export async function registrarChegadaPelaFoto(
  id: string,
): Promise<{ ok: true; dataChegada: string | null } | { erro: string }> {
  return semLancar("frete.fretes.chegadaPelaFoto", async () => {
    if (!(await temAcao("editar"))) return { erro: "Sem permissão para editar frete" };
    if (!idSchema.safeParse(id).success) return { erro: "Frete inválido" };

    const frete = await lerChegadaDoFrete(id);
    if (!frete) return { erro: "Frete não encontrado ou excluído" };
    if (frete.dataChegada) return { ok: true as const, dataChegada: frete.dataChegada };

    const fotos = await contarAnexosPorDocumento("frete_chegada", [id]);
    if (!(fotos[id] > 0)) return { ok: true as const, dataChegada: null };

    const hoje = dataHojeISO();
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_frete_registrar_chegada", { p_id: id, p_data: hoje });
    if (error) {
      return erroAcao(
        "frete.fretes.chegadaPelaFoto",
        error,
        traduzirErroFrete(error, "A foto subiu, mas a data de chegada não foi gravada. Tente de novo"),
      );
    }
    revalidar();
    return { ok: true as const, dataChegada: hoje };
  });
}

/** Exclui (lixeira do módulo, com motivo). O movimento da conta corrente sai junto. */
export async function excluirFrete(id: string, motivo: string): Promise<ResultadoAcao> {
  return semLancar("frete.fretes.excluir", async () => {
    if (!(await temAcao("excluir"))) return { erro: "Sem permissão para excluir frete" };
    if (!idSchema.safeParse(id).success) return { erro: "Frete inválido" };
    const motivoValido = motivoSchema.safeParse(motivo);
    if (!motivoValido.success) return { erro: "Informe o motivo da exclusão" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_frete_excluir", {
      p_tabela: "fretes",
      p_id: id,
      p_motivo: motivoValido.data,
    });
    if (error) {
      return erroAcao("frete.fretes.excluir", error, traduzirErroFrete(error, "Erro ao excluir frete. Tente novamente"));
    }
    revalidar();
    return { ok: true };
  });
}

/** Tira o frete da lixeira; o crédito na conta corrente volta. */
export async function restaurarFrete(id: string): Promise<ResultadoAcao> {
  return semLancar("frete.fretes.restaurar", async () => {
    if (!(await podeRestaurar())) return { erro: "Sem permissão para restaurar itens da lixeira" };
    if (!idSchema.safeParse(id).success) return { erro: "Frete inválido" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_frete_restaurar", { p_tabela: "fretes", p_id: id });
    if (error) {
      return erroAcao(
        "frete.fretes.restaurar",
        error,
        traduzirErroFrete(error, "Falha ao restaurar. Tente novamente"),
      );
    }
    revalidar();
    return { ok: true };
  });
}

export interface DetalheFrete {
  anexosChegada: AnexoDoDocumento[];
  anexosFrete: AnexoDoDocumento[];
  trilha: EventoTrilha[];
  criadoPorNome: string | null;
  alteradoPorNome: string | null;
}

/** O que o detalhe carrega sob demanda: fotos da chegada, arquivos, histórico e os nomes. */
export async function carregarDetalheFrete(
  id: string,
  usuarios: { criadoPor: string | null; alteradoPor: string | null },
): Promise<DetalheFrete | { erro: string }> {
  return semLancar("frete.fretes.detalhe", async () => {
    if (!(await temAcao("ver"))) return { erro: "Sem permissão para ver fretes" };
    if (!idSchema.safeParse(id).success) return { erro: "Frete inválido" };
    const idsUsuarios = [usuarios.criadoPor, usuarios.alteradoPor].filter(
      (u): u is string => typeof u === "string" && idSchema.safeParse(u).success,
    );
    const [anexosChegada, anexosFrete, trilha, nomes] = await Promise.all([
      listarAnexosDoDocumento("frete_chegada", id),
      listarAnexosDoDocumento("frete", id),
      trilhaDoFrete(id),
      nomesDeUsuarios(idsUsuarios),
    ]);
    return {
      anexosChegada,
      anexosFrete,
      trilha,
      criadoPorNome: usuarios.criadoPor ? (nomes[usuarios.criadoPor] ?? null) : null,
      alteradoPorNome: usuarios.alteradoPor ? (nomes[usuarios.alteradoPor] ?? null) : null,
    };
  });
}

export type ResultadoPlanilhaFretes = { ok: true; base64: string; nomeArquivo: string } | { erro: string };

const parametrosSchema = z.record(z.string(), z.string());

/**
 * "Exportar Excel" da aba (utils/freteExport.ts da origem): os mesmos filtros da lista,
 * menos o "Sem chegada" (a origem não aplica). Exportar é ler: pede `frete.fretes/ver`.
 *
 * Roda na função da PÁGINA, que declara `maxDuration`. O módulo da planilha entra por
 * `await import`: ele puxa o exceljs, e import de topo pesado derruba todas as actions
 * do módulo.
 */
export async function gerarPlanilhaFretes(parametros: unknown): Promise<ResultadoPlanilhaFretes> {
  if (!(await temAcao("ver"))) return { erro: "Sem permissão para exportar fretes" };
  const validado = parametrosSchema.safeParse(parametros ?? {});
  if (!validado.success) return { erro: "Filtros inválidos" };

  try {
    const filtros = { ...lerFiltrosFretes(validado.data), semChegada: false, excluidos: false };
    const fretes = filtrarFretes(await listarFretes(), filtros);
    const planilha = await import("@/modules/frete/fretes/planilha");
    const workbook = planilha.montarPlanilhaFretes(fretes, filtros, dataHojeISO());
    const conteudo = await workbook.xlsx.writeBuffer();
    return {
      ok: true,
      base64: Buffer.from(conteudo).toString("base64"),
      nomeArquivo: planilha.nomeArquivoFretes(dataHojeISO()),
    };
  } catch (erro) {
    return erroAcao("frete.fretes.gerarPlanilha", erro, `Não foi possível gerar a planilha: ${textoDoErro(erro)}`);
  }
}
