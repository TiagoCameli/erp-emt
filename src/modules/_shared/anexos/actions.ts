"use server";


import {
  criarUploadAssinado,
  ehCaminhoDeUpload,
  hashDoArquivo,
  lerBinario,
  pathNovo,
  removerBinarios,
  urlAssinada,
  validarArquivo,
} from "@/lib/arquivos";
import { erroAcao } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  ehEntidadeAnexo,
  recursoDaEntidade,
  type EntidadeAnexo,
} from "@/modules/_shared/anexos/entidades";
import {
  listarAnexosDoDocumento,
  type AnexoDoDocumento,
} from "@/modules/_shared/anexos/queries";

export type ResultadoAnexo = { ok: true } | { erro: string };
export type ResultadoUrl = { url: string } | { erro: string };

/**
 * Para onde a tela manda o binário: caminho no bucket e token de upload.
 *
 * Não existe resposta "esse arquivo já existe, não suba": o dedup é decidido no
 * `confirmarEnvioAnexo`, com o hash que o SERVIDOR calcula. Decidir aqui exigiria
 * o hash vindo do navegador, e hash escolhido pelo cliente deixa um documento
 * apontar para o binário de outro.
 */
export type PreparoDeEnvio = { path: string; token: string };

/**
 * Checa a permissão de mexer nos anexos de um documento. Anexar aceita 'criar'
 * ou 'editar' (quem acabou de criar o documento anexa nele); remover exige
 * 'editar'.
 */
async function podeMexer(
  entidade: EntidadeAnexo,
  acao: "anexar" | "remover",
): Promise<boolean> {
  const usuario = await getUsuarioLogado();
  const recurso = recursoDaEntidade(entidade);
  if (acao === "remover") return temPermissao(usuario, recurso, "editar");
  return (
    temPermissao(usuario, recurso, "editar") ||
    temPermissao(usuario, recurso, "criar")
  );
}

/** Lista os anexos de um documento (usada pela tela após enviar ou remover). */
export async function anexosDoDocumento(
  entidade: string,
  entidadeId: string,
): Promise<AnexoDoDocumento[]> {
  if (!ehEntidadeAnexo(entidade)) return [];
  const usuario = await getUsuarioLogado();
  if (!temPermissao(usuario, recursoDaEntidade(entidade), "ver")) return [];
  const idValido = idSchema.safeParse(entidadeId);
  if (!idValido.success) return [];
  return listarAnexosDoDocumento(entidade, idValido.data);
}

/**
 * PASSO 1 do envio: decide se pode anexar e devolve para onde mandar.
 *
 * O binário NÃO passa por aqui. Ele vai do navegador direto para o Storage, com
 * o token desta resposta, porque a function da Vercel recusa corpo acima de
 * ~4,5 MB — teto da plataforma, não configurável. Enquanto o arquivo
 * atravessava a server action, o limite real era esse por mais que a tela
 * prometesse outro, e a falha chegava muda.
 *
 * O que passa por aqui é a DECISÃO: entidade existe, usuário tem permissão,
 * nome e tipo do arquivo são aceitos. O tamanho declarado é conferido aqui só
 * para avisar cedo — quem recusa de verdade é o `file_size_limit` do bucket, e
 * o `confirmarEnvioAnexo` mede de novo o que realmente chegou.
 */
export async function prepararEnvioAnexo(dados: {
  entidade: string;
  entidadeId: string;
  nome: string;
  tipoMime: string;
  tamanhoBytes: number;
}): Promise<PreparoDeEnvio | { erro: string }> {
  const { entidade, entidadeId, nome, tipoMime, tamanhoBytes } = dados;

  if (!ehEntidadeAnexo(entidade)) return { erro: "Documento inválido" };
  const idValido = idSchema.safeParse(entidadeId);
  if (!idValido.success) return { erro: "Documento inválido" };
  if (!(await podeMexer(entidade, "anexar"))) {
    return { erro: "Sem permissão para anexar neste documento" };
  }

  const invalido = validarArquivo({ nome, tipoMime, tamanhoBytes });
  if (invalido) return { erro: invalido };

  return criarUploadAssinado(pathNovo(nome));
}

/**
 * PASSO 2 do envio: o binário já subiu; agora o servidor mede, hasheia e
 * registra.
 *
 * Tamanho e hash saem do objeto BAIXADO DE VOLTA, nunca do que o navegador
 * disse ter mandado. Os dois decidem coisa séria: o tamanho aparece na tela, e
 * o hash é a chave do dedup — chave escolhida pelo cliente deixaria um
 * documento apontar para o binário de outro, calado.
 *
 * Quando o mesmo conteúdo já existia, `fn_registrar_arquivo` reusa o registro
 * antigo (unique de hash+tamanho) e o objeto que acabou de subir vira lixo: é
 * apagado aqui mesmo, sem esperar a faxina.
 */
export async function confirmarEnvioAnexo(dados: {
  entidade: string;
  entidadeId: string;
  path: string;
  nome: string;
  tipoMime: string;
}): Promise<ResultadoAnexo> {
  const { entidade, entidadeId, path, nome, tipoMime } = dados;

  if (!ehEntidadeAnexo(entidade)) return { erro: "Documento inválido" };
  const idValido = idSchema.safeParse(entidadeId);
  if (!idValido.success) return { erro: "Documento inválido" };
  if (!(await podeMexer(entidade, "anexar"))) {
    return { erro: "Sem permissão para anexar neste documento" };
  }
  if (!ehCaminhoDeUpload(path)) return { erro: "Caminho de arquivo inválido" };

  const binario = await lerBinario(path);
  if ("erro" in binario) return { erro: binario.erro };

  // Mede o que CHEGOU, não o que foi prometido.
  const invalido = validarArquivo({
    nome,
    tipoMime,
    tamanhoBytes: binario.tamanhoBytes,
  });
  if (invalido) {
    await removerBinarios([path]);
    return { erro: invalido };
  }

  const hash = await hashDoArquivo(binario.blob);
  const supabase = await createClient();

  const { data: arquivoId, error } = await supabase.rpc(
    "fn_registrar_arquivo",
    {
      p_path: path,
      p_nome: nome,
      p_mime: tipoMime || "",
      p_tamanho: binario.tamanhoBytes,
      p_hash: hash,
      p_entidade_tipo: entidade,
      p_entidade_id: idValido.data,
    },
  );

  if (error) {
    // O binário subiu e o registro falhou: desfaz, em vez de deixar objeto sem
    // dono no bucket (a faxina também acha esses, mas o certo é não criar lixo).
    await removerBinarios([path]);
    return erroAcao(
      "anexos.confirmarEnvioAnexo",
      error,
      error.message ?? "Não foi possível registrar o arquivo",
    );
  }

  await apagarSeForDuplicata(arquivoId, path);
  return { ok: true };
}

/**
 * O registro reusou um arquivo que já existia? Então o objeto que acabou de
 * subir não é de ninguém: apaga agora.
 */
async function apagarSeForDuplicata(
  arquivoId: string | null,
  path: string,
): Promise<void> {
  if (!arquivoId) return;
  const supabase = await createClient();
  const { data } = await supabase
    .from("arquivos")
    .select("path_storage")
    .eq("id", arquivoId)
    .maybeSingle();
  if (data && data.path_storage !== path) await removerBinarios([path]);
}

/**
 * URL assinada de curta duração para baixar ou pré-visualizar. A permissão de
 * VER o documento é checada aqui, e só então a URL é gerada com a chave de
 * serviço: o bucket não é acessível por client nenhum.
 */
export async function urlDoAnexo(vinculoId: string): Promise<ResultadoUrl> {
  const idValido = idSchema.safeParse(vinculoId);
  if (!idValido.success) return { erro: "Anexo inválido" };

  const supabase = await createClient();
  const { data: vinculo } = await supabase
    .from("anexo_vinculos")
    .select("entidade_tipo, arquivos(path_storage)")
    .eq("id", idValido.data)
    .maybeSingle();

  if (!vinculo?.arquivos) return { erro: "Anexo não encontrado" };

  const entidade = vinculo.entidade_tipo;
  if (!ehEntidadeAnexo(entidade)) return { erro: "Anexo não encontrado" };

  const usuario = await getUsuarioLogado();
  if (!temPermissao(usuario, recursoDaEntidade(entidade), "ver")) {
    return { erro: "Sem permissão para ver este anexo" };
  }

  return urlAssinada(vinculo.arquivos.path_storage);
}

/**
 * Remove o VÍNCULO deste documento. O arquivo continua no bucket enquanto
 * tiver vínculo em outro lugar; quando cai o último, o banco marca como órfão e
 * a faxina apaga o binário depois da carência.
 */
export async function removerAnexo(
  vinculoId: string,
): Promise<ResultadoAnexo> {
  const idValido = idSchema.safeParse(vinculoId);
  if (!idValido.success) return { erro: "Anexo inválido" };

  const supabase = await createClient();
  const { data: vinculo } = await supabase
    .from("anexo_vinculos")
    .select("entidade_tipo")
    .eq("id", idValido.data)
    .maybeSingle();

  if (!vinculo) return { erro: "Anexo não encontrado" };
  const entidade = vinculo.entidade_tipo;
  if (!ehEntidadeAnexo(entidade)) return { erro: "Anexo não encontrado" };
  if (!(await podeMexer(entidade, "remover"))) {
    return { erro: "Sem permissão para remover anexo deste documento" };
  }

  const { error } = await supabase.rpc("fn_desvincular_arquivo", {
    p_vinculo_id: idValido.data,
  });

  if (error) {
    return erroAcao(
      "anexos.removerAnexo",
      error,
      error.message ?? "Não foi possível remover o anexo",
    );
  }
  return { ok: true };
}
