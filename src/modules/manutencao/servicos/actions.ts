"use server";

import { revalidatePath } from "next/cache";

import { erroAcao, logErroServidor, semLancar } from "@/lib/erros";
import type { ErroDeBanco } from "@/lib/erros-banco";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { traduzirErroOs } from "@/modules/manutencao/servicos/erros";
import {
  concluirSchema,
  motivoSchema,
  oleoSchema,
  osSalvarSchema,
  pecaSchema,
  removerLinhaSchema,
  terceiroSchema,
  type ConcluirInput,
  type OleoInput,
  type OsSalvarInput,
  type PecaInput,
  type RemoverLinhaInput,
  type TerceiroInput,
} from "@/modules/manutencao/servicos/schemas";

/**
 * Mutações da OS. Toda escrita passa por RPC SECURITY DEFINER com
 * `tem_permissao` (a tabela nem tem grant de escrita); aqui é a segunda camada da
 * permissão tripla. Nenhuma action lança: tudo volta como `{ erro }`, porque
 * exceção de Server Action morre calada na tela.
 *
 * Custo não sai daqui. As RPCs de linha baixam o almoxarifado com o custo médio
 * do banco e o gatilho recalcula o custo da OS.
 */

const RECURSO = "manutencao.servicos" as const;
const ROTA_LISTA = "/manutencao/servicos";
const ROTA_PAINEL = "/manutencao";

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoSalvar = { ok: true; id: string } | { erro: string };

/**
 * Invalida a lista, o painel e o DETALHE CONCRETO da OS. `revalidatePath` da
 * lista não alcança `/manutencao/servicos/[id]`: a gravação daria certo e o
 * detalhe mostraria o custo velho, sem erro nenhum.
 *
 * Depois do commit nada vira falha: se invalidar lançar, loga e segue. Cache
 * velho é melhor que dizer "não foi concluído" sobre o que foi.
 */
function revalidarTelasDaOs(osId: string | null): void {
  try {
    revalidatePath(ROTA_LISTA);
    revalidatePath(ROTA_PAINEL);
    if (osId) revalidatePath(`${ROTA_LISTA}/${osId}`);
  } catch (erro) {
    logErroServidor("manutencao.servicos.revalidar", erro);
  }
}

async function comPermissao(acao: "criar" | "editar" | "excluir", mensagem: string): Promise<{ erro: string } | null> {
  try {
    await exigirPermissao(RECURSO, acao);
    return null;
  } catch {
    return { erro: mensagem };
  }
}

function falhaDoBanco(contexto: string, erro: ErroDeBanco, fallback: string): { erro: string } {
  return erroAcao(contexto, erro, traduzirErroOs(erro, fallback));
}

function primeiraMensagem(issues: { message: string }[]): string {
  return issues[0]?.message ?? "Dados inválidos";
}

// ---------------------------------------------------------------------------
// Cabeçalho
// ---------------------------------------------------------------------------

/** Cria (id nulo) ou edita o cabeçalho da OS. Devolve o id para a tela navegar. */
export async function salvarOs(id: string | null, dados: OsSalvarInput): Promise<ResultadoSalvar> {
  return semLancar("manutencao.servicos.salvar", async () => {
    const semPermissao = await comPermissao(
      id === null ? "criar" : "editar",
      id === null ? "Sem permissão para abrir ordem de serviço" : "Sem permissão para editar ordem de serviço",
    );
    if (semPermissao) return semPermissao;

    if (id !== null && !idSchema.safeParse(id).success) return { erro: "OS inválida" };
    const validado = osSalvarSchema.safeParse(dados);
    if (!validado.success) return { erro: primeiraMensagem(validado.error.issues) };
    const d = validado.data;

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_os_salvar", {
      // Os tipos gerados não aceitam null nos argumentos; a RPC aceita.
      p_id: id as unknown as string,
      p_equipamento: d.equipamentoId,
      p_centro_custo: d.centroCustoId as unknown as string,
      p_tipo: d.tipo,
      p_prioridade: d.prioridade,
      p_descricao: d.descricao,
      p_defeito: d.defeitoReportado as unknown as string,
      p_causa: d.causaRaiz as unknown as string,
      p_observacoes: d.observacoes as unknown as string,
      p_data_abertura: d.dataAbertura,
      p_medicao_abertura: d.medicaoAbertura as unknown as number,
      p_origem: "manual",
    });

    if (error) {
      return falhaDoBanco("manutencao.servicos.salvar", error, "Não foi possível salvar a OS. Tente novamente");
    }
    const osId = typeof data === "string" ? data : id;
    if (!osId) return { erro: "A OS foi salva, mas o banco não devolveu o número. Recarregue a lista" };

    revalidarTelasDaOs(osId);
    return { ok: true as const, id: osId };
  });
}

// ---------------------------------------------------------------------------
// Transições
// ---------------------------------------------------------------------------

export async function iniciarOs(osId: string): Promise<ResultadoAcao> {
  return semLancar("manutencao.servicos.iniciar", async () => {
    const semPermissao = await comPermissao("editar", "Sem permissão para iniciar a OS");
    if (semPermissao) return semPermissao;
    if (!idSchema.safeParse(osId).success) return { erro: "OS inválida" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_os_iniciar", { p_os: osId });
    if (error) return falhaDoBanco("manutencao.servicos.iniciar", error, "Não foi possível iniciar a OS");

    revalidarTelasDaOs(osId);
    return { ok: true as const };
  });
}

export async function concluirOs(osId: string, dados: ConcluirInput): Promise<ResultadoAcao> {
  return semLancar("manutencao.servicos.concluir", async () => {
    const semPermissao = await comPermissao("editar", "Sem permissão para concluir a OS");
    if (semPermissao) return semPermissao;
    if (!idSchema.safeParse(osId).success) return { erro: "OS inválida" };
    const validado = concluirSchema.safeParse(dados);
    if (!validado.success) return { erro: primeiraMensagem(validado.error.issues) };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_os_concluir", {
      p_os: osId,
      p_data_conclusao: validado.data.dataConclusao,
      p_medicao_conclusao: validado.data.medicaoConclusao as unknown as number,
    });
    if (error) return falhaDoBanco("manutencao.servicos.concluir", error, "Não foi possível concluir a OS");

    revalidarTelasDaOs(osId);
    return { ok: true as const };
  });
}

/** Reabrir, cancelar e excluir: mesma forma, com motivo obrigatório. */
async function transicaoComMotivo(
  contexto: string,
  acao: "editar" | "excluir",
  rpc: "fn_os_reabrir" | "fn_os_cancelar" | "fn_os_excluir",
  osId: string,
  motivo: string,
  mensagens: { permissao: string; fallback: string },
): Promise<ResultadoAcao> {
  return semLancar(contexto, async () => {
    const semPermissao = await comPermissao(acao, mensagens.permissao);
    if (semPermissao) return semPermissao;
    if (!idSchema.safeParse(osId).success) return { erro: "OS inválida" };
    const motivoValido = motivoSchema.safeParse(motivo);
    if (!motivoValido.success) return { erro: primeiraMensagem(motivoValido.error.issues) };

    const supabase = await createClient();
    const { error } = await supabase.rpc(rpc, { p_os: osId, p_motivo: motivoValido.data });
    if (error) return falhaDoBanco(contexto, error, mensagens.fallback);

    revalidarTelasDaOs(osId);
    return { ok: true as const };
  });
}

export async function reabrirOs(osId: string, motivo: string): Promise<ResultadoAcao> {
  return transicaoComMotivo("manutencao.servicos.reabrir", "editar", "fn_os_reabrir", osId, motivo, {
    permissao: "Sem permissão para reabrir a OS",
    fallback: "Não foi possível reabrir a OS",
  });
}

export async function cancelarOs(osId: string, motivo: string): Promise<ResultadoAcao> {
  return transicaoComMotivo("manutencao.servicos.cancelar", "editar", "fn_os_cancelar", osId, motivo, {
    permissao: "Sem permissão para cancelar a OS",
    fallback: "Não foi possível cancelar a OS",
  });
}

export async function excluirOs(osId: string, motivo: string): Promise<ResultadoAcao> {
  return transicaoComMotivo("manutencao.servicos.excluir", "excluir", "fn_os_excluir", osId, motivo, {
    permissao: "Sem permissão para excluir OS",
    fallback: "Não foi possível excluir a OS",
  });
}

// ---------------------------------------------------------------------------
// Linhas
// ---------------------------------------------------------------------------

export async function adicionarPeca(dados: PecaInput): Promise<ResultadoAcao> {
  return semLancar("manutencao.servicos.adicionarPeca", async () => {
    const semPermissao = await comPermissao("editar", "Sem permissão para lançar peça na OS");
    if (semPermissao) return semPermissao;
    const validado = pecaSchema.safeParse(dados);
    if (!validado.success) return { erro: primeiraMensagem(validado.error.issues) };
    const d = validado.data;

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_os_adicionar_peca", {
      p_os: d.osId,
      p_insumo: d.insumoId,
      p_deposito: d.depositoId,
      p_quantidade: d.quantidade,
      p_observacoes: d.observacoes ?? undefined,
    });
    if (error) return falhaDoBanco("manutencao.servicos.adicionarPeca", error, "Não foi possível lançar a peça");

    revalidarTelasDaOs(d.osId);
    return { ok: true as const };
  });
}

export async function adicionarOleo(dados: OleoInput): Promise<ResultadoAcao> {
  return semLancar("manutencao.servicos.adicionarOleo", async () => {
    const semPermissao = await comPermissao("editar", "Sem permissão para lançar óleo na OS");
    if (semPermissao) return semPermissao;
    const validado = oleoSchema.safeParse(dados);
    if (!validado.success) return { erro: primeiraMensagem(validado.error.issues) };
    const d = validado.data;

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_os_adicionar_oleo", {
      p_os: d.osId,
      p_tipo_oleo: d.tipoOleoId,
      p_insumo: d.insumoId,
      p_deposito: d.depositoId,
      p_quantidade: d.quantidade,
      p_unidade: d.unidade,
    });
    if (error) return falhaDoBanco("manutencao.servicos.adicionarOleo", error, "Não foi possível lançar o óleo");

    revalidarTelasDaOs(d.osId);
    return { ok: true as const };
  });
}

export async function adicionarTerceiro(dados: TerceiroInput): Promise<ResultadoAcao> {
  return semLancar("manutencao.servicos.adicionarTerceiro", async () => {
    const semPermissao = await comPermissao("editar", "Sem permissão para lançar serviço de terceiro na OS");
    if (semPermissao) return semPermissao;
    const validado = terceiroSchema.safeParse(dados);
    if (!validado.success) return { erro: primeiraMensagem(validado.error.issues) };
    const d = validado.data;

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_os_adicionar_terceiro", {
      p_os: d.osId,
      p_fornecedor: d.fornecedorId,
      p_descricao: d.descricao,
      p_valor: d.valor,
      p_nota_fiscal: d.notaFiscal ?? undefined,
    });
    if (error) {
      return falhaDoBanco("manutencao.servicos.adicionarTerceiro", error, "Não foi possível lançar o serviço de terceiro");
    }

    revalidarTelasDaOs(d.osId);
    return { ok: true as const };
  });
}

/** Tira a linha; peça e óleo estornam a saída do almoxarifado no banco. */
export async function removerLinha(dados: RemoverLinhaInput): Promise<ResultadoAcao> {
  return semLancar("manutencao.servicos.removerLinha", async () => {
    const semPermissao = await comPermissao("editar", "Sem permissão para remover linha da OS");
    if (semPermissao) return semPermissao;
    const validado = removerLinhaSchema.safeParse(dados);
    if (!validado.success) return { erro: primeiraMensagem(validado.error.issues) };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_os_remover_linha", {
      p_tipo: validado.data.tipo,
      p_linha: validado.data.linhaId,
    });
    if (error) return falhaDoBanco("manutencao.servicos.removerLinha", error, "Não foi possível remover a linha");

    revalidarTelasDaOs(validado.data.osId);
    return { ok: true as const };
  });
}
