"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao } from "@/lib/erros";
import { dataHojeISO, formatarData } from "@/lib/formatadores";
import { idSchema } from "@/lib/id";
import {
  exigirPermissao,
  getUsuarioLogado,
  temPermissao,
} from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import type { EventoTrilha } from "@/components/canonicos/trilha";
import { anexosDoDocumento } from "@/modules/_shared/anexos/actions";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import {
  buscarPagamentosParaEspelho,
  type EspelhoPagamento,
} from "@/modules/financeiro/pagamentos/espelho";
import {
  filtrarFilaAPagar,
  valoresFiltrosAPagarSchema,
} from "@/modules/financeiro/pagamentos/fila-a-pagar";
import { filtrosPagasSchema } from "@/modules/financeiro/pagamentos/filtros-pagas";
import { foraDaJanela } from "@/modules/financeiro/pagamentos/janela";
import { subarvoreDosCentros } from "@/modules/financeiro/lancamentos/queries";
/*
 * Só o TIPO da planilha vem no topo. O módulo em si entra por `await import`
 * dentro da action que o usa: ele puxa o exceljs, e um import de topo o
 * carregaria em toda chamada de toda action deste arquivo — inclusive as de
 * pagar parcela, que são as quentes. Já aconteceu neste app com o pdfmake.
 */
import type {
  FormatoPlanilhaPagamentos,
  PagamentoPlanilha,
} from "@/modules/financeiro/pagamentos/planilha";
import {
  lerPagamentosParaPlanilha,
  listarParcelasAPagar,
  listarParcelasPagas,
  trilhaParcelasDoLancamento,
  type FiltrosParcelasPagas,
  type ParcelasPagasPagina,
} from "@/modules/financeiro/pagamentos/queries";

/** Tudo que o painel de detalhe da parcela mostra, numa ida só ao servidor. */
export interface DetalheParcela {
  espelho: EspelhoPagamento;
  anexos: AnexoDoDocumento[];
  trilha: EventoTrilha[];
}

const RECURSO = "financeiro.pagamentos" as const;
const ROTA = "/financeiro/pagamentos";

export type ResultadoAcao = { ok: true } | { erro: string };

const dataSchema = z.iso.date();

/**
 * Dinheiro do ato do pagamento (desconto, juros e multa, outras despesas):
 * nunca negativo e no teto do NUMERIC(14,2).
 *
 * O "desconto não pode passar do valor da parcela" NÃO é checado aqui de
 * propósito: quem sabe o valor da parcela é o banco (a Server Action não pode
 * confiar no valor que o cliente mandou), e lá existem as duas barreiras, a
 * recusa da fn_pagar_parcela e o check da tabela.
 *
 * Juros e outras despesas não têm teto de valor da parcela: uma parcela de
 * R$ 100 protestada pode custar mais em multa e custas do que ela mesma.
 */
const dinheiroSchema = z.number().min(0).max(999999999999.99);

/**
 * Motivo de pagar fora da data autorizada. Trimado (motivo só de espaços é
 * motivo nenhum, e o banco aplica o mesmo `btrim`) e com teto de 500
 * caracteres, que a coluna `parcela_eventos.motivo` não tem: sem teto aqui, um
 * cliente contornado poderia gravar um texto de megabytes na trilha.
 */
const motivoSchema = z.string().trim().min(1).max(500);

/**
 * O que o operador acerta no ato do pagamento, além da conta e da data.
 *
 * Objeto, e não argumentos posicionais: são TRÊS valores em reais seguidos,
 * todos opcionais, e num `pagarParcela(id, conta, data, 0, 0, 250)` ninguém
 * enxerga em qual campo os R$ 250 caíram. Aqui o nome vai junto.
 *
 * Nenhum deles reescreve o valor devido da parcela: eles compõem o LÍQUIDO, que
 * é o que sai da conta bancária e bate com o extrato.
 */
export interface AjustesDoPagamento {
  /** Abatimento concedido pelo credor. Não pode passar do valor da parcela. */
  desconto?: number;
  /** Juros e multa do atraso. */
  juros?: number;
  /** Tarifa bancária, cartório, protesto: despesa que não é juros nem multa. */
  outrasDespesas?: number;
  /** Justificativa de pagar em data diferente da autorizada. */
  motivo?: string;
}

/**
 * Registra o pagamento de uma parcela via RPC. A_pagar exige parcela já
 * aprovada (a regra é validada no banco). Repassa a mensagem de erro do
 * banco direto para o toast. Sem anexo de comprovante nesta fase.
 *
 * `desconto`, `juros` e `outrasDespesas` são o acerto do ato do pagamento, em
 * reais: entram no que a conta bancária paga, sem mexer no valor devido da
 * parcela. Omitidos ou zero, o pagamento é exatamente o de antes.
 *
 * `motivo` é a justificativa de pagar em data diferente da autorizada. Pagar
 * fora da data deixou de ser recusa e passou a ser exceção auditada: com motivo
 * o banco paga e grava o evento `pagou_fora_da_janela` na trilha da parcela.
 * Obrigatório só nesse caso, e a exigência é conferida aqui também, não só na
 * tela: o cliente pode ser contornado, e pagamento fora da data sem
 * justificativa é exatamente o que a trilha existe para não deixar acontecer.
 */
export async function pagarParcela(
  id: string,
  contaBancariaId: string,
  dataPagamento: string,
  ajustes: AjustesDoPagamento = {},
): Promise<ResultadoAcao> {
  const { desconto = 0, juros = 0, outrasDespesas = 0, motivo } = ajustes;
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para registrar pagamentos" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Parcela inválida" };

  const contaValida = idSchema.safeParse(contaBancariaId);
  if (!contaValida.success) return { erro: "Selecione a conta bancária" };

  const dataValida = dataSchema.safeParse(dataPagamento);
  if (!dataValida.success) return { erro: "Informe a data do pagamento" };

  const descontoValido = dinheiroSchema.safeParse(desconto);
  if (!descontoValido.success) return { erro: "Desconto inválido" };

  const jurosValido = dinheiroSchema.safeParse(juros);
  if (!jurosValido.success) return { erro: "Juros e multa inválidos" };

  const outrasValido = dinheiroSchema.safeParse(outrasDespesas);
  if (!outrasValido.success) return { erro: "Outras despesas inválidas" };

  const motivoInformado = (motivo ?? "").trim();
  if (motivoInformado !== "" && !motivoSchema.safeParse(motivoInformado).success) {
    return { erro: "O motivo deve ter no máximo 500 caracteres" };
  }

  const supabase = await createClient();

  // Quem sabe a data autorizada é o banco, não o formulário: confiar na tela
  // deixaria passar pagamento fora da data sem justificativa nenhuma. Leitura
  // separada porque a parcela chega aqui só como id.
  //
  // Parcela que não veio (leitura barrada por RLS, id inexistente) não bloqueia
  // aqui: a `fn_pagar_parcela` faz a MESMA exigência e é a barreira real, então
  // recusar por falta de leitura só trocaria a mensagem certa do banco por uma
  // pior. Esta ação é a do drawer de contas a pagar; o recebimento tem ação
  // própria (`darComoRecebido`) e não tem data autorizada.
  const { data: parcela } = await supabase
    .from("lancamento_parcelas")
    .select("data_programada")
    .eq("id", idValido.data)
    .maybeSingle();

  const dataAutorizada = parcela?.data_programada ?? null;
  if (motivoInformado === "" && foraDaJanela(dataValida.data, dataAutorizada)) {
    return {
      erro: `Este pagamento está fora da data autorizada (${formatarData(dataAutorizada)}): informe o motivo`,
    };
  }

  const { error } = await supabase.rpc("fn_pagar_parcela", {
    p_parcela_id: idValido.data,
    p_conta_id: contaValida.data,
    p_data_pagamento: dataValida.data,
    p_desconto: descontoValido.data,
    p_juros: jurosValido.data,
    p_outras_despesas: outrasValido.data,
    // Chave ausente quando não há motivo, para o parâmetro cair no default do
    // banco: mandar string vazia daria no mesmo, mas ausente é o que o
    // pagamento na data exata sempre foi.
    ...(motivoInformado === "" ? {} : { p_motivo: motivoInformado }),
  });

  if (error) {
    return erroAcao(
      "financeiro.pagamentos.pagarParcela",
      error,
      error.message || "Não foi possível registrar o pagamento",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Estorna o pagamento de uma parcela via RPC. O banco exige a parcela estar
 * 'pago', barra quando conciliada e devolve a parcela ao estado anterior (o
 * saldo da conta, que é derivado, se restaura sozinho). Repassa a mensagem de
 * erro do banco direto para o toast.
 */
export async function estornarPagamento(
  parcelaId: string,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "excluir");
  } catch {
    return { erro: "Sem permissão para estornar pagamentos" };
  }

  const idValido = idSchema.safeParse(parcelaId);
  if (!idValido.success) return { erro: "Parcela inválida" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_estornar_pagamento", {
    p_parcela_id: idValido.data,
  });

  if (error) {
    return erroAcao(
      "financeiro.pagamentos.estornarPagamento",
      error,
      error.message || "Não foi possível estornar o pagamento. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Página do histórico de pagamentos, para a paginação server-side da tabela
 * "Pagas". Exige só a permissão de ver (a RLS no banco é a barreira final). Os
 * filtros vão para o banco: a aba é paginada no servidor, então filtrar em
 * memória mostraria "3 resultados" quando existem trezentos.
 */
export async function buscarParcelasPagas(
  pagina: number,
  tamanho: number,
  filtros: FiltrosParcelasPagas = {},
): Promise<ParcelasPagasPagina> {
  await exigirPermissao(RECURSO, "ver");

  // O schema mora em `filtros-pagas.ts` para poder ter teste: aqui dentro de um
  // `"use server"` ele era inalcançável, e ficou dez dias sem nove dos filtros
  // da aba -- que a action então descartava em silêncio, virando a página numa
  // lista SEM filtro apresentada como filtrada. Ver o bloco `filtrosPagasSchema`
  // em `filtros-pagas.test.ts`.
  const validados = filtrosPagasSchema.safeParse(filtros);
  if (!validados.success) {
    // Recusa em vez de ignorar: devolver a lista inteira com os filtros na tela
    // faria o operador ler o histórico todo como se fosse o filtrado.
    throw new Error("Filtro inválido no histórico de pagamentos");
  }

  return listarParcelasPagas({ pagina, tamanho, filtros: validados.data });
}

/**
 * Detalhe completo de uma parcela, para o painel que abre ao clicar na linha.
 *
 * Junta o que estava espalhado em três lugares: os dados da parcela e do
 * lançamento com o rateio por centro de custo (o mesmo carregador do espelho
 * impresso, para a tela e o papel nunca discordarem), os anexos do pagamento e
 * a trilha de eventos.
 *
 * Vale para parcela em qualquer situação, paga ou não: quem clica numa linha da
 * fila a pagar quer saber a mesma coisa de quem clica numa já paga.
 */
export async function detalheDaParcela(
  id: string,
): Promise<DetalheParcela | { erro: string }> {
  /**
   * A permissão depende do TIPO do lançamento, não da tela que chamou.
   *
   * O mesmo painel serve Pagamentos e Recebimentos desde 22/08/2026, e as duas
   * abas são recursos diferentes. Exigir `financeiro.pagamentos` fecharia o
   * detalhe do recebimento para quem cuida só de recebimento — que é justamente
   * quem mais precisa dele.
   *
   * A checagem final vem DEPOIS de carregar, porque quem sabe o tipo é o
   * documento. Antes de carregar, exige só ter uma das duas: sem nenhuma, não
   * há o que mostrar, e a RLS já não devolveria a parcela de qualquer forma.
   */
  const usuario = await getUsuarioLogado();
  const vePagamentos = temPermissao(usuario, "financeiro.pagamentos", "ver");
  const veRecebimentos = temPermissao(usuario, "financeiro.recebimentos", "ver");
  if (!vePagamentos && !veRecebimentos) {
    return { erro: "Sem permissão para ver este documento" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Parcela inválida" };

  const [espelho] = await buscarPagamentosParaEspelho([idValido.data]);
  if (!espelho) return { erro: "Parcela não encontrada" };

  const ehReceber = espelho.lancamentoTipo === "a_receber";
  if (ehReceber && !veRecebimentos) {
    return { erro: "Sem permissão para ver recebimentos" };
  }
  if (!ehReceber && !vePagamentos) {
    return { erro: "Sem permissão para ver pagamentos" };
  }

  // Anexos e trilha em paralelo: são leituras independentes. A trilha é do
  // LANÇAMENTO porque os eventos de uma parcela vivem junto com os das irmãs —
  // reparcelamento e alteração de valor só fazem sentido lidos em conjunto.
  const [anexos, trilha] = await Promise.all([
    anexosDoDocumento("pagamento", idValido.data),
    espelho.lancamentoId
      ? trilhaParcelasDoLancamento(espelho.lancamentoId)
      : Promise.resolve([]),
  ]);

  return { espelho, anexos, trilha };
}

/**
 * Teto de linhas por arquivo.
 *
 * A exportação leva TUDO que está no filtro, e sem filtro nenhum leva a fila
 * inteira (~900 parcelas) mais o histórico (dezenas de milhares). O número
 * existe só porque o arquivo é montado inteiro na memória do servidor e volta em
 * base64 pela resposta da Server Action: sem teto algum, um dia a exportação
 * viraria um erro genérico de memória em vez de um aviso com o que fazer.
 */
const LIMITE_PLANILHA_PAGAMENTOS = 25_000;

/**
 * Tamanho da página de leitura do histórico.
 *
 * Bem abaixo do teto de 1.000 do PostgREST: pedir tudo de uma vez faz a resposta
 * ser cortada num teto invisível, e a planilha sairia faltando pagamento sem
 * ninguém perceber.
 */
const PAGINA_LEITURA_PAGAS = 500;

/** Trava do laço de páginas: 25.000 linhas em páginas de 500 são 50 voltas. */
const TETO_DE_PAGINAS = 200;

/** O arquivo pronto, ou o motivo de não ter saído. */
export type ResultadoPlanilhaPagamentos =
  | { ok: true; base64: string; nomeArquivo: string }
  | { erro: string };

const FORMATOS_PLANILHA = new Set(["pagamento", "centro", "rateio"]);

/**
 * Gera a planilha (.xlsx) de Pagamentos, com as duas abas, e devolve em base64
 * para o navegador baixar.
 *
 * ## O recorte
 *
 * Recebe os filtros das DUAS abas, cada um do jeito que a tela já os tem: a fila
 * a pagar filtra em memória (ela vem inteira do servidor), o histórico filtra no
 * banco. A planilha usa as MESMAS funções que a tela — `filtrarFilaAPagar` e
 * `listarParcelasPagas` —, então o arquivo não pode discordar do que está na
 * tela. Uma segunda implementação do filtro divergiria na primeira correção
 * feita de um lado só, e o sintoma seriam dois totais diferentes para o mesmo
 * recorte, os dois abrindo sem erro.
 *
 * Os filtros são revalidados aqui mesmo já tendo sido validados na página: a
 * action é porta de entrada pública. Os dois schemas usam `strictObject`, que
 * RECUSA chave desconhecida em vez de descartá-la — é a trava contra o defeito
 * que deixou a aba "Pagas" dez dias sem nove dos seus filtros.
 *
 * Exporta o conjunto FILTRADO inteiro, e não a página aberta: quem exporta quer
 * fechar o mês, não as 25 linhas que couberam na tela.
 *
 * ## Os três formatos, uma leitura só
 *
 * `pagamento` é uma linha por parcela; `centro` abre cada parcela em uma linha
 * por centro de custo (juntando as etapas); `rateio` desce até o nível em que o
 * rateio foi gravado. A diferença mora inteira na montagem do arquivo, e por
 * isso ela é um parâmetro em vez de três actions: a leitura é a parte cara e a
 * parte perigosa (paginação, teto, conferência da contagem), e três cópias dela
 * divergiriam na primeira correção feita de um lado só.
 *
 * O módulo da planilha entra por `await import`: ele puxa o exceljs, que é
 * grande, e um import de topo o carregaria em toda chamada de toda action deste
 * arquivo — inclusive as de pagar parcela, que são as quentes.
 */
export async function gerarPlanilhaPagamentos(
  valoresAPagar: unknown,
  filtrosPagas: unknown,
  formato: FormatoPlanilhaPagamentos,
): Promise<ResultadoPlanilhaPagamentos> {
  // Exportar é ler: mesma permissão que abre a tela. Sem ela, nem a lista existe.
  try {
    await exigirPermissao(RECURSO, "ver");
  } catch {
    return { erro: "Sem permissão para exportar pagamentos" };
  }

  if (!FORMATOS_PLANILHA.has(formato)) {
    return { erro: "Formato inválido para exportar" };
  }

  const daFila = valoresFiltrosAPagarSchema.safeParse(valoresAPagar);
  if (!daFila.success) {
    // Recusa em vez de ignorar: exportar sem o filtro que está na tela
    // entregaria a base inteira com cara de recorte.
    return { erro: "Filtro inválido na fila a pagar. Recarregue a página" };
  }
  const doHistorico = filtrosPagasSchema.safeParse(filtrosPagas);
  if (!doHistorico.success) {
    return { erro: "Filtro inválido no histórico. Recarregue a página" };
  }

  let idsAPagar: string[];
  let idsPagas: string[];
  let totalPagas: number;
  try {
    const supabase = await createClient();

    // A fila vem inteira e é filtrada em memória, exatamente como na tela. A
    // subárvore do centro é resolvida UMA vez, e não uma por linha.
    const fila = await listarParcelasAPagar();
    const centroIds = daFila.data.centroIds;
    const subarvore =
      centroIds.length === 0
        ? null
        : new Set(await subarvoreDosCentros(supabase, centroIds));
    idsAPagar = filtrarFilaAPagar(fila, daFila.data, subarvore).map(
      (parcela) => parcela.id,
    );

    // O histórico vem página por página. Ler de uma vez só não é opção: o
    // PostgREST corta a resposta num teto invisível e a planilha sairia
    // faltando pagamento sem ninguém perceber.
    const vistos = new Set<string>();
    totalPagas = 0;
    for (let pagina = 0; pagina < TETO_DE_PAGINAS; pagina += 1) {
      const lote = await listarParcelasPagas({
        pagina,
        tamanho: PAGINA_LEITURA_PAGAS,
        filtros: doHistorico.data,
      });
      totalPagas = lote.total;
      // Acima do teto a leitura para na primeira página: não vale ler o resto
      // de um conjunto que vai ser recusado.
      if (totalPagas > LIMITE_PLANILHA_PAGAMENTOS) break;
      // `Set`, e não `push` direto: a ordenação tem desempate por id, mas se um
      // pagamento for registrado no meio da leitura uma linha pode aparecer em
      // duas páginas — e linha repetida numa planilha de dinheiro é dinheiro
      // contado duas vezes.
      for (const parcela of lote.itens) vistos.add(parcela.id);
      if (lote.itens.length < PAGINA_LEITURA_PAGAS) break;
      if (vistos.size >= totalPagas) break;
    }
    idsPagas = [...vistos];
  } catch (erro) {
    return erroAcao(
      "financeiro.pagamentos.gerarPlanilhaPagamentos",
      erro,
      "Não foi possível ler os pagamentos para exportar. Tente novamente",
    );
  }

  const total = idsAPagar.length + totalPagas;
  if (total === 0) {
    return { erro: "O filtro atual não tem nenhum pagamento para exportar" };
  }
  if (total > LIMITE_PLANILHA_PAGAMENTOS) {
    return {
      erro: `O filtro atual tem ${total.toLocaleString("pt-BR")} pagamentos, acima do limite de ${LIMITE_PLANILHA_PAGAMENTOS.toLocaleString("pt-BR")} por arquivo. Filtre por mês de referência e exporte em partes`,
    };
  }
  // Leu menos do que o banco disse que existe: alguém mexeu no histórico no
  // meio da leitura. Melhor recusar e pedir de novo do que entregar planilha
  // incompleta com cara de completa, que é o tipo de erro que ninguém confere.
  if (idsPagas.length < totalPagas) {
    return erroAcao(
      "financeiro.pagamentos.gerarPlanilhaPagamentos",
      new Error(`leitura incompleta: ${idsPagas.length} de ${totalPagas}`),
      `Li ${idsPagas.length.toLocaleString("pt-BR")} de ${totalPagas.toLocaleString("pt-BR")} pagamentos porque a lista mudou durante a exportação. Exporte de novo`,
    );
  }

  let aPagar: PagamentoPlanilha[];
  let pagas: PagamentoPlanilha[];
  try {
    const detalhes = await lerPagamentosParaPlanilha([
      ...idsAPagar,
      ...idsPagas,
    ]);
    // Parcela sem detalhe saiu da lista entre as duas consultas. Fica de fora em
    // vez de virar linha em branco, e a contagem acima é quem recusa leitura
    // parcial.
    const detalhar = (ids: string[]) =>
      ids
        .map((id) => detalhes.get(id))
        .filter((item): item is PagamentoPlanilha => item !== undefined);
    aPagar = detalhar(idsAPagar);
    pagas = detalhar(idsPagas);
  } catch (erro) {
    return erroAcao(
      "financeiro.pagamentos.gerarPlanilhaPagamentos",
      erro,
      "Não foi possível montar a planilha de pagamentos. Tente novamente",
    );
  }

  const { montarPlanilhaPagamentos, nomeArquivoPlanilhaPagamentos } =
    await import("@/modules/financeiro/pagamentos/planilha");

  const workbook = montarPlanilhaPagamentos({ aPagar, pagas, formato });
  workbook.created = new Date();
  const conteudo = await workbook.xlsx.writeBuffer();

  return {
    ok: true,
    base64: Buffer.from(conteudo).toString("base64"),
    nomeArquivo: nomeArquivoPlanilhaPagamentos(dataHojeISO(), formato),
  };
}
