/**
 * Fila de anexos de um formulário de criação: as regras puras (limite por tipo,
 * tipo aceito, tamanho) e o envio depois que o documento existe.
 *
 * Módulo puro de propósito: sem React, sem Supabase, sem "use client". O envio
 * de um arquivo entra por parâmetro, então os testes provam a orquestração sem
 * rede, e quem usa passa o `enviarAnexoDoNavegador`.
 */

/** Resultado do envio de UM arquivo: o mesmo contrato do `enviarAnexoDoNavegador`. */
export type ResultadoEnvio = { ok: true } | { erro: string };

export type EnviarUm = (entidade: string, entidadeId: string, arquivo: File) => Promise<ResultadoEnvio>;

export interface FalhaDeEnvio {
  nome: string;
  erro: string;
}

/**
 * Regra de um grupo de anexos (as fotos, ou os arquivos): quantos cabem, quais
 * tipos e até que tamanho. `tipos` vazio aceita qualquer tipo.
 */
export interface RegraDeAnexos {
  /** "foto" / "arquivo", para a mensagem de recusa. */
  nomeSingular: string;
  nomePlural: string;
  maximo: number;
  tamanhoMaximoBytes: number;
  tipos: readonly string[];
  /** Como a tela descreve os tipos na recusa: "JPEG, PNG ou WebP". */
  descricaoTipos: string;
}

const BYTES_POR_MB = 1024 * 1024;

function tamanhoEmMb(bytes: number): string {
  return (bytes / BYTES_POR_MB).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

/**
 * Separa, dos arquivos escolhidos, os que entram e os recusados com o motivo.
 * `jaTem` é quantos o documento (ou a fila) já tem daquele grupo: o limite é do
 * grupo inteiro, não da escolha da vez.
 */
export function aceitarNovos(
  regra: RegraDeAnexos,
  jaTem: number,
  novos: File[],
): { aceitos: File[]; recusados: string[] } {
  const aceitos: File[] = [];
  const recusados: string[] = [];
  for (const arquivo of novos) {
    if (regra.tipos.length > 0 && !regra.tipos.includes(arquivo.type)) {
      recusados.push(`${arquivo.name}: tipo não aceito como ${regra.nomeSingular} (use ${regra.descricaoTipos})`);
      continue;
    }
    if (arquivo.size > regra.tamanhoMaximoBytes) {
      recusados.push(
        `${arquivo.name} tem ${tamanhoEmMb(arquivo.size)} MB e o limite é ${tamanhoEmMb(regra.tamanhoMaximoBytes)} MB`,
      );
      continue;
    }
    if (jaTem + aceitos.length >= regra.maximo) {
      recusados.push(`${arquivo.name}: o limite é ${regra.maximo} ${regra.nomePlural}`);
      continue;
    }
    aceitos.push(arquivo);
  }
  return { aceitos, recusados };
}

/**
 * A fila de um grupo mudou (a `FilaAnexos` devolve a lista inteira). Remoção vale
 * como veio; o que foi acrescentado passa pela regra.
 */
export function mudarFila(
  regra: RegraDeAnexos,
  atual: File[],
  proxima: File[],
): { fila: File[]; recusados: string[] } {
  if (proxima.length <= atual.length) return { fila: proxima, recusados: [] };
  const novos = proxima.slice(atual.length);
  const { aceitos, recusados } = aceitarNovos(regra, atual.length, novos);
  return { fila: [...atual, ...aceitos], recusados };
}

/**
 * Sobe a fila para o documento que ACABOU de ser salvo, um por vez. Nunca lança:
 * a falha de um arquivo (ou um envio que estoura) vira item da lista devolvida,
 * porque depois do salvar nada pode virar falha do salvar.
 */
export async function subirFila(
  entidade: string,
  entidadeId: string,
  arquivos: File[],
  enviar: EnviarUm,
): Promise<FalhaDeEnvio[]> {
  const falhas: FalhaDeEnvio[] = [];
  for (const arquivo of arquivos) {
    try {
      const resultado = await enviar(entidade, entidadeId, arquivo);
      if ("erro" in resultado) falhas.push({ nome: arquivo.name, erro: resultado.erro });
    } catch {
      falhas.push({ nome: arquivo.name, erro: "O envio falhou" });
    }
  }
  return falhas;
}

/**
 * Aviso do registro salvo com anexo que não subiu: diz que o registro ficou,
 * quais arquivos faltaram e o que fazer. Nulo quando tudo subiu.
 */
export function avisoDeFalhas(registroSalvo: string, falhas: FalhaDeEnvio[]): string | null {
  if (falhas.length === 0) return null;
  const nomes = falhas.map((f) => `${f.nome} (${f.erro})`).join("; ");
  const quantos = falhas.length === 1 ? "1 anexo não subiu" : `${falhas.length} anexos não subiram`;
  return `${registroSalvo}, mas ${quantos}: ${nomes}. Abra o registro e anexe de novo`;
}
