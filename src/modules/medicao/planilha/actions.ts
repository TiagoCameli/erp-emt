"use server";

import { revalidatePath } from "next/cache";

import { hashDoArquivo, lerBinario } from "@/lib/arquivos";
import { erroAcao, semLancar } from "@/lib/erros";
import { mensagemDeNegocio } from "@/lib/erros-banco";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { motivoSchema } from "@/modules/medicao/contratos/schemas";
import { casarComVersaoAnterior, type LinhaAnterior, type ResultadoCasamento } from "@/modules/medicao/planilha/casamento";
import { diagnosticarValores, type Diagnostico } from "@/modules/medicao/planilha/diagnostico";
import { abrirPlanilha, lerLinhasBrutas, previaDasAbas, type AbaPrevia, type Mapeamento } from "@/modules/medicao/planilha/ler-arquivo";
import { montarPlanilha, type LinhaBruta, type Montagem } from "@/modules/medicao/planilha/montagem";
import { arquivoDaVersao, carregarVersaoParaImportar, linhasDaVersaoAnterior } from "@/modules/medicao/planilha/queries";
import {
  arquivoEsperadoSchema,
  escolhasSchema,
  mapeamentoSchema,
  rascunhoSchema,
  type Escolhas,
  type RascunhoInput,
} from "@/modules/medicao/planilha/schemas";

/**
 * Mutações da planilha contratual (`medicao.planilha`). Os números NUNCA vêm do navegador: o
 * servidor baixa o xlsx anexado à versão (o mais recente), lê, monta e grava. A tela só manda a
 * aba, as colunas e as escolhas. As RPCs conferem de novo a ação e a lista do contrato.
 */

const RECURSO = "medicao.planilha" as const;
const ROTA = "/medicao/planilha";

export type ResultadoAcao = { ok: true } | { erro: string };
/**
 * `anteriores` vai além do brief: a tela do aditivo precisa do preço e da quantidade de cada item
 * da versão anterior para o usuário distinguir candidatos de mesma chave (código, descrição e
 * unidade iguais) e para trocar um casamento. Só exibição: a gravação casa de novo no servidor.
 */
export type Previa = Montagem & {
  diagnostico: Diagnostico | null;
  casamento: ResultadoCasamento | null;
  anteriores: LinhaAnterior[] | null;
  /** SHA-256 do arquivo lido NESTA prévia, medido no servidor. A gravação exige o mesmo. */
  arquivoHash: string;
  numeroVersao: number;
  bloqueios: number;
};

async function pode(acao: "criar" | "aprovar" | "desaprovar" | "excluir"): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

function revalidar(versaoId?: string) {
  for (const rota of [ROTA, ...(versaoId ? [`${ROTA}/${versaoId}`, `${ROTA}/${versaoId}/importar`] : [])]) {
    try {
      revalidatePath(rota);
    } catch {
      // O sucesso já aconteceu.
    }
  }
}

export async function criarRascunho(
  contratoId: string,
  dados: RascunhoInput,
): Promise<{ ok: true; id: string } | { erro: string }> {
  return semLancar("medicao.planilha.criarRascunho", async () => {
    if (!(await pode("criar"))) return { erro: "Sem permissão para importar planilha" };
    if (!idSchema.safeParse(contratoId).success) return { erro: "Contrato inválido" };
    const validado = rascunhoSchema.safeParse(dados);
    if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
    if (validado.data.aditivoId !== null && !idSchema.safeParse(validado.data.aditivoId).success) return { erro: "Aditivo inválido" };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_mc_planilha_criar_rascunho", {
      p_contrato: contratoId,
      p_dados: { aditivo_id: validado.data.aditivoId, vigente_desde: validado.data.vigenteDesde, motivo: validado.data.motivo },
    });
    if (error) {
      return erroAcao("medicao.planilha.criarRascunho", error, mensagemDeNegocio(error, "Não foi possível criar a versão. Tente novamente"));
    }
    const id = typeof data === "string" ? data : "";
    revalidar(id || undefined);
    return { ok: true, id };
  });
}

type Montada =
  | { erro: string }
  | {
      arquivo: { path: string; nome: string };
      previa: Previa;
    };

/** Baixa o xlsx da versão, lê pelo mapeamento e monta a prévia. Não grava nada. */
async function montarDaVersao(versaoId: string, mapaBruto: Mapeamento, escolhasBrutas: Escolhas): Promise<Montada> {
  if (!idSchema.safeParse(versaoId).success) return { erro: "Versão inválida" };
  const mapa = mapeamentoSchema.safeParse(mapaBruto);
  if (!mapa.success) return { erro: "Mapeamento de colunas inválido" };
  const escolhasLidas = escolhasSchema.safeParse(escolhasBrutas);
  if (!escolhasLidas.success) return { erro: "Escolhas inválidas" };
  const escolhas = escolhasLidas.data;

  const versao = await carregarVersaoParaImportar(versaoId); // RLS: fora da lista = null
  if (!versao) return { erro: "Versão não encontrada" };
  if (versao.status !== "rascunho") return { erro: `A versão ${versao.numero} não está em rascunho` };
  const arquivo = await arquivoDaVersao(versaoId);
  if (!arquivo) return { erro: "Anexe o xlsx oficial antes de importar" };
  const binario = await lerBinario(arquivo.path);
  if ("erro" in binario) return { erro: binario.erro };

  let brutas: LinhaBruta[];
  try {
    const wb = await abrirPlanilha(await binario.blob.arrayBuffer());
    brutas = lerLinhasBrutas(wb, mapa.data);
  } catch (erro) {
    if (erro instanceof Error && erro.message.startsWith("A aba ")) return { erro: erro.message };
    return erroAcao("medicao.planilha.lerArquivo", erro, "Não foi possível abrir o arquivo como xlsx. Salve de novo no Excel e envie outra vez");
  }

  const montagem = montarPlanilha(brutas, escolhas.paiPorOrdem as Record<number, number>);
  const anteriores = versao.numero > 0 ? await linhasDaVersaoAnterior(versao.contratoId, versao.numero) : null;
  if (versao.numero > 0 && anteriores === null) {
    return { erro: `A versão ${versao.numero - 1} do contrato não foi encontrada. Não dá para casar os itens do aditivo` };
  }
  const casamento = anteriores
    ? casarComVersaoAnterior(montagem.linhas, anteriores, escolhas.itemPorOrdem as Record<number, string | null>)
    : null;
  const previa: Previa = {
    ...montagem,
    diagnostico: diagnosticarValores(montagem.linhas),
    casamento,
    anteriores,
    arquivoHash: await hashDoArquivo(binario.blob),
    numeroVersao: versao.numero,
    bloqueios: montagem.alertas.filter((a) => a.bloqueia).length,
  };
  return { arquivo, previa };
}

export async function lerAbasDaVersao(versaoId: string): Promise<{ ok: true; abas: AbaPrevia[]; arquivo: string } | { erro: string }> {
  return semLancar("medicao.planilha.lerAbas", async () => {
    if (!(await pode("criar"))) return { erro: "Sem permissão para importar planilha" };
    if (!idSchema.safeParse(versaoId).success) return { erro: "Versão inválida" };
    const versao = await carregarVersaoParaImportar(versaoId);
    if (!versao) return { erro: "Versão não encontrada" };
    if (versao.status !== "rascunho") return { erro: `A versão ${versao.numero} não está em rascunho` };
    const arquivo = await arquivoDaVersao(versaoId);
    if (!arquivo) return { erro: "Anexe o xlsx oficial antes de importar" };
    const binario = await lerBinario(arquivo.path);
    if ("erro" in binario) return { erro: binario.erro };
    try {
      const wb = await abrirPlanilha(await binario.blob.arrayBuffer());
      return { ok: true as const, abas: previaDasAbas(wb), arquivo: arquivo.nome };
    } catch (erro) {
      return erroAcao("medicao.planilha.lerAbas", erro, "Não foi possível abrir o arquivo como xlsx. Salve de novo no Excel e envie outra vez");
    }
  });
}

export async function previaDaImportacao(
  versaoId: string,
  mapa: Mapeamento,
  escolhas: Escolhas,
): Promise<{ ok: true; previa: Previa } | { erro: string }> {
  return semLancar("medicao.planilha.previa", async () => {
    if (!(await pode("criar"))) return { erro: "Sem permissão para importar planilha" };
    const r = await montarDaVersao(versaoId, mapa, escolhas);
    if ("erro" in r) return r;
    return { ok: true as const, previa: r.previa };
  });
}

/** Por que a prévia ainda não pode ser gravada, na ordem em que a tela resolve. Null quando pode. */
function recusaDaGravacao(previa: Previa, escolhas: Escolhas): string | null {
  if (previa.bloqueios > 0) {
    return previa.bloqueios === 1
      ? "A planilha tem 1 problema que impede a importação"
      : `A planilha tem ${previa.bloqueios} problemas que impedem a importação`;
  }
  if (previa.duplicados.length > 0 && !escolhas.duplicadosConfirmados) return "Confirme os códigos repetidos";
  if (previa.ambiguidades.length > 0) return "Escolha o pai das linhas com código ambíguo";
  if (previa.casamento?.linhas.some((c) => c.situacao === "ambiguo")) return "Resolva os itens ambíguos do aditivo";
  if (previa.alertas.length > 0 && !escolhas.alertasLidos) return "Marque que leu os alertas";
  return null;
}

/**
 * `arquivoEsperado` é o `arquivoHash` da prévia que o usuário conferiu. Se outro xlsx foi anexado
 * depois (nesta aba ou em outra), o servidor lê o novo e o hash não bate: as confirmações da tela
 * eram do arquivo antigo, então a gravação recusa.
 */
export async function gravarImportacao(
  versaoId: string,
  mapa: Mapeamento,
  escolhas: Escolhas,
  arquivoEsperado: string,
): Promise<{ ok: true; linhas: number } | { erro: string }> {
  return semLancar("medicao.planilha.gravar", async () => {
    if (!(await pode("criar"))) return { erro: "Sem permissão para importar planilha" };
    const esperado = arquivoEsperadoSchema.safeParse(arquivoEsperado);
    if (!esperado.success) return { erro: "Veja a prévia antes de gravar" };
    const r = await montarDaVersao(versaoId, mapa, escolhas);
    if ("erro" in r) return r;
    const { previa, arquivo } = r;
    if (previa.arquivoHash !== esperado.data) return { erro: "O arquivo mudou desde a prévia. Veja a prévia de novo" };
    const recusa = recusaDaGravacao(previa, escolhas);
    if (recusa) return { erro: recusa };

    const itemPorOrdem = new Map((previa.casamento?.linhas ?? []).map((c) => [c.ordem, c.itemId]));
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_mc_planilha_gravar_linhas", {
      p_versao: versaoId,
      // Preço e quantidade vão como TEXTO: o banco converte para numeric sem passar por double.
      p_linhas: previa.linhas.map((l) => ({
        ordem: l.ordem, codigo: l.codigo, pai_ordem: l.paiOrdem, descricao: l.descricao, unidade: l.unidade, tipo: l.tipo,
        preco_unitario: l.precoUnitario, quantidade_prevista: l.quantidadePrevista, linha_origem: l.linhaOrigem,
        item_id: itemPorOrdem.get(l.ordem) ?? null,
      })),
      p_arquivo_nome: arquivo.nome,
      p_arquivo_hash: previa.arquivoHash,
    });
    if (error) {
      // Rede de segurança: a prévia já bloqueia descrição vazia e número negativo, mas se um check
      // da tabela recusar mesmo assim, a mensagem diz o que olhar em vez de "Tente novamente".
      const mensagem = error.code === "23514"
        ? "O banco recusou uma linha da planilha (descrição vazia, código vazio ou preço ou quantidade negativos). Corrija o xlsx e veja a prévia de novo"
        : mensagemDeNegocio(error, "Não foi possível gravar a planilha. Tente novamente");
      return erroAcao("medicao.planilha.gravar", error, mensagem);
    }
    revalidar(versaoId);
    return { ok: true as const, linhas: typeof data === "number" ? data : previa.linhas.length };
  });
}

export async function aprovarVersao(versaoId: string): Promise<ResultadoAcao> {
  return semLancar("medicao.planilha.aprovar", async () => {
    if (!(await pode("aprovar"))) return { erro: "Sem permissão para tornar a versão vigente" };
    if (!idSchema.safeParse(versaoId).success) return { erro: "Versão inválida" };
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_mc_planilha_aprovar", { p_versao: versaoId });
    if (error) return erroAcao("medicao.planilha.aprovar", error, mensagemDeNegocio(error, "Não foi possível tornar a versão vigente"));
    revalidar(versaoId);
    return { ok: true };
  });
}

export async function desaprovarVersao(versaoId: string, motivo: string): Promise<ResultadoAcao> {
  return semLancar("medicao.planilha.desaprovar", async () => {
    if (!(await pode("desaprovar"))) return { erro: "Sem permissão para desaprovar a versão" };
    if (!idSchema.safeParse(versaoId).success) return { erro: "Versão inválida" };
    const m = motivoSchema.safeParse(motivo);
    if (!m.success) return { erro: m.error.issues[0]?.message ?? "Informe o motivo" };
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_mc_planilha_desaprovar", { p_versao: versaoId, p_motivo: m.data });
    if (error) return erroAcao("medicao.planilha.desaprovar", error, mensagemDeNegocio(error, "Não foi possível voltar a versão a rascunho"));
    revalidar(versaoId);
    return { ok: true };
  });
}

export async function excluirVersao(versaoId: string, motivo: string): Promise<ResultadoAcao> {
  return semLancar("medicao.planilha.excluir", async () => {
    if (!(await pode("excluir"))) return { erro: "Sem permissão para excluir a versão" };
    if (!idSchema.safeParse(versaoId).success) return { erro: "Versão inválida" };
    const m = motivoSchema.safeParse(motivo);
    if (!m.success) return { erro: m.error.issues[0]?.message ?? "Informe o motivo" };
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_mc_excluir", { p_tabela: "mc_planilha_versoes", p_id: versaoId, p_motivo: m.data });
    if (error) return erroAcao("medicao.planilha.excluir", error, mensagemDeNegocio(error, "Não foi possível excluir a versão"));
    revalidar(versaoId);
    return { ok: true };
  });
}
