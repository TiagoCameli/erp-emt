"use server";


import {
  hashDoArquivo,
  pathNovo,
  removerBinarios,
  subirBinario,
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

/** Um arquivo enviado: o que deu certo e o que não deu, com o motivo. */
export interface ResultadoEnvio {
  enviados: number;
  erros: { nome: string; erro: string }[];
}

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
 * Envia um ou mais arquivos para um documento.
 *
 * Dedup: calcula o sha-256 antes de subir. Se já existe arquivo com o mesmo
 * hash e tamanho, NÃO sobe binário nenhum, só cria o vínculo. É o que faz o
 * mesmo arquivo servir cotação, OC, lançamento e pagamento com um objeto só no
 * bucket.
 *
 * FormData: entidade, entidadeId, arquivo (uma ou várias vezes).
 */
export async function enviarAnexos(
  formData: FormData,
): Promise<ResultadoEnvio | { erro: string }> {
  const entidade = String(formData.get("entidade") ?? "");
  const entidadeId = String(formData.get("entidadeId") ?? "");

  if (!ehEntidadeAnexo(entidade)) return { erro: "Documento inválido" };
  const idValido = idSchema.safeParse(entidadeId);
  if (!idValido.success) return { erro: "Documento inválido" };
  if (!(await podeMexer(entidade, "anexar"))) {
    return { erro: "Sem permissão para anexar neste documento" };
  }

  const arquivos = formData
    .getAll("arquivo")
    .filter((item): item is File => item instanceof File);
  if (arquivos.length === 0) return { erro: "Nenhum arquivo enviado" };

  const supabase = await createClient();
  const resultado: ResultadoEnvio = { enviados: 0, erros: [] };

  for (const arquivo of arquivos) {
    const invalido = validarArquivo({
      nome: arquivo.name,
      tipoMime: arquivo.type,
      tamanhoBytes: arquivo.size,
    });
    if (invalido) {
      resultado.erros.push({ nome: arquivo.name, erro: invalido });
      continue;
    }

    const hash = await hashDoArquivo(arquivo);

    // Já existe esse binário? Então só vincula.
    const { data: existente } = await supabase.rpc("fn_arquivo_por_hash", {
      p_hash: hash,
      p_tamanho: arquivo.size,
    });

    if (existente) {
      const { error } = await supabase.rpc("fn_vincular_arquivo", {
        p_arquivo_id: existente,
        p_entidade_tipo: entidade,
        p_entidade_id: idValido.data,
        p_nome_exibicao: arquivo.name,
      });
      if (error) {
        resultado.erros.push({
          nome: arquivo.name,
          erro: error.message ?? "Não foi possível anexar",
        });
        continue;
      }
      resultado.enviados += 1;
      continue;
    }

    const path = pathNovo(arquivo.name);
    const erroUpload = await subirBinario(path, arquivo);
    if (erroUpload) {
      resultado.erros.push({ nome: arquivo.name, erro: erroUpload.erro });
      continue;
    }

    const { error } = await supabase.rpc("fn_registrar_arquivo", {
      p_path: path,
      p_nome: arquivo.name,
      p_mime: arquivo.type || "",
      p_tamanho: arquivo.size,
      p_hash: hash,
      p_entidade_tipo: entidade,
      p_entidade_id: idValido.data,
    });

    if (error) {
      // O binário já subiu e o registro falhou: desfaz o upload em vez de
      // deixar objeto sem dono no bucket (a faxina agora também acha esses,
      // mas o certo é não criar o lixo).
      await removerBinarios([path]);
      resultado.erros.push({
        nome: arquivo.name,
        erro: error.message ?? "Não foi possível registrar o arquivo",
      });
      continue;
    }
    resultado.enviados += 1;
  }

  return resultado;
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
