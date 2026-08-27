/**
 * Limites e caminho da foto de perfil, em UM lugar só.
 *
 * Não importa NADA (nem `server-only`, nem React): é lido pelo servidor, pela
 * server action e pelo componente de cliente que reduz a imagem antes de subir.
 * Mesma razão de `@/lib/anexos-limite`.
 *
 * São DOIS limites de tamanho, e eles medem coisas diferentes:
 *
 * 1. `FOTO_ORIGEM_MAXIMO_MB` — o que a pessoa ESCOLHE no seletor de arquivo.
 *    Foto de celular tem 3 a 8 MB, então este é folgado de propósito: recusar
 *    aqui seria recusar a foto que ela tem. Ele existe só para barrar o absurdo
 *    (um TIFF de 200 MB travaria o navegador na hora de decodificar).
 * 2. `FOTO_TAMANHO_MAXIMO_MB` — o que CHEGA no bucket, depois de a tela reduzir
 *    para 512x512 JPEG. Este é o limite de verdade, e quem o aplica é o
 *    `file_size_limit` do bucket `avatares` (migration 20260827140000) — o
 *    servidor, não a tela: os bytes não passam pela server action.
 *
 * Os dois números têm que andar junto com a migration. Limite anunciado na tela
 * que ninguém aplica do lado do servidor é promessa, não limite.
 */

/** Igual ao `file_size_limit` do bucket `avatares`. */
export const FOTO_TAMANHO_MAXIMO_MB = 2;

/** Teto do arquivo escolhido, ANTES de reduzir. Só barra o absurdo. */
export const FOTO_ORIGEM_MAXIMO_MB = 12;

/**
 * Lado do quadrado final, em pixels.
 *
 * 512 porque o maior lugar em que a foto aparece é um círculo de 40px (a
 * `size-10` do Avatar) e a prévia de 96px em Minha conta; 512 cobre tela retina
 * com folga e ainda cabe em ~60 KB de JPEG. Guardar a foto original de 4000px
 * significaria baixar megabytes em CADA página, porque o avatar está no layout.
 */
export const FOTO_LADO_PX = 512;

/**
 * Qualidade do JPEG. 0,85 é o ponto em que o arquivo cai muito e o rosto num
 * círculo de 40px não muda de aparência.
 */
export const FOTO_QUALIDADE_JPEG = 0.85;

/**
 * O único tipo aceito. A tela converte tudo para JPEG no canvas, e o bucket
 * tem `allowed_mime_types = {image/jpeg}` — então isto não é preferência, é o
 * contrato com o Storage.
 */
export const FOTO_MIME = "image/jpeg";

/**
 * Caminho da foto de um usuário no bucket.
 *
 * DETERMINÍSTICO (um objeto por pessoa, sobrescrito na troca) e não um uuid novo
 * por upload. A diferença é órfão: com caminho novo a cada troca, a foto antiga
 * ficaria no bucket para sempre, e este bucket fica FORA da faxina de binários
 * órfãos de propósito (se estivesse dentro, as fotos seriam apagadas em 24h —
 * ver o cabeçalho da migration 20260827140000).
 *
 * A MESMA conta existe em SQL, dentro de `fn_salvar_minha_foto`, e é o CHECK
 * `foto_path = 'avatares/' || id || '.jpg'` que garante que as duas concordam.
 * `confirmarEnvioFoto` compara o caminho daqui com o que a RPC devolveu, para
 * uma divergência virar erro visível em vez de avatar quebrado em silêncio.
 */
export function caminhoDaFoto(usuarioId: string): string {
  return `avatares/${usuarioId}.jpg`;
}
