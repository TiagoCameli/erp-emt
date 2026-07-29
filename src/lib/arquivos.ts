import "server-only";

import { createHash } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";

/** Bucket privado de anexos. Nenhum client fala com ele direto. */
export const BUCKET_ARQUIVOS = "anexos";

/** Limite por arquivo. Configurável por env, 25 MB de padrão. */
export const TAMANHO_MAXIMO_MB = Number(
  process.env.ANEXO_TAMANHO_MAXIMO_MB ?? 25,
);

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

  const limite = TAMANHO_MAXIMO_MB * BYTES_POR_MB;
  if (tamanhoBytes > limite) {
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
 */
export async function hashDoArquivo(arquivo: File): Promise<string> {
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
 * Sobe o binário. Usa a chave de serviço porque o bucket não tem policy para
 * usuário logado: o servidor é o único que fala com o Storage, e a permissão
 * já foi checada antes de chegar aqui.
 */
export async function subirBinario(
  path: string,
  arquivo: File,
): Promise<{ erro: string } | null> {
  const admin = clienteDoStorage();
  if (!admin) return { erro: ERRO_SEM_CHAVE };

  const { error } = await admin.storage
    .from(BUCKET_ARQUIVOS)
    .upload(path, arquivo, {
      contentType: arquivo.type || undefined,
      upsert: false,
    });

  return error ? { erro: "Não foi possível enviar o arquivo. Tente novamente" } : null;
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
