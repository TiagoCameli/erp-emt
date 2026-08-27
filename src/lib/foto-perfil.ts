import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Operações de Storage da foto de perfil. SOMENTE no servidor.
 *
 * Bucket separado do `anexos`, e a razão não é organização: a faxina de binários
 * órfãos (`fn_binarios_sem_registro` + o cron de /api/faxina-arquivos) varre o
 * bucket `anexos` inteiro e apaga todo objeto sem linha em `public.arquivos`.
 * Foto não é anexo de documento nenhum, então nunca teria essa linha — e
 * desapareceria 24 horas depois de subir, sem erro em lugar nenhum. Provado em
 * supabase/provas/foto_de_perfil_so_a_propria_e_fora_da_faxina.sql.
 *
 * Nenhum client fala com este bucket por conta própria: não há policy em
 * `storage.objects` (modelo que o projeto fechou em 20260728200004), então a
 * leitura sai por URL assinada e a escrita por token de upload assinado, os dois
 * emitidos aqui com a chave de serviço.
 */

/** Bucket privado das fotos de perfil. */
export const BUCKET_AVATARES = "avatares";

/**
 * Validade da URL assinada da foto: 1 hora.
 *
 * Mais longa que os 5 minutos do anexo de propósito, e o motivo é onde ela
 * aparece: o avatar está no LAYOUT, ou seja, em toda página. Cinco minutos
 * bastariam (o servidor assina de novo a cada navegação), mas uma aba deixada
 * aberta passaria a mostrar as iniciais depois de cinco minutos parada. Uma hora
 * cobre o expediente inteiro de uso normal, e o `AvatarFallback` devolve as
 * iniciais se a URL vencer — não quebra, só volta ao que era.
 */
const SEGUNDOS_URL_FOTO = 60 * 60;

/**
 * Mensagem única para a falta da chave de serviço. Sem ela, foto não sobe nem
 * aparece, e o erro genérico mandaria depurar o lugar errado.
 */
const ERRO_SEM_CHAVE =
  "Foto de perfil indisponível: a variável SUPABASE_SERVICE_ROLE_KEY não está configurada no ambiente do servidor. Configure na Vercel (Settings > Environment Variables) e faça um novo deploy.";

/** Client admin com erro falante quando a chave não existe no ambiente. */
function clienteDoStorage(): ReturnType<typeof createAdminClient> | null {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

/**
 * Crédito de upload para O caminho da própria foto: o navegador manda os bytes
 * direto para o Storage com este token, sem passar pela server action.
 *
 * `upsert: true` é obrigatório aqui, e é consequência do caminho ser
 * determinístico (um objeto por pessoa): na SEGUNDA troca de foto o objeto já
 * existe, e sem upsert o token sairia recusando com "resource already exists".
 * Quem chama decide o caminho a partir de `auth.uid()`, então este token nunca
 * aponta para o objeto de outra pessoa.
 */
export async function criarUploadDaFoto(
  path: string,
): Promise<{ path: string; token: string } | { erro: string }> {
  const admin = clienteDoStorage();
  if (!admin) return { erro: ERRO_SEM_CHAVE };

  const { data, error } = await admin.storage
    .from(BUCKET_AVATARES)
    .createSignedUploadUrl(path, { upsert: true });

  return error || !data
    ? { erro: "Não foi possível preparar o envio da foto. Tente novamente" }
    : { path: data.path, token: data.token };
}

/**
 * O objeto chegou mesmo ao bucket?
 *
 * Devolve `{ existe: boolean }` ou `{ erro }`, e a distinção é o ponto: "não
 * achei" e "não consegui olhar" precisam de respostas diferentes. Tratar erro de
 * rede como ausência gravaria a foto como inexistente logo depois de ela subir;
 * tratar ausência como erro esconderia o caso real (upload que falhou) atrás de
 * "tente novamente".
 *
 * É esta checagem que impede a linha do banco apontar para um objeto que não
 * existe, o que na tela seria um avatar quebrado sem explicação.
 */
export async function fotoExiste(
  path: string,
): Promise<{ existe: boolean } | { erro: string }> {
  const admin = clienteDoStorage();
  if (!admin) return { erro: ERRO_SEM_CHAVE };

  const { data, error } = await admin.storage
    .from(BUCKET_AVATARES)
    .exists(path);

  if (error) {
    return { erro: "Não foi possível confirmar o envio da foto. Tente de novo" };
  }
  return { existe: data === true };
}

/**
 * URL assinada da foto, para o `<img>` da sidebar e da prévia.
 *
 * Devolve null (e não erro) quando não dá para assinar: o avatar cai nas
 * iniciais, que é degradação aceitável. Página inteira quebrar porque a foto não
 * assinou seria pior — e é o layout, então quebraria TODAS as páginas.
 */
export async function urlAssinadaDaFoto(path: string): Promise<string | null> {
  const admin = clienteDoStorage();
  if (!admin) return null;

  const { data, error } = await admin.storage
    .from(BUCKET_AVATARES)
    .createSignedUrl(path, SEGUNDOS_URL_FOTO);

  return error || !data ? null : data.signedUrl;
}

/**
 * Apaga o binário da foto.
 *
 * Chamada DEPOIS de a coluna já ter virado null, na mesma ordem da faxina de
 * anexos: se isto falhar, sobra binário sem referência (desperdício de alguns
 * KB), nunca referência sem binário (avatar quebrado na tela). Este bucket fica
 * fora da faxina, então o objeto sobrando não é limpo depois — por isso a ordem
 * importa, mas a falha não é grave.
 */
export async function removerFotoDoBucket(path: string): Promise<void> {
  const admin = clienteDoStorage();
  if (!admin) return;
  await admin.storage.from(BUCKET_AVATARES).remove([path]);
}
