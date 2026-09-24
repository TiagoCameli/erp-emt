"use server";

import { revalidatePath } from "next/cache";

import { erroAcao, logErroServidor } from "@/lib/erros";
import { lerEValidarXlsx, type ColunaImportacao } from "@/lib/importacao";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { listarCentrosCusto } from "@/modules/_shared/centro-custo/queries";
import { traduzirErroFrete } from "@/modules/frete/fretes/erros";
import {
  COLUNAS_PLANILHA_FRETE,
  indicePorNome,
  validarLinhaFrete,
  type CadastrosImportacao,
  type LinhaPlanilhaFrete,
} from "@/modules/frete/fretes/importacao";
import {
  listarInsumosAtivos,
  listarLocalidadesAtivas,
  listarTransportadorasFrete,
} from "@/modules/frete/fretes/queries";
import { dadosDaRpc, freteSchema, type FreteInput } from "@/modules/frete/fretes/schemas";

/**
 * Importar fretes do Excel (o "Importar do Excel" do FreteForm da origem). Arquivo
 * separado do `actions.ts` de propósito: este puxa o exceljs no topo (`@/lib/importacao`),
 * e um import pesado no módulo das outras actions derrubaria todas elas.
 */

const RECURSO = "frete.fretes" as const;

const COLUNAS: ColunaImportacao<LinhaPlanilhaFrete>[] = COLUNAS_PLANILHA_FRETE.map((c) => ({
  chave: c.chave,
  rotulo: c.rotulo,
  exemplo: c.exemplo,
}));

async function lerArquivo(formData: FormData): Promise<Buffer> {
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File)) throw new Error("Nenhum arquivo enviado");
  return Buffer.from(await arquivo.arrayBuffer());
}

/** Cadastros para casar por nome. A obra casa pelo nome OU por "código nome". */
async function carregarCadastros(): Promise<CadastrosImportacao> {
  const [localidades, transportadoras, insumos, centros] = await Promise.all([
    listarLocalidadesAtivas(),
    listarTransportadorasFrete(),
    listarInsumosAtivos(),
    listarCentrosCusto(),
  ]);
  const raizes = centros.filter((c) => c.paiId === null && c.tipo === "obra");
  const obras = indicePorNome([
    ...raizes.map((c) => ({ id: c.id, nome: c.nome })),
    ...raizes.filter((c) => c.codigo).map((c) => ({ id: c.id, nome: `${c.codigo} ${c.nome}` })),
  ]);
  return {
    localidades: indicePorNome(localidades),
    transportadoras: indicePorNome(transportadoras),
    insumos: indicePorNome(insumos),
    obras,
  };
}

interface LinhaProcessada {
  linha: number;
  erros: string[];
  frete: FreteInput | null;
}

async function processar(formData: FormData): Promise<{ linhas: LinhaProcessada[]; total: number }> {
  const buffer = await lerArquivo(formData);
  const [resultado, cadastros] = await Promise.all([lerEValidarXlsx(buffer, COLUNAS), carregarCadastros()]);
  const todas = [...resultado.validas, ...resultado.invalidas].sort((a, b) => a.linha - b.linha);
  const linhas = todas.map((l) => {
    const { erros, frete } = validarLinhaFrete(l.dados, cadastros);
    if (frete) {
      // O mesmo schema da action: pega o que o banco recusaria (mais de 4 casas, teto).
      const conferido = freteSchema.safeParse(frete);
      if (!conferido.success) return { linha: l.linha, erros: [conferido.error.issues[0]?.message ?? "Dados inválidos"], frete: null };
    }
    return { linha: l.linha, erros: [...l.erros, ...erros], frete };
  });
  return { linhas, total: resultado.totalLinhas };
}

export interface ResumoImportacaoFretes {
  validas: number;
  invalidas: { linha: number; erros: string[] }[];
  totalLinhas: number;
}

/** Prévia: lê, casa os cadastros e devolve os erros por linha. */
export async function validarImportFretes(formData: FormData): Promise<ResumoImportacaoFretes> {
  await exigirPermissao(RECURSO, "criar");
  const { linhas, total } = await processar(formData);
  const invalidas = linhas.filter((l) => l.erros.length > 0 || !l.frete);
  return {
    validas: linhas.length - invalidas.length,
    invalidas: invalidas.map((l) => ({ linha: l.linha, erros: l.erros })),
    totalLinhas: total,
  };
}

/**
 * Grava as linhas válidas uma a uma pela `fn_frete_salvar` (sequencial, como a origem).
 * Uma linha que o banco recusa não para as outras: o resultado diz quantas entraram e
 * quais falharam, para ninguém reimportar e duplicar.
 */
export async function importarFretes(formData: FormData): Promise<{ importadas: number } | { erro: string }> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para importar fretes" };
  }

  let processadas;
  try {
    processadas = await processar(formData);
  } catch (erro) {
    return erroAcao(
      "frete.fretes.importar",
      erro,
      erro instanceof Error ? erro.message : "Não foi possível ler a planilha",
    );
  }

  const validas = processadas.linhas.filter((l) => l.erros.length === 0 && l.frete !== null);
  if (validas.length === 0) return { erro: "Nenhuma linha válida para importar" };

  const supabase = await createClient();
  let importadas = 0;
  const falhas: string[] = [];
  for (const linha of validas) {
    const { error } = await supabase.rpc("fn_frete_salvar", {
      p_id: null as unknown as string,
      p_dados: { ...dadosDaRpc(linha.frete as FreteInput) },
    });
    if (error) {
      logErroServidor("frete.fretes.importar.linha", error);
      falhas.push(`linha ${linha.linha}: ${traduzirErroFrete(error, "recusada pelo banco")}`);
    } else {
      importadas += 1;
    }
  }

  try {
    revalidatePath("/frete/fretes");
    revalidatePath("/frete");
  } catch (erro) {
    logErroServidor("frete.fretes.importar.revalidar", erro);
  }

  if (falhas.length > 0) {
    return {
      erro: `${importadas} ${importadas === 1 ? "frete importado" : "fretes importados"}. Não entraram: ${falhas.join("; ")}. Corrija e importe só essas linhas`,
    };
  }
  return { importadas };
}
