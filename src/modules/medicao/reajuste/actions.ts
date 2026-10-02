"use server";

import { revalidatePath } from "next/cache";

import { lerBinario } from "@/lib/arquivos";
import { erroAcao, semLancar } from "@/lib/erros";
import { mensagemDeNegocio } from "@/lib/erros-banco";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/database.types";
import { dataPtBr } from "@/modules/medicao/alertas/formato";
import { chaveLinha, sugerirDePara, type Casamento } from "@/modules/medicao/reajuste/de-para";
import { casamentosSalvos, itensParaCasar, medicaoParaReajuste, pdfDaMedicao } from "@/modules/medicao/reajuste/queries";
import { configSchema, escolhasSchema, manualSchema, type ConfigReajusteInput, type ManualInput } from "@/modules/medicao/reajuste/schemas";
import {
  conferirRelatorio,
  ErroRelatorioSiac,
  lerRelatorioSiac,
  type RelatorioSiac,
} from "@/modules/medicao/reajuste/siac/ler-relatorio";
import { relatorioParaBanco } from "@/modules/medicao/reajuste/siac/para-banco";
import type { Escolhas, LeituraSiac, PreviaReajuste } from "@/modules/medicao/reajuste/tipos";

/**
 * Actions do reajuste (Fase 6). Todas exigem `medicao.reajuste/editar` antes de ir ao banco; a RPC
 * confere de novo permissão, contrato (D3), status da medição e as somas, e a recusa dela (P0001,
 * pt-BR) volta como está. O PDF é lido no SERVIDOR a cada prévia e gravação: da tela só vêm os ids
 * e as escolhas de itens, nunca um número (como na importação da planilha). O dinheiro (rateio,
 * diferença) é do banco (D7).
 */

const RECURSO = "medicao.reajuste" as const;
const SEM_PERMISSAO_IMPORTAR = "Sem permissão para importar reajuste";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type ErroBanco = { code?: string; message?: string } | null;

async function pode(): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, "editar");
    return true;
  } catch {
    return false;
  }
}

function revalidar(rotas: string[]): void {
  try {
    for (const r of rotas) revalidatePath(r);
  } catch {
    // O sucesso já aconteceu.
  }
}

function rotasDaMedicao(medicaoId: string): string[] {
  return [`/medicao/medicoes/${medicaoId}`, "/medicao/reajuste", "/medicao/boletim", "/medicao/painel", "/medicao/alertas"];
}

function idValido(id: unknown): id is string {
  return idSchema.safeParse(id).success;
}

type Lido = { erro: string } | { relatorio: RelatorioSiac; medicao: NonNullable<Awaited<ReturnType<typeof medicaoParaReajuste>>> };

/**
 * Baixa o PDF anexado à medição, extrai o texto (pdf.js, importado sob demanda: se ele falhar, cai
 * só este botão, como o PDF da folha), monta o relatório e confere as somas. Não chama a RPC.
 */
async function lerRelatorioDaMedicao(medicaoId: string, arquivoId: string): Promise<Lido> {
  const medicao = await medicaoParaReajuste(medicaoId); // RLS: fora da lista = null
  if (!medicao) return { erro: "Medição não encontrada" };
  const pdf = await pdfDaMedicao(medicaoId, arquivoId);
  if (!pdf) return { erro: "O PDF não está anexado a esta medição" };
  const binario = await lerBinario(pdf.path);
  if ("erro" in binario) return { erro: binario.erro };

  let relatorio: RelatorioSiac;
  try {
    const bytes = new Uint8Array(await binario.blob.arrayBuffer());
    const { extrairTextoPdf } = await import("@/modules/medicao/reajuste/siac/extrair");
    relatorio = lerRelatorioSiac(await extrairTextoPdf(bytes));
  } catch (erro) {
    if (erro instanceof ErroRelatorioSiac) return { erro: erro.message };
    return erroAcao("medicao.reajuste.lerPdf", erro, "Não foi possível ler o PDF do relatório. Tente novamente");
  }

  const problemas = conferirRelatorio(relatorio);
  if (problemas.length > 0) return { erro: `O relatório não fecha: ${problemas.join("; ")}` };
  return { relatorio, medicao };
}

async function chamarImportar(
  supabase: Supabase,
  medicaoId: string,
  relatorio: RelatorioSiac,
  escolhas: Escolhas,
  arquivoId: string,
  gravar: boolean,
): Promise<{ data: unknown; error: ErroBanco }> {
  const r = await supabase.rpc("fn_mc_reajuste_importar", {
    p_medicao: medicaoId,
    p_relatorio: relatorioParaBanco(relatorio, escolhas, arquivoId) as unknown as Json,
    p_gravar: gravar,
  });
  return { data: r.data, error: r.error };
}

/**
 * Lê o PDF do SIAC anexado à medição e devolve a prévia: cabeçalho, avisos (período diferente do
 * da medição), o de-para (salvo ou sugerido) e a resposta da RPC com `p_gravar = false`.
 */
export async function lerPdfSiac(medicaoId: string, arquivoId: string): Promise<LeituraSiac | { erro: string }> {
  return semLancar("medicao.reajuste.lerPdfSiac", async (): Promise<LeituraSiac | { erro: string }> => {
    if (!(await pode())) return { erro: SEM_PERMISSAO_IMPORTAR };
    if (!idValido(medicaoId)) return { erro: "Medição inválida" };
    if (!idValido(arquivoId)) return { erro: "PDF inválido" };

    const lido = await lerRelatorioDaMedicao(medicaoId, arquivoId);
    if ("erro" in lido) return lido;
    const { relatorio, medicao } = lido;

    const avisos: string[] = [];
    const c = relatorio.cabecalho;
    if (c.periodoInicio !== medicao.periodoInicio || c.periodoFim !== medicao.periodoFim) {
      avisos.push(
        `O relatório é do período ${dataPtBr(c.periodoInicio)} a ${dataPtBr(c.periodoFim)} e a medição de ${dataPtBr(medicao.periodoInicio)} a ${dataPtBr(medicao.periodoFim)}`,
      );
    }

    const [candidatos, salvos] = await Promise.all([itensParaCasar(medicaoId), casamentosSalvos(medicao.contratoId)]);
    const sugestao = sugerirDePara(relatorio.linhas, candidatos, salvos);
    const escolhas: Escolhas = {};
    const origem: Record<string, Casamento["origem"]> = {};
    const conferir: string[] = [];
    for (const l of relatorio.linhas) {
      const chave = chaveLinha(l.grupo, l.codigo);
      const s = sugestao.get(chave);
      if (!s) continue;
      escolhas[chave] = { itens: s.itens, destino: null };
      origem[chave] = s.origem;
      if (s.conferir) conferir.push(chave);
    }

    const supabase = await createClient();
    const { data, error } = await chamarImportar(supabase, medicaoId, relatorio, escolhas, arquivoId, false);
    if (error) return erroAcao("medicao.reajuste.lerPdfSiac", error, mensagemDeNegocio(error, "Não foi possível montar a prévia do reajuste. Tente novamente"));
    return { ok: true as const, cabecalho: c, avisos, escolhas, origem, conferir, candidatos, previa: data as PreviaReajuste };
  });
}

async function importar(
  contexto: string,
  falha: string,
  medicaoId: string,
  arquivoId: string,
  escolhasBrutas: Escolhas,
  gravar: boolean,
): Promise<{ ok: true; previa: PreviaReajuste } | { erro: string }> {
  if (!(await pode())) return { erro: SEM_PERMISSAO_IMPORTAR };
  if (!idValido(medicaoId)) return { erro: "Medição inválida" };
  if (!idValido(arquivoId)) return { erro: "PDF inválido" };
  const escolhas = escolhasSchema.safeParse(escolhasBrutas);
  if (!escolhas.success) return { erro: "Escolhas de itens inválidas" };

  const lido = await lerRelatorioDaMedicao(medicaoId, arquivoId);
  if ("erro" in lido) return lido;

  const supabase = await createClient();
  const { data, error } = await chamarImportar(supabase, medicaoId, lido.relatorio, escolhas.data, arquivoId, gravar);
  if (error) return erroAcao(contexto, error, mensagemDeNegocio(error, falha));
  return { ok: true as const, previa: data as PreviaReajuste };
}

/** Prévia com as escolhas da tela (toda troca de item passa por aqui; nenhuma conta na tela). */
export async function previaReajuste(
  medicaoId: string,
  arquivoId: string,
  escolhas: Escolhas,
): Promise<{ ok: true; previa: PreviaReajuste } | { erro: string }> {
  return semLancar("medicao.reajuste.previa", () =>
    importar("medicao.reajuste.previa", "Não foi possível montar a prévia do reajuste. Tente novamente", medicaoId, arquivoId, escolhas, false),
  );
}

/** Grava o relatório (sequência nº+1), as linhas, o rateio e o de-para; `p_gravar = true`. */
export async function gravarReajuste(
  medicaoId: string,
  arquivoId: string,
  escolhas: Escolhas,
): Promise<{ ok: true; relatorioId: string; previa: PreviaReajuste } | { erro: string }> {
  return semLancar("medicao.reajuste.gravar", async () => {
    const r = await importar("medicao.reajuste.gravar", "Não foi possível gravar o reajuste. Tente novamente", medicaoId, arquivoId, escolhas, true);
    if ("erro" in r) return r;
    revalidar(rotasDaMedicao(medicaoId));
    return { ok: true as const, relatorioId: r.previa.relatorio_id ?? "", previa: r.previa };
  });
}

/** Reajuste sem relatório SIAC: total, situação, observação e o anexo opcional. Sem rateio. */
export async function lancarReajusteManual(medicaoId: string, dados: ManualInput): Promise<{ ok: true; relatorioId: string } | { erro: string }> {
  return semLancar("medicao.reajuste.manual", async () => {
    if (!(await pode())) return { erro: "Sem permissão para lançar reajuste" };
    if (!idValido(medicaoId)) return { erro: "Medição inválida" };
    const v = manualSchema.safeParse(dados);
    if (!v.success) return { erro: v.error.issues[0]?.message ?? "Dados inválidos" };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_mc_reajuste_manual", {
      p_medicao: medicaoId,
      p_dados: { total: v.data.valor, situacao: v.data.situacao, observacao: v.data.observacao, arquivo_id: v.data.arquivoId },
    });
    if (error) return erroAcao("medicao.reajuste.manual", error, mensagemDeNegocio(error, "Não foi possível lançar o reajuste. Tente novamente"));
    revalidar(rotasDaMedicao(medicaoId));
    return { ok: true as const, relatorioId: String(data ?? "") };
  });
}

/** Exclui um relatório (com motivo, uma vez); volta a valer o anterior não excluído. */
export async function excluirRelatorioReajuste(relatorioId: string, medicaoId: string, motivo: string): Promise<{ ok: true } | { erro: string }> {
  return semLancar("medicao.reajuste.excluir", async () => {
    if (!(await pode())) return { erro: "Sem permissão para excluir reajuste" };
    if (!idValido(relatorioId)) return { erro: "Relatório inválido" };
    if (!idValido(medicaoId)) return { erro: "Medição inválida" };
    const m = (motivo ?? "").trim();
    if (m.length < 3) return { erro: "Informe o motivo da exclusão, com ao menos 3 letras" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_mc_reajuste_excluir", { p_id: relatorioId, p_motivo: m });
    if (error) return erroAcao("medicao.reajuste.excluir", error, mensagemDeNegocio(error, "Não foi possível excluir o relatório. Tente novamente"));
    revalidar(rotasDaMedicao(medicaoId));
    return { ok: true as const };
  });
}

/** Seção Reajuste do contrato: tem reajuste, data-base (mês), periodicidade e índice em texto. */
export async function salvarConfigReajuste(contratoId: string, dados: ConfigReajusteInput): Promise<{ ok: true } | { erro: string }> {
  return semLancar("medicao.reajuste.config", async () => {
    if (!(await pode())) return { erro: "Sem permissão para configurar o reajuste" };
    if (!idValido(contratoId)) return { erro: "Contrato inválido" };
    const v = configSchema.safeParse(dados);
    if (!v.success) return { erro: v.error.issues[0]?.message ?? "Dados inválidos" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_mc_reajuste_config_salvar", {
      p_contrato: contratoId,
      p_dados: {
        tem_reajuste: v.data.temReajuste,
        data_base: v.data.dataBase,
        periodicidade_meses: String(v.data.periodicidadeMeses),
        indice_descricao: v.data.indiceDescricao,
      },
    });
    if (error) return erroAcao("medicao.reajuste.config", error, mensagemDeNegocio(error, "Não foi possível salvar o reajuste do contrato. Tente novamente"));
    revalidar([`/medicao/contratos/${contratoId}`, "/medicao/reajuste", "/medicao/boletim", "/medicao/painel", "/medicao/alertas"]);
    return { ok: true as const };
  });
}
