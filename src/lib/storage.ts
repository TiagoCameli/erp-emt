import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Bucket privado de anexos (NF, documentos de compras). */
export const BUCKET_ANEXOS = "anexos";

/**
 * Sobe um arquivo para o bucket de anexos e registra o vínculo na tabela
 * anexos (tabela + registro_id). O path é prefixado pela tabela e por um
 * uuid para não colidir. A RLS da tabela anexos cobre a permissão.
 * Retorna o id do anexo criado ou um erro pt-BR.
 */
export async function salvarAnexo(params: {
  tabela: string;
  registroId: string;
  arquivo: File;
}): Promise<{ id: string } | { erro: string }> {
  const { tabela, registroId, arquivo } = params;
  const supabase = await createClient();

  const extensao = arquivo.name.includes(".")
    ? arquivo.name.slice(arquivo.name.lastIndexOf("."))
    : "";
  const path = `${tabela}/${registroId}/${crypto.randomUUID()}${extensao}`;

  const { error: erroUpload } = await supabase.storage
    .from(BUCKET_ANEXOS)
    .upload(path, arquivo, { contentType: arquivo.type || undefined });

  if (erroUpload) {
    return { erro: "Não foi possível enviar o arquivo. Tente novamente" };
  }

  const { data, error } = await supabase
    .from("anexos")
    .insert({
      tabela,
      registro_id: registroId,
      nome_arquivo: arquivo.name,
      path_storage: path,
      tipo_mime: arquivo.type || null,
      tamanho_bytes: arquivo.size,
    })
    .select("id")
    .single();

  if (error || !data) {
    // Desfaz o upload órfão se o vínculo falhou.
    await supabase.storage.from(BUCKET_ANEXOS).remove([path]);
    return { erro: "Não foi possível registrar o anexo. Tente novamente" };
  }

  return { id: data.id };
}

/** URL assinada (temporária) para baixar um anexo. Expira em 1 hora. */
export async function urlAssinadaAnexo(
  pathStorage: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET_ANEXOS)
    .createSignedUrl(pathStorage, 60 * 60);
  return error || !data ? null : data.signedUrl;
}

/** Remove o anexo do Storage e o vínculo da tabela. */
export async function removerAnexo(
  anexoId: string,
): Promise<{ ok: true } | { erro: string }> {
  const supabase = await createClient();

  const { data: anexo } = await supabase
    .from("anexos")
    .select("path_storage")
    .eq("id", anexoId)
    .single();

  if (!anexo) return { erro: "Anexo não encontrado" };

  const { error } = await supabase.from("anexos").delete().eq("id", anexoId);
  if (error) return { erro: "Não foi possível remover o anexo" };

  await supabase.storage.from(BUCKET_ANEXOS).remove([anexo.path_storage]);
  return { ok: true };
}
