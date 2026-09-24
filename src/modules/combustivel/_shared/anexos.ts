import type { RegraDeAnexos } from "@/modules/_shared/anexos/fila";

/**
 * Anexos das saídas, entradas e transferências de combustível, com as regras do
 * AnexosUploader da origem (Gestão Obras): dois grupos, Fotos e Arquivos, até 8
 * de cada, 10 MB por arquivo, e os mesmos tipos aceitos.
 *
 * No ERP os dois grupos são vínculos do MESMO documento (`combustivel_saida`,
 * `combustivel_entrada`, `combustivel_transferencia`): quem separa foto de arquivo
 * é o tipo do arquivo, como a carga da origem já gravou.
 */

const TAMANHO_MAXIMO_BYTES = 10 * 1024 * 1024;

/** Os da origem, mais o `image/heif` que alguns celulares mandam no lugar do heic. */
export const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;

export const TIPOS_ARQUIVO = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/csv",
  "text/plain",
] as const;

export const REGRA_FOTOS: RegraDeAnexos = {
  nomeSingular: "foto",
  nomePlural: "fotos",
  maximo: 8,
  tamanhoMaximoBytes: TAMANHO_MAXIMO_BYTES,
  tipos: TIPOS_FOTO,
  descricaoTipos: "JPEG, PNG ou WebP",
};

export const REGRA_ARQUIVOS: RegraDeAnexos = {
  nomeSingular: "arquivo",
  nomePlural: "arquivos",
  maximo: 8,
  tamanhoMaximoBytes: TAMANHO_MAXIMO_BYTES,
  tipos: TIPOS_ARQUIVO,
  descricaoTipos: "PDF, Excel, Word, CSV ou texto",
};

/** Foto é qualquer imagem: o anexo migrado conta pelo tipo gravado, não pela lista. */
export function ehFoto(tipoMime: string | null | undefined): boolean {
  return (tipoMime ?? "").startsWith("image/");
}

export type EntidadeCombustivel = "combustivel_saida" | "combustivel_entrada" | "combustivel_transferencia";
