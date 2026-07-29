import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  rotuloDaEntidade,
  type EntidadeAnexo,
} from "@/modules/_shared/anexos/entidades";

/** Anexo como a tela mostra: dados do arquivo + de onde ele veio. */
export interface AnexoDoDocumento {
  /** Id do VÍNCULO (é o que a tela remove, nunca o arquivo). */
  vinculoId: string;
  arquivoId: string;
  nome: string;
  tipoMime: string | null;
  tamanhoBytes: number;
  criadoEm: string;
  criadoPorNome: string | null;
  /** Veio propagado de outro documento da cadeia. */
  propagado: boolean;
  /** "COT-2026-0003", "OC-2026-0005"... quando propagado e o número existe. */
  origemNumero: string | null;
  /** "cotação", "ordem de compra"... para o badge quando não há número. */
  origemRotulo: string | null;
}

interface LinhaVinculo {
  id: string;
  arquivo_id: string;
  origem: string;
  vinculo_origem_id: string | null;
  nome_exibicao: string | null;
  created_at: string;
  created_by: string | null;
  arquivos: {
    nome_original: string;
    tipo_mime: string | null;
    tamanho_bytes: number;
  } | null;
}

/** Tabela e coluna onde mora o número de cada tipo de documento. */
const NUMERO_POR_ENTIDADE: Partial<
  Record<EntidadeAnexo, "cotacoes" | "ordens_compra" | "lancamentos">
> = {
  cotacao: "cotacoes",
  ordem_compra: "ordens_compra",
  lancamento: "lancamentos",
};

/**
 * Anexos de um documento, na ordem em que entraram. A RLS dos vínculos cobre a
 * permissão: quem não vê o documento não vê o anexo.
 *
 * Resolve, para os anexos propagados, o número do documento de origem, para a
 * tela poder dizer "da COT-2026-0003". São no máximo três consultas extras
 * (uma por tipo de origem presente), não uma por linha.
 */
export async function listarAnexosDoDocumento(
  entidade: EntidadeAnexo,
  entidadeId: string,
): Promise<AnexoDoDocumento[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("anexo_vinculos")
    .select(
      `id, arquivo_id, origem, vinculo_origem_id, nome_exibicao, created_at, created_by,
       arquivos(nome_original, tipo_mime, tamanho_bytes)`,
    )
    .eq("entidade_tipo", entidade)
    .eq("entidade_id", entidadeId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  const linhas = data as LinhaVinculo[];
  if (linhas.length === 0) return [];

  // Nome de quem anexou, pela RPC de auditoria (a tabela usuarios não é
  // legível por quem só tem permissão do módulo).
  const idsUsuarios = [
    ...new Set(
      linhas
        .map((linha) => linha.created_by)
        .filter((id): id is string => id !== null),
    ),
  ];
  const nomes = new Map<string, string>();
  if (idsUsuarios.length > 0) {
    const { data: usuarios } = await supabase.rpc("nomes_usuarios_auditoria", {
      p_ids: idsUsuarios,
    });
    for (const usuario of usuarios ?? []) nomes.set(usuario.id, usuario.nome);
  }

  // Origem dos propagados: primeiro os vínculos de origem, depois o número do
  // documento de cada um.
  const idsOrigem = [
    ...new Set(
      linhas
        .map((linha) => linha.vinculo_origem_id)
        .filter((id): id is string => id !== null),
    ),
  ];

  const origemPorVinculo = new Map<
    string,
    { tipo: EntidadeAnexo; id: string }
  >();
  if (idsOrigem.length > 0) {
    const { data: origens } = await supabase
      .from("anexo_vinculos")
      .select("id, entidade_tipo, entidade_id")
      .in("id", idsOrigem);
    for (const origem of origens ?? []) {
      origemPorVinculo.set(origem.id, {
        tipo: origem.entidade_tipo as EntidadeAnexo,
        id: origem.entidade_id,
      });
    }
  }

  const numeroPorDocumento = new Map<string, string>();
  for (const [tipo, tabela] of Object.entries(NUMERO_POR_ENTIDADE)) {
    const ids = [...origemPorVinculo.values()]
      .filter((origem) => origem.tipo === tipo)
      .map((origem) => origem.id);
    if (ids.length === 0 || !tabela) continue;

    const { data: documentos } = await supabase
      .from(tabela)
      .select("id, numero")
      .in("id", ids);
    for (const documento of documentos ?? []) {
      if (documento.numero) {
        numeroPorDocumento.set(`${tipo}:${documento.id}`, documento.numero);
      }
    }
  }

  return linhas.map((linha) => {
    const origem = linha.vinculo_origem_id
      ? origemPorVinculo.get(linha.vinculo_origem_id)
      : undefined;
    return {
      vinculoId: linha.id,
      arquivoId: linha.arquivo_id,
      nome: linha.nome_exibicao ?? linha.arquivos?.nome_original ?? "arquivo",
      tipoMime: linha.arquivos?.tipo_mime ?? null,
      tamanhoBytes: linha.arquivos?.tamanho_bytes ?? 0,
      criadoEm: linha.created_at,
      criadoPorNome: linha.created_by
        ? (nomes.get(linha.created_by) ?? null)
        : null,
      propagado: linha.origem === "propagado",
      origemNumero: origem
        ? (numeroPorDocumento.get(`${origem.tipo}:${origem.id}`) ?? null)
        : null,
      origemRotulo: origem ? rotuloDaEntidade(origem.tipo) : null,
    };
  });
}

/**
 * Anexos de vários documentos do mesmo tipo, agrupados por id. Serve para uma
 * listagem pré-carregar os anexos de todas as linhas numa consulta (telas de RH
 * com drawer), sem carregamento no client.
 */
export async function listarAnexosPorDocumento(
  entidade: EntidadeAnexo,
  entidadeIds: string[],
): Promise<Record<string, AnexoDoDocumento[]>> {
  if (entidadeIds.length === 0) return {};

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("anexo_vinculos")
    .select(
      `id, entidade_id, arquivo_id, origem, vinculo_origem_id, nome_exibicao,
       created_at, created_by,
       arquivos(nome_original, tipo_mime, tamanho_bytes)`,
    )
    .eq("entidade_tipo", entidade)
    .in("entidade_id", entidadeIds)
    .order("created_at", { ascending: true });

  if (error || !data) return {};

  const porDocumento: Record<string, AnexoDoDocumento[]> = {};
  for (const linha of data as (LinhaVinculo & { entidade_id: string })[]) {
    (porDocumento[linha.entidade_id] ??= []).push({
      vinculoId: linha.id,
      arquivoId: linha.arquivo_id,
      nome: linha.nome_exibicao ?? linha.arquivos?.nome_original ?? "arquivo",
      tipoMime: linha.arquivos?.tipo_mime ?? null,
      tamanhoBytes: linha.arquivos?.tamanho_bytes ?? 0,
      criadoEm: linha.created_at,
      criadoPorNome: null,
      propagado: linha.origem === "propagado",
      origemNumero: null,
      origemRotulo: null,
    });
  }
  return porDocumento;
}
