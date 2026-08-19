import "server-only";

import { createHash } from "node:crypto";

import {
  ANEXO_TAMANHO_MAXIMO_BYTES,
  ANEXO_TAMANHO_MAXIMO_MB,
} from "@/lib/anexos-limite";
import { createAdminClient } from "@/lib/supabase/admin";

/** Bucket privado de anexos. Nenhum client fala com ele direto. */
export const BUCKET_ARQUIVOS = "anexos";

/**
 * Limite por arquivo. NÃO é configurável por env: o limite de verdade é o teto
 * de payload da Vercel, e prometer mais do que a plataforma entrega foi
 * exatamente o que fez anexo grande sumir em silêncio. O porquê do número está
 * em `@/lib/anexos-limite`.
 */
export const TAMANHO_MAXIMO_MB = ANEXO_TAMANHO_MAXIMO_MB;

const BYTES_POR_MB = 1024 * 1024;

/** Validade da URL assinada. Curta de propósito: o link não circula. */
const SEGUNDOS_URL_ASSINADA = 5 * 60;

/**
 * Extensões que não entram. Executável anexado num documento é vetor de
 * ataque, não é anexo de nota fiscal.
 */
const EXTENSOES_BLOQUEADAS = new Set([
  ".exe", ".bat", ".cmd", ".com", ".cpl", ".dll", ".jar", ".js", ".jse",
  ".lnk", ".msi", ".msp", ".ps1", ".reg", ".scr", ".sh", ".vb", ".vbe",
  ".vbs", ".wsf", ".app", ".dmg", ".pkg", ".deb", ".rpm", ".apk",
]);

const MIMES_BLOQUEADOS = [
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-executable",
  "application/x-sharedlib",
  "application/vnd.microsoft.portable-executable",
  "application/x-apple-diskimage",
  "text/javascript",
  "application/javascript",
];

/** Extensão do nome, em minúsculas, com o ponto. Vazio quando não tem. */
export function extensaoDoNome(nome: string): string {
  const ponto = nome.lastIndexOf(".");
  return ponto === -1 ? "" : nome.slice(ponto).toLowerCase();
}

/**
 * Recusa o arquivo antes de gastar upload. Devolve a mensagem pt-BR do
 * problema, ou null quando está tudo certo.
 */
export function validarArquivo(params: {
  nome: string;
  tipoMime: string;
  tamanhoBytes: number;
}): string | null {
  const { nome, tipoMime, tamanhoBytes } = params;

  if (nome.trim() === "") return "Arquivo sem nome";
  if (tamanhoBytes <= 0) return "Arquivo vazio";

  if (tamanhoBytes > ANEXO_TAMANHO_MAXIMO_BYTES) {
    const tamanhoMb = (tamanhoBytes / BYTES_POR_MB).toLocaleString("pt-BR", {
      maximumFractionDigits: 1,
    });
    return `O arquivo tem ${tamanhoMb} MB e o limite é ${TAMANHO_MAXIMO_MB} MB`;
  }

  const extensao = extensaoDoNome(nome);
  if (EXTENSOES_BLOQUEADAS.has(extensao)) {
    return `Arquivo ${extensao} não é permitido por segurança`;
  }

  const mime = tipoMime.toLowerCase();
  if (MIMES_BLOQUEADOS.some((bloqueado) => mime === bloqueado)) {
    return "Este tipo de arquivo não é permitido por segurança";
  }

  return null;
}

/**
 * SHA-256 do conteúdo. É a chave do dedup: mesmo hash e mesmo tamanho
 * significam mesmo binário, e o registro é reusado em vez de subir de novo.
 *
 * Recebe Blob (File é um Blob) porque desde o upload direto quem é hasheado é o
 * objeto BAIXADO DE VOLTA do Storage, não o arquivo que o navegador diz ter
 * mandado: o hash é a chave do dedup, e chave que o cliente escolhe permite
 * apontar o documento de um para o binário de outro.
 */
export async function hashDoArquivo(arquivo: Blob): Promise<string> {
  const bytes = Buffer.from(await arquivo.arrayBuffer());
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Path novo no bucket. NEUTRO de propósito: o caminho não diz a que documento
 * o arquivo pertence, porque o mesmo binário serve cotação, OC, lançamento e
 * pagamento ao mesmo tempo. Quem manda na permissão é o vínculo.
 */
export function pathNovo(nome: string): string {
  const agora = new Date();
  const ano = agora.getUTCFullYear();
  const mes = String(agora.getUTCMonth() + 1).padStart(2, "0");
  return `arquivos/${ano}/${mes}/${crypto.randomUUID()}${extensaoDoNome(nome)}`;
}

/**
 * O caminho foi emitido por `pathNovo`?
 *
 * O caminho vai para o navegador no preparo do envio e volta na confirmação —
 * ou seja, passa pela mão do cliente. Antes de virar registro ele é conferido
 * aqui: sem isto daria para confirmar apontando para o objeto de OUTRO anexo.
 * O unique de `path_storage` ainda barraria o segundo registro, mas a recusa
 * sairia como erro de banco em vez de "caminho inválido".
 */
export function ehCaminhoDeUpload(path: string): boolean {
  return /^arquivos\/\d{4}\/\d{2}\/[0-9a-f-]{36}(\.[A-Za-z0-9]+)?$/.test(path);
}

/**
 * Mensagem única para a falta da chave de serviço. Sem ela, anexo não sobe nem
 * abre, e o erro genérico ("não foi possível enviar") mandaria você debugar o
 * lugar errado. Aqui o problema se identifica sozinho.
 */
const ERRO_SEM_CHAVE =
  "Anexos indisponíveis: a variável SUPABASE_SERVICE_ROLE_KEY não está configurada no ambiente do servidor. Configure na Vercel (Settings > Environment Variables) e faça um novo deploy.";

/** Client admin com erro falante quando a chave não existe no ambiente. */
function clienteDoStorage(): ReturnType<typeof createAdminClient> | null {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

/**
 * Crédito de upload para UM caminho: o navegador manda o binário direto para o
 * Storage com este token, sem passar pela server action.
 *
 * É o que destrava anexo grande. A function da Vercel recusa corpo acima de
 * ~4,5 MB (teto da plataforma, não configurável), então enquanto o arquivo
 * atravessava a action o limite real era esse, não o que a tela prometia. Aqui
 * a action só decide SE pode e para ONDE vai; os bytes não passam por ela.
 *
 * A permissão é checada antes de chamar isto. O token vale para um caminho só,
 * gerado agora, e o caminho é aleatório: não dá para sobrescrever anexo de
 * outro documento com ele.
 */
export async function criarUploadAssinado(
  path: string,
): Promise<{ path: string; token: string } | { erro: string }> {
  const admin = clienteDoStorage();
  if (!admin) return { erro: ERRO_SEM_CHAVE };

  const { data, error } = await admin.storage
    .from(BUCKET_ARQUIVOS)
    .createSignedUploadUrl(path);

  return error || !data
    ? { erro: "Não foi possível preparar o envio. Tente novamente" }
    : { path: data.path, token: data.token };
}

/**
 * Lê de volta o objeto recém-enviado, para o SERVIDOR medir e hashear o que
 * realmente chegou.
 *
 * Sem isto, tamanho e hash seriam o que o navegador disse que mandou — e os
 * dois decidem coisa séria: o tamanho aparece na tela e o hash é a chave do
 * dedup, que faz um documento reusar o binário de outro. É a contrapartida
 * honesta de deixar o upload sair da server action.
 */
export async function lerBinario(
  path: string,
): Promise<{ blob: Blob; tamanhoBytes: number } | { erro: string }> {
  const admin = clienteDoStorage();
  if (!admin) return { erro: ERRO_SEM_CHAVE };

  const { data, error } = await admin.storage
    .from(BUCKET_ARQUIVOS)
    .download(path);

  if (error || !data) {
    return { erro: "O arquivo não chegou ao servidor. Tente enviar de novo" };
  }
  return { blob: data, tamanhoBytes: data.size };
}

/**
 * URL assinada de curta duração (5 minutos) para baixar ou pré-visualizar.
 * Devolve o motivo em vez de só null: a falta da chave de serviço precisa se
 * identificar, não virar "não foi possível gerar o link".
 */
export async function urlAssinada(
  path: string,
): Promise<{ url: string } | { erro: string }> {
  const admin = clienteDoStorage();
  if (!admin) return { erro: ERRO_SEM_CHAVE };

  const { data, error } = await admin.storage
    .from(BUCKET_ARQUIVOS)
    .createSignedUrl(path, SEGUNDOS_URL_ASSINADA);

  return error || !data
    ? { erro: "Não foi possível gerar o link do arquivo" }
    : { url: data.signedUrl };
}

/**
 * Apaga binários do bucket. Só a faxina de órfãos chama, depois de a linha de
 * `arquivos` já ter saído: se isto falhar, sobra binário sem referência
 * (desperdício de espaço), nunca referência sem binário (tela quebrada).
 */
export async function removerBinarios(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const admin = clienteDoStorage();
  if (!admin) return;
  await admin.storage.from(BUCKET_ARQUIVOS).remove(paths);
}
