"use client";

import { ANEXO_TAMANHO_MAXIMO_MB } from "@/lib/anexos-limite";
import { createClient } from "@/lib/supabase/client";
import {
  confirmarEnvioAnexo,
  prepararEnvioAnexo,
} from "@/modules/_shared/anexos/actions";

/** Bucket privado dos anexos. O mesmo nome do servidor (`BUCKET_ARQUIVOS`). */
const BUCKET = "anexos";

export type ResultadoEnvioAnexo = { ok: true } | { erro: string };

/**
 * Envia UM anexo do navegador direto para o Storage.
 *
 * Três passos, e o do meio não passa pelo servidor da aplicação:
 *
 * 1. `prepararEnvioAnexo` — a server action decide se pode (documento existe,
 *    usuário tem permissão, nome e tipo aceitos) e devolve caminho e token.
 * 2. `uploadToSignedUrl` — os BYTES vão do navegador para o Supabase. É o que
 *    destrava arquivo grande: a function da Vercel recusa corpo acima de
 *    ~4,5 MB, teto da plataforma que nenhuma configuração muda, e era ele o
 *    limite de verdade enquanto o arquivo atravessava a action.
 * 3. `confirmarEnvioAnexo` — o servidor baixa o objeto de volta, MEDE e
 *    HASHEIA o que chegou, e registra. Nada do que o navegador afirma sobre o
 *    conteúdo é usado.
 *
 * Falha em qualquer passo vira mensagem em pt-BR com o motivo. O que não pode
 * acontecer é sumir em silêncio, que foi o defeito original: a tela girava e o
 * anexo não aparecia.
 */
export async function enviarAnexoDoNavegador(
  entidade: string,
  entidadeId: string,
  arquivo: File,
): Promise<ResultadoEnvioAnexo> {
  let preparo;
  try {
    preparo = await prepararEnvioAnexo({
      entidade,
      entidadeId,
      nome: arquivo.name,
      tipoMime: arquivo.type,
      tamanhoBytes: arquivo.size,
    });
  } catch {
    return { erro: "Não foi possível falar com o servidor. Tente de novo" };
  }
  if ("erro" in preparo) return { erro: preparo.erro };

  const supabase = createClient();
  const { error: erroUpload } = await supabase.storage
    .from(BUCKET)
    .uploadToSignedUrl(preparo.path, preparo.token, arquivo, {
      contentType: arquivo.type || undefined,
    });

  if (erroUpload) {
    // O bucket é quem recusa tamanho de verdade, e a mensagem dele vem em
    // inglês e genérica. Traduz para o limite que a tela anuncia.
    const mensagem = (erroUpload.message ?? "").toLowerCase();
    if (mensagem.includes("exceeded") || mensagem.includes("too large")) {
      return {
        erro: `O arquivo passa do limite de ${ANEXO_TAMANHO_MAXIMO_MB} MB`,
      };
    }
    return { erro: "O envio do arquivo falhou. Tente de novo" };
  }

  try {
    return await confirmarEnvioAnexo({
      entidade,
      entidadeId,
      path: preparo.path,
      nome: arquivo.name,
      tipoMime: arquivo.type,
    });
  } catch {
    // O binário está no bucket mas não virou anexo. A faxina apaga o objeto sem
    // registro depois da carência, então isto não deixa lixo permanente.
    return { erro: "O arquivo subiu mas não foi registrado. Tente de novo" };
  }
}
