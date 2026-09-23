"use server";

import { z } from "zod";

import { erroAcao } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import {
  basePublica,
  MAX_ETIQUETAS,
} from "@/modules/cadastros/equipamentos/etiqueta-qr";
import {
  montarDocumentoEtiquetas,
  nomeArquivoEtiquetas,
  type EtiquetaEquipamento,
} from "@/modules/cadastros/equipamentos/etiquetas-pdf";

/**
 * Etiquetas QR dos equipamentos, em PDF.
 *
 * ARQUIVO PRÓPRIO, e não o `actions.ts` do módulo, por dois motivos: o PDF é a
 * única coisa daqui que carrega o pdfmake (e ele entra por import dinâmico, ver
 * abaixo), e o `actions.ts` tem outra frente mexendo nele.
 */

const RECURSO = "cadastros.equipamentos" as const;

/**
 * Quantos ids por `.in()`. Cada uuid são 37 caracteres na URL do PostgREST, e
 * 500 de uma vez passariam de 18 KB de query string, perto do ponto em que o
 * proxy recusa a requisição. Em pedaços de 100 fica em uns 4 KB.
 */
const IDS_POR_CONSULTA = 100;

const idsSchema = z
  .array(idSchema)
  .max(MAX_ETIQUETAS, {
    error: `Escolha no máximo ${MAX_ETIQUETAS} equipamentos por vez`,
  })
  .nullable();

export type ResultadoEtiquetas =
  | { ok: true; base64: string; nomeArquivo: string }
  | { erro: string };

const COLUNAS = "id, codigo, descricao, tipo, marca, modelo, placa";

interface LinhaEquipamento {
  id: string;
  codigo: string | null;
  descricao: string;
  tipo: string | null;
  marca: string | null;
  modelo: string | null;
  placa: string | null;
}

/** Ordem da etiqueta: por código, sem código no fim, e pela descrição no empate. */
function ordenar(linhas: LinhaEquipamento[]): EtiquetaEquipamento[] {
  return [...linhas].sort((a, b) => {
    const ca = a.codigo?.trim() ?? "";
    const cb = b.codigo?.trim() ?? "";
    if (!ca && cb) return 1;
    if (ca && !cb) return -1;
    const porCodigo = ca.localeCompare(cb, "pt-BR", { numeric: true });
    if (porCodigo !== 0) return porCodigo;
    return a.descricao.localeCompare(b.descricao, "pt-BR");
  });
}

async function carregar(
  ids: string[] | null,
): Promise<{ linhas: LinhaEquipamento[]; erro: string | null }> {
  const supabase = await createClient();

  // Sem escolha: todos os ATIVOS. Com escolha: exatamente os escolhidos, mesmo
  // inativo, porque quem escolheu o equipamento sabe por que quer a etiqueta.
  if (!ids) {
    return todasAsLinhas<LinhaEquipamento>((de, ate) =>
      supabase
        .from("equipamentos")
        .select(COLUNAS)
        .eq("ativo", true)
        .order("id")
        .range(de, ate),
    );
  }

  const linhas: LinhaEquipamento[] = [];
  for (let i = 0; i < ids.length; i += IDS_POR_CONSULTA) {
    const { data, error } = await supabase
      .from("equipamentos")
      .select(COLUNAS)
      .in("id", ids.slice(i, i + IDS_POR_CONSULTA));
    if (error) return { linhas, erro: error.message };
    linhas.push(...(data ?? []));
  }
  return { linhas, erro: null };
}

/**
 * Gera o PDF das etiquetas QR. `ids` nulo ou vazio = todos os equipamentos
 * ativos. Nunca lança: todo caminho devolve `{ erro }` com uma frase para o
 * toast.
 */
export async function gerarEtiquetasQr(
  ids: string[] | null,
): Promise<ResultadoEtiquetas> {
  try {
    try {
      await exigirPermissao(RECURSO, "ver");
    } catch {
      return { erro: "Sem permissão para gerar etiquetas de equipamentos" };
    }

    const validado = idsSchema.safeParse(ids);
    if (!validado.success) {
      return {
        erro: validado.error.issues[0]?.message ?? "Seleção de equipamentos inválida",
      };
    }
    const escolhidos =
      validado.data && validado.data.length > 0
        ? [...new Set(validado.data)]
        : null;

    const base = basePublica(process.env.NEXT_PUBLIC_SITE_URL);
    if (!base) {
      return {
        erro:
          "A URL pública do app não está configurada (NEXT_PUBLIC_SITE_URL). " +
          "Sem ela o QR não tem para onde apontar. Peça para configurar e tente de novo.",
      };
    }

    const { linhas, erro } = await carregar(escolhidos);
    if (erro) {
      return erroAcao(
        "cadastros.equipamentos.etiquetasQr.carregar",
        new Error(erro),
        "Não foi possível carregar os equipamentos",
      );
    }
    if (linhas.length === 0) {
      return {
        erro: escolhidos
          ? "Nenhum dos equipamentos escolhidos foi encontrado"
          : "Não há equipamento ativo para gerar etiqueta",
      };
    }

    // Import DINÂMICO do pdfmake: um import de topo de `@/lib/pdf` estoura no
    // LOAD em serverless (o pdfkit lê .afm do disco) e derruba todas as actions
    // do arquivo. Mesmo motivo de `gerarResumoFolhaPdf`.
    const { gerarPdf } = await import("@/lib/pdf");
    const bytes = await gerarPdf(montarDocumentoEtiquetas(ordenar(linhas), base));

    return {
      ok: true,
      base64: bytes.toString("base64"),
      nomeArquivo: nomeArquivoEtiquetas(new Date()),
    };
  } catch (erro) {
    return erroAcao(
      "cadastros.equipamentos.etiquetasQr",
      erro,
      "Não foi possível gerar as etiquetas em PDF",
    );
  }
}
