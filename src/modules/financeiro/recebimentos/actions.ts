"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao, textoDoErro } from "@/lib/erros";
import { dataHojeISO } from "@/lib/formatadores";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { subarvoreDosCentros } from "@/modules/financeiro/lancamentos/queries";
import {
  facetarFilaAReceber,
  valoresFiltrosAReceberSchema,
} from "@/modules/financeiro/recebimentos/fila-a-receber";
/*
 * Só o TIPO da planilha vem no topo: o módulo puxa o exceljs, e um import de
 * topo o carregaria em toda chamada de toda action deste arquivo (ver
 * `pagamentos/actions.ts`).
 */
import type {
  FormatoPlanilhaRecebimentos,
  RecebimentoPlanilha,
} from "@/modules/financeiro/recebimentos/planilha";
import {
  lerRecebimentosParaPlanilha,
  listarParcelasAReceber,
  listarParcelasRecebidas,
  type FiltrosRecebidas,
  type RecebidasPagina,
} from "@/modules/financeiro/recebimentos/queries";
import { filtrosRecebidasSchema } from "@/modules/financeiro/recebimentos/schemas";

const RECURSO = "financeiro.recebimentos" as const;
const ROTA = "/financeiro/recebimentos";
/** A outra tela em que a mesma parcela aparece. */
const ROTA_LANCAMENTOS = "/financeiro/lancamentos";

export type ResultadoAcao = { ok: true } | { erro: string };

const dataSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Data inválida" });

/**
 * Dá um recebimento como recebido, via `fn_pagar_parcela`.
 *
 * A função do banco é a MESMA do pagamento, e é ela que sabe a diferença: no a
 * receber não há exigência de aprovação prévia nem de data programada, não há
 * trava de saldo (dinheiro entrando não pode estourar a conta) e o valor entra
 * SOMANDO no saldo. Ter uma segunda função só para o recebimento faria as duas
 * divergirem no primeiro ajuste de desconto ou juros.
 *
 * A mensagem de erro do banco é repassada direto ao toast: quem recusa é ele, e
 * traduzir a recusa aqui só produziria duas versões da mesma regra.
 */
export async function darComoRecebido(
  parcelaId: string,
  contaId: string,
  data: string,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para dar recebimentos como recebidos" };
  }

  const parcelaValida = idSchema.safeParse(parcelaId);
  if (!parcelaValida.success) return { erro: "Recebimento inválido" };

  const contaValida = idSchema.safeParse(contaId);
  if (!contaValida.success) return { erro: "Selecione a conta que recebeu" };

  const dataValida = dataSchema.safeParse(data);
  if (!dataValida.success) return { erro: "Informe a data do recebimento" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_pagar_parcela", {
    p_parcela_id: parcelaValida.data,
    p_conta_id: contaValida.data,
    p_data_pagamento: dataValida.data,
  });

  if (error) {
    return erroAcao(
      "financeiro.recebimentos.darComoRecebido",
      error,
      error.message || "Não foi possível registrar o recebimento",
    );
  }

  revalidatePath(ROTA);
  // O lançamento muda de status quando a última parcela é recebida, então a
  // lista de Lançamentos também sai de cache.
  revalidatePath(ROTA_LANCAMENTOS);
  return { ok: true };
}

/**
 * Estorna um recebimento já baixado, via `fn_estornar_pagamento`.
 *
 * Mesma função do estorno de pagamento, pelo mesmo motivo de `darComoRecebido`
 * usar a mesma `fn_pagar_parcela`: desfazer uma baixa é uma regra só, e duas
 * cópias dela divergiriam no primeiro ajuste. É o banco que ramifica por tipo,
 * cobra `financeiro.recebimentos`/`excluir` no a receber e PRESERVA a conta de
 * destino da parcela, que no recebimento é dado do cadastro e não da baixa.
 *
 * O banco também recusa parcela conciliada. A mensagem dele vai direto ao
 * toast: quem recusa é ele.
 */
export async function estornarRecebimento(
  parcelaId: string,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "excluir");
  } catch {
    return { erro: "Sem permissão para estornar recebimentos" };
  }

  const parcelaValida = idSchema.safeParse(parcelaId);
  if (!parcelaValida.success) return { erro: "Recebimento inválido" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_estornar_pagamento", {
    p_parcela_id: parcelaValida.data,
  });

  if (error) {
    return erroAcao(
      "financeiro.recebimentos.estornarRecebimento",
      error,
      error.message || "Não foi possível estornar o recebimento. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  // Estornar a última parcela recebida devolve o lançamento para "aberto", então
  // a lista de Lançamentos também sai de cache.
  revalidatePath(ROTA_LANCAMENTOS);
  return { ok: true };
}

/**
 * Busca uma página da aba "Recebidos" com os filtros já validados pela página.
 *
 * Existe porque a aba é paginada no servidor: a primeira página vem do Server
 * Component e as seguintes por aqui, levando os MESMOS filtros. Sem eles, a
 * segunda página voltaria sem filtro nenhum e a barra continuaria dizendo que
 * está filtrando.
 */
export async function buscarParcelasRecebidas(
  pagina: number,
  tamanho: number,
  filtros: FiltrosRecebidas,
): Promise<RecebidasPagina> {
  await exigirPermissao(RECURSO, "ver");
  return listarParcelasRecebidas({ pagina, tamanho, filtros });
}

/** Teto de linhas por arquivo, o mesmo da exportação de Pagamentos. */
const LIMITE_PLANILHA_RECEBIMENTOS = 25_000;

/** Página de leitura do histórico, bem abaixo do teto de 1.000 do PostgREST. */
const PAGINA_LEITURA_RECEBIDAS = 500;

/** Trava do laço de páginas: 25.000 linhas em páginas de 500 são 50 voltas. */
const TETO_DE_PAGINAS = 200;

/** O arquivo pronto, ou o motivo de não ter saído. */
export type ResultadoPlanilhaRecebimentos =
  | { ok: true; base64: string; nomeArquivo: string }
  | { erro: string };

const FORMATOS_PLANILHA = new Set(["pagamento", "centro", "rateio"]);

/**
 * Gera a planilha (.xlsx) de Recebimentos, com as abas "A receber" e
 * "Recebidos", e devolve em base64 para o navegador baixar.
 *
 * O espelho de `gerarPlanilhaPagamentos`, com os mesmos cuidados e pelos mesmos
 * motivos (lá cada um está explicado): o recorte sai das MESMAS funções da tela
 * (`facetarFilaAReceber` em memória, `listarParcelasRecebidas` no banco), os
 * filtros são revalidados com `strictObject`, o histórico é lido em páginas com
 * conferência da contagem, e o módulo da planilha entra por `await import`.
 */
export async function gerarPlanilhaRecebimentos(
  valoresAReceber: unknown,
  filtrosRecebidas: unknown,
  formato: FormatoPlanilhaRecebimentos,
): Promise<ResultadoPlanilhaRecebimentos> {
  // Exportar é ler: mesma permissão que abre a tela.
  try {
    await exigirPermissao(RECURSO, "ver");
  } catch {
    return { erro: "Sem permissão para exportar recebimentos" };
  }

  if (!FORMATOS_PLANILHA.has(formato)) {
    return { erro: "Formato inválido para exportar" };
  }

  const daFila = valoresFiltrosAReceberSchema.safeParse(valoresAReceber);
  if (!daFila.success) {
    return { erro: "Filtro inválido na aba A receber. Recarregue a página" };
  }
  const doHistorico = filtrosRecebidasSchema.safeParse(filtrosRecebidas);
  if (!doHistorico.success) {
    return { erro: "Filtro inválido na aba Recebidos. Recarregue a página" };
  }

  let idsAReceber: string[];
  let idsRecebidos: string[];
  let totalRecebidos: number;
  try {
    const supabase = await createClient();

    // A fila vem inteira e é filtrada em memória, exatamente como na tela.
    const fila = await listarParcelasAReceber();
    const centroIds = daFila.data.centroIds;
    const subarvore =
      centroIds.length === 0
        ? null
        : new Set(await subarvoreDosCentros(supabase, centroIds));
    idsAReceber = facetarFilaAReceber(fila, daFila.data, subarvore).linhas.map(
      (parcela) => parcela.id,
    );

    // O histórico vem página por página, com `Set` contra linha repetida entre
    // páginas (ver `gerarPlanilhaPagamentos`).
    const vistos = new Set<string>();
    totalRecebidos = 0;
    for (let pagina = 0; pagina < TETO_DE_PAGINAS; pagina += 1) {
      const lote = await listarParcelasRecebidas({
        pagina,
        tamanho: PAGINA_LEITURA_RECEBIDAS,
        filtros: doHistorico.data,
      });
      totalRecebidos = lote.total;
      if (totalRecebidos > LIMITE_PLANILHA_RECEBIMENTOS) break;
      for (const parcela of lote.itens) vistos.add(parcela.id);
      if (lote.itens.length < PAGINA_LEITURA_RECEBIDAS) break;
      if (vistos.size >= totalRecebidos) break;
    }
    idsRecebidos = [...vistos];
  } catch (erro) {
    return erroAcao(
      "financeiro.recebimentos.gerarPlanilhaRecebimentos",
      erro,
      // O texto real sobe para o toast: sem log de aplicação na Vercel, é a
      // única pista de uma falha aqui (ver `gerarPlanilhaPagamentos`).
      `Não foi possível ler os recebimentos para exportar: ${textoDoErro(erro)}`,
    );
  }

  const total = idsAReceber.length + totalRecebidos;
  if (total === 0) {
    return { erro: "O filtro atual não tem nenhum recebimento para exportar" };
  }
  if (total > LIMITE_PLANILHA_RECEBIMENTOS) {
    return {
      erro: `O filtro atual tem ${total.toLocaleString("pt-BR")} recebimentos, acima do limite de ${LIMITE_PLANILHA_RECEBIMENTOS.toLocaleString("pt-BR")} por arquivo. Filtre por mês de referência e exporte em partes`,
    };
  }
  // Leu menos do que o banco disse que existe: a lista mudou no meio da
  // leitura. Recusar é melhor do que entregar planilha incompleta.
  if (idsRecebidos.length < totalRecebidos) {
    return erroAcao(
      "financeiro.recebimentos.gerarPlanilhaRecebimentos",
      new Error(`leitura incompleta: ${idsRecebidos.length} de ${totalRecebidos}`),
      `Li ${idsRecebidos.length.toLocaleString("pt-BR")} de ${totalRecebidos.toLocaleString("pt-BR")} recebimentos porque a lista mudou durante a exportação. Exporte de novo`,
    );
  }

  let aReceber: RecebimentoPlanilha[];
  let recebidos: RecebimentoPlanilha[];
  try {
    const detalhes = await lerRecebimentosParaPlanilha([
      ...idsAReceber,
      ...idsRecebidos,
    ]);
    const detalhar = (ids: string[]) =>
      ids
        .map((id) => detalhes.get(id))
        .filter((item): item is RecebimentoPlanilha => item !== undefined);
    aReceber = detalhar(idsAReceber);
    recebidos = detalhar(idsRecebidos);
  } catch (erro) {
    return erroAcao(
      "financeiro.recebimentos.gerarPlanilhaRecebimentos",
      erro,
      `Não foi possível montar a planilha de recebimentos: ${textoDoErro(erro)}`,
    );
  }

  const { montarPlanilhaRecebimentos, nomeArquivoPlanilhaRecebimentos } =
    await import("@/modules/financeiro/recebimentos/planilha");

  const workbook = montarPlanilhaRecebimentos({ aReceber, recebidos, formato });
  workbook.created = new Date();
  const conteudo = await workbook.xlsx.writeBuffer();

  return {
    ok: true,
    base64: Buffer.from(conteudo).toString("base64"),
    nomeArquivo: nomeArquivoPlanilhaRecebimentos(dataHojeISO(), formato),
  };
}
