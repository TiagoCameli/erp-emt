"use server";

import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";

import { EMPRESA } from "@/config/marca";
import type { Acao } from "@/config/recursos";
import { erroAcao } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import {
  escreverCabecalhoMarca,
  estilizarCabecalhoColunas,
} from "@/lib/planilha-marca";
import { createClient } from "@/lib/supabase/server";
import {
  formatarBRL,
  formatarDataHora,
  formatarQuantidade,
} from "@/lib/formatadores";
import {
  ROTULO_VINCULO,
  type Vinculo,
} from "@/modules/cadastros/colaboradores/schemas";
import { STATUS_FOLHA, type StatusFolha } from "@/modules/rh/_shared/formato";
import { buscarFolha } from "@/modules/rh/folha/queries";
import {
  editarItemFolhaSchema,
  gerarFolhaSchema,
  type EditarItemFolhaInput,
  type GerarFolhaInput,
} from "@/modules/rh/folha/schemas";

const RECURSO = "rh.folha" as const;
const ROTA = "/rh/folha";

/** Caminho do detalhe de uma folha, para revalidar junto com a lista. */
function rotaDetalhe(id: string): string {
  return `${ROTA}/${id}`;
}

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoGeracao = { ok: true; id: string } | { erro: string };
export type ResultadoPlanilha =
  | { ok: true; base64: string; nomeArquivo: string }
  | { erro: string };

/**
 * Erro de banco: só devolve `error.message` ao usuário quando é um
 * `raise exception` nosso (SQLSTATE `P0001`, o default do plpgsql sem
 * `USING ERRCODE`). Qualquer outro código (permission denied, violação de RLS,
 * erro de conexão) é infraestrutura e vai só pro log. Mesma função de
 * `rh/adiantamentos/actions.ts`.
 *
 * Vale para o UPDATE de status porque as travas dele vivem no trigger
 * `fn_guarda_status_folha`, e a mensagem dele é a única coisa que diz ao
 * operador o que fazer: "a folha está vazia, gere antes" e "a folha ficou
 * desatualizada, regere antes". Sem isto o toast dizia só "Não foi possível
 * atualizar a folha", e a saída ficava invisível.
 */
function mensagemDeNegocio(
  error: { code?: string; message?: string } | null | undefined,
  fallback: string,
): string {
  if (error?.code === "P0001" && error.message) return error.message;
  return fallback;
}

/** Converte o throw de exigirPermissao no contrato { erro } das actions. */
async function checarPermissao(acao: Acao): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Gerar folha (criar/regenerar o rascunho da competência)            */
/* ------------------------------------------------------------------ */

/**
 * Gera a folha gerencial da competência via fn_gerar_folha: cria (ou regenera)
 * o rascunho consolidando os colaboradores ativos de vínculo CLT, terceiro e
 * diarista. CLT e terceiro entram pelo salário do cadastro; diarista entra pela
 * soma das diárias em aberto da competência. Os encargos são discriminados pela
 * config (folha_encargos ativos) ou pelo percentual individual do colaborador,
 * dentro da fn. Reaplicar regenera a folha em rascunho, PRESERVANDO as linhas
 * que foram editadas à mão. Retorna o id.
 */
export async function gerarFolha(
  dados: GerarFolhaInput,
): Promise<ResultadoGeracao> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Sem permissão para gerar folhas" };
  }

  const validado = gerarFolhaSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_gerar_folha", {
    p_competencia: validado.data.competencia,
    // Legado: a fn ignora este arg (encargos vêm de folha_encargos). Mantido só
    // para não quebrar a assinatura do RPC.
    p_encargos_pct: 0,
  });

  if (error || !data) {
    return erroAcao(
      "rh.folha.gerar",
      error,
      error?.message || "Não foi possível gerar a folha",
    );
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(data));
  return { ok: true, id: data };
}

/* ------------------------------------------------------------------ */
/* Editar a linha de um colaborador na folha em rascunho              */
/* ------------------------------------------------------------------ */

/**
 * Altera salário base, gratificação e valor descontado do salário de UM item da
 * folha, via fn_editar_item_folha.
 *
 * A conta inteira acontece no banco de propósito: mexer nesses três campos
 * refaz INSS, IRRF, as linhas de encargo, as de provisão, o custo total, o
 * líquido e os sete totais do cabeçalho. Calcular aqui e mandar um UPDATE
 * seria uma segunda cópia das fórmulas da geração, e duas cópias de uma conta
 * de dinheiro divergem na primeira vez que uma das duas for corrigida.
 *
 * O desconto é um VALOR em reais desde 26/08/2026, não mais um percentual: 7,5%
 * sobre o salário mínimo dá 121,575, a metade exata do centavo, e o banco subia
 * (121,58) enquanto o contracheque descia (121,57). Não existe arredondamento
 * "certo" nesse ponto, então o número passou a ser digitado. Vazio vale R$ 0,00
 * — não há mais a distinção entre "sem desconto" e "desconto de zero".
 *
 * O desconto sai do LÍQUIDO e não do custo da empresa (25/08/2026): o dinheiro
 * sai da conta igual, o desconto só muda quem fica com ele. Antes desta data o
 * mesmo campo era encargo patronal e SOMAVA no custo — foi o que fez uma folha
 * mostrar custo R$ 2.028,58 para um bruto de R$ 1.907,00.
 *
 * `folhaId` serve SÓ para revalidar a rota do detalhe. Quem autoriza e quem
 * localiza o item é o `itemId` dentro da fn (que confere permissão, status de
 * rascunho e trava a folha); um folhaId errado aqui no máximo revalida a página
 * errada, não move dinheiro nenhum.
 */
export async function editarItemFolha(
  folhaId: string,
  dados: EditarItemFolhaInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para alterar valores da folha" };
  }

  const validado = editarItemFolhaSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_editar_item_folha", {
    p_item: validado.data.itemId,
    p_salario_base: validado.data.salarioBase,
    p_gratificacao: validado.data.gratificacao,
    // O schema já resolveu vazio e null para 0, então aqui sempre chega um
    // número. Nada de `?? undefined`: aquilo existia para omitir o parâmetro e
    // deixar o DEFAULT null do banco significar "sem desconto", distinção que o
    // modelo em valor não tem mais.
    p_desconto: validado.data.desconto,
    // `?? undefined` OMITE o parâmetro, e o DEFAULT dele no banco é null — que é
    // exatamente "não foi informado por horas". O tipo gerado marca o parâmetro
    // como opcional (tem DEFAULT) e recusa null; editar o database.types.ts à
    // mão para aceitar seria apagado na próxima regeneração. Zero sobrevive:
    // `??` só troca null e undefined.
    p_desconto_horas: validado.data.descontoHoras ?? undefined,
  });

  if (error) {
    return erroAcao(
      "rh.folha.editarItem",
      error,
      // As travas desta fn (rascunho, adiantamento maior que o disponível,
      // linha zerada) só são úteis se o texto delas chegar na tela: cada uma
      // diz o que fazer em seguida.
      mensagemDeNegocio(error, "Não foi possível alterar os valores da linha"),
    );
  }

  const idFolha = idSchema.safeParse(folhaId);
  revalidatePath(ROTA);
  if (idFolha.success) revalidatePath(rotaDetalhe(idFolha.data));
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Fluxo: enviar, aprovar, mandar para revisão, retomar, desaprovar   */
/* ------------------------------------------------------------------ */

/**
 * Atualiza status (e motivo_rejeicao opcional) da folha via UPDATE direto,
 * lendo o status atual antes de escrever. Sem essa leitura, um UPDATE com
 * `.eq("status", statusEsperado)` que não bate nenhuma linha (a folha já
 * mudou de status por outra aba/usuário) não é erro no PostgREST: a action
 * devolveria sucesso falso, e a tela daria o toast de sucesso sobre uma
 * transição que não aconteceu. Espelha transicionarStatus da OC
 * (src/modules/compras/ordens/actions.ts).
 */
async function transicionarStatusFolha(
  id: string,
  acao: Acao,
  statusEsperado: StatusFolha,
  novoStatus: StatusFolha,
  extra: { motivo_rejeicao?: string | null } = {},
): Promise<ResultadoAcao> {
  if (!(await checarPermissao(acao))) {
    return { erro: "Sem permissão para esta ação na folha" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Folha inválida" };

  const supabase = await createClient();
  const { data: atual, error: erroBusca } = await supabase
    .from("folhas")
    .select("status")
    .eq("id", idValido.data)
    .single();

  if (erroBusca || !atual) {
    return erroAcao(
      "rh.folha.transicionarStatus",
      erroBusca,
      "Folha não encontrada",
    );
  }
  if (atual.status !== statusEsperado) {
    return { erro: "A folha não está no status esperado para esta ação" };
  }

  const { error } = await supabase
    .from("folhas")
    .update({ status: novoStatus, ...extra })
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "rh.folha.transicionarStatus",
      error,
      mensagemDeNegocio(
        error,
        "Não foi possível atualizar a folha. Tente novamente",
      ),
    );
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(idValido.data));
  return { ok: true };
}

/**
 * Envia a folha de rascunho para aprovação. UPDATE direto pela RLS, guardado
 * pelo trigger fn_guarda_status_folha (que também recusa folha vazia). Limpa o
 * motivo da rejeição anterior, igual a OC faz.
 */
export async function enviarFolhaParaAprovacao(
  id: string,
): Promise<ResultadoAcao> {
  return transicionarStatusFolha(
    id,
    "editar",
    "rascunho",
    "pendente_aprovacao",
    {
      motivo_rejeicao: null,
    },
  );
}

/**
 * Aprova a folha via fn_aprovar_folha. É a aprovação que gera os lançamentos no
 * Financeiro (salário por colaborador e as guias por grupo de recolhimento), e
 * a mensagem de erro do banco vai direto pro toast.
 */
export async function aprovarFolha(id: string): Promise<ResultadoAcao> {
  if (!(await checarPermissao("aprovar"))) {
    return { erro: "Sem permissão para aprovar a folha" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Folha inválida" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_aprovar_folha", {
    p_folha: idValido.data,
  });

  if (error) {
    return erroAcao(
      "rh.folha.aprovar",
      error,
      error.message || "Não foi possível aprovar a folha",
    );
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(idValido.data));
  return { ok: true };
}

/**
 * Devolve a folha pendente para quem a montou, com motivo.
 *
 * É o antigo "rejeitar", com o nome que descreve o que acontece: a folha volta
 * para rascunho e o autor corrige. "Rejeitar" fazia parecer que o trabalho foi
 * recusado — e não existe status `rejeitado` na folha justamente porque ela é
 * recalculável, então o beco sem saída nunca existiu.
 */
export async function mandarFolhaParaRevisao(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  const motivoLimpo = motivo.trim();
  if (motivoLimpo === "") {
    return { erro: "Informe o motivo da revisão" };
  }

  return transicionarStatusFolha(
    id,
    "aprovar",
    "pendente_aprovacao",
    "rascunho",
    {
      motivo_rejeicao: motivoLimpo,
    },
  );
}

/**
 * Quem MONTA a folha puxa de volta o que ela mesma enviou para aprovação.
 *
 * Permissão `editar`, e sem motivo: não é devolução a ninguém, é a própria
 * pessoa retomando — pedir motivo seria pedir um bilhete para si mesma. O
 * motivo da revisão anterior é apagado no mesmo UPDATE, porque a folha volta
 * para a mesa limpa e um motivo velho pendurado faria a tela mostrar uma
 * cobrança que já foi atendida.
 *
 * Folha aprovada não entra aqui: `statusEsperado` é `pendente_aprovacao`, e o
 * trigger do banco recusa qualquer saída de `aprovado` que não seja Desaprovar.
 */
export async function voltarFolhaParaRascunho(
  id: string,
): Promise<ResultadoAcao> {
  return transicionarStatusFolha(
    id,
    "editar",
    "pendente_aprovacao",
    "rascunho",
    {
      motivo_rejeicao: null,
    },
  );
}

/**
 * Desaprova a folha via fn_desaprovar_folha: volta para rascunho e apaga os
 * lançamentos gerados. A RPC recusa se algum pagamento já estiver aprovado,
 * pago ou conciliado, e a mensagem dela vai direto pro toast.
 */
export async function desaprovarFolha(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("desaprovar"))) {
    return { erro: "Sem permissão para desaprovar a folha" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Folha inválida" };

  const motivoLimpo = motivo.trim();
  if (motivoLimpo === "") return { erro: "Informe o motivo da desaprovação" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_desaprovar_folha", {
    p_folha: idValido.data,
    p_motivo: motivoLimpo,
  });

  if (error) {
    return erroAcao(
      "rh.folha.desaprovar",
      error,
      error.message || "Não foi possível desaprovar a folha",
    );
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(idValido.data));
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Planilha da folha (Excel)                                          */
/* ------------------------------------------------------------------ */

/* A marca no topo e a cor do cabeçalho de colunas vivem em
   src/lib/planilha-marca.ts, para toda planilha exportada sair igual. */

/** Competência (yyyy-MM-01) como MM/AAAA. */
function competenciaMesAno(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}

/** Nome de arquivo seguro a partir da competência. */
function nomeArquivoFolha(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  return `folha-${ano}-${mes}.xlsx`;
}

/**
 * Gera a planilha gerencial da folha em .xlsx para o contador: cabeçalho com a
 * competência, o status e o total descontado dos salários; uma tabela por
 * colaborador com vínculo, salário base, gratificação, horas, desconto, adiantamentos,
 * custo total (custo da empresa) e líquido (o que o colaborador recebe); e a
 * linha de totais. Devolve o arquivo em base64 para o client baixar via Blob.
 * Disponível em qualquer status.
 */
export async function gerarPlanilhaFolha(
  id: string,
): Promise<ResultadoPlanilha> {
  if (!(await checarPermissao("ver"))) {
    return { erro: "Sem permissão para exportar a folha" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Folha inválida" };

  const folha = await buscarFolha(idValido.data);
  if (!folha) return { erro: "Folha não encontrada" };

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ERP EMT";
  workbook.company = EMPRESA.razaoSocial;
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Folha gerencial");

  // A mesma marca da planilha de lançamentos, pelo mesmo motivo: é relatório que
  // sai do sistema e vai anexado em email. O nome do relatório já vem na linha
  // de contexto do cabeçalho de marca, então não há uma linha "Folha gerencial"
  // solta aqui — ela repetiria o título logo abaixo dele.
  escreverCabecalhoMarca(workbook, worksheet, {
    titulo: "Folha gerencial",
    // O número REAL de colunas da tabela abaixo (a faixa da marca é mesclada
    // nessa largura). Estava 12 com 13 colunas, e a coluna de horas fez 14.
    colunas: 14,
  });

  worksheet.addRow(["Competência", competenciaMesAno(folha.competencia)]);
  worksheet.addRow(["Status", STATUS_FOLHA[folha.status].rotulo]);
  // Desconto de salário é por PESSOA: não há um percentual único da folha para
  // pôr aqui, então o cabeçalho diz o total em dinheiro e a coluna por linha
  // mostra de quem saiu.
  worksheet.addRow(["Descontos de salário", formatarBRL(folha.valorDescontos)]);
  if (folha.aprovadoEm) {
    worksheet.addRow(["Aprovada em", formatarDataHora(folha.aprovadoEm)]);
  }
  worksheet.addRow([]);

  const cabecalhos = [
    "Colaborador",
    // Vínculo é a primeira coluna nova porque sem ela a planilha fica
    // ilegível: com CLT, terceiro e diarista na mesma lista, um desconto de
    // R$ 0,00 ou um salário base de R$ 550,00 não têm explicação.
    "Vínculo",
    "Função",
    "Centro de custo",
    "Salário base",
    "Gratificação",
    "Horas normais",
    "Horas extras",
    "Valor extras",
    "Horas não trabalhadas",
    "Desconto do salário",
    "Provisão (13º/férias)",
    "Adiantamentos",
    "Custo total",
    "Líquido",
  ];
  const linhaHeader = worksheet.addRow(cabecalhos);
  estilizarCabecalhoColunas(linhaHeader);

  for (const item of folha.itens) {
    const centro = item.centroCustoNome
      ? item.centroCustoCodigo
        ? `${item.centroCustoCodigo} - ${item.centroCustoNome}`
        : item.centroCustoNome
      : "Sem centro de custo";

    worksheet.addRow([
      item.colaboradorNome,
      ROTULO_VINCULO[item.colaboradorVinculo as Vinculo] ??
        item.colaboradorVinculo,
      item.colaboradorFuncao ?? "",
      centro,
      formatarBRL(item.salarioBase),
      formatarBRL(item.gratificacao),
      formatarQuantidade(item.horasNormais),
      formatarQuantidade(item.horasExtras),
      formatarBRL(item.valorExtras),
      // Vazio quando o desconto não foi informado por horas: um "0" aqui
      // afirmaria que a pessoa não faltou, e o que se sabe é que ninguém
      // declarou o motivo.
      item.descontoHoras === null ? "" : formatarQuantidade(item.descontoHoras),
      formatarBRL(item.descontos),
      formatarBRL(item.provisoes),
      formatarBRL(item.adiantamentos),
      formatarBRL(item.custoTotal),
      formatarBRL(item.valorLiquido),
    ]);
  }

  worksheet.addRow([]);
  // O total da coluna "Salário base" é o bruto MENOS as gratificações: bruto
  // já embute gratificação (é salário base + extras + gratificação), e repetir
  // o bruto na coluna de salário base faria a linha de totais somar a
  // gratificação duas vezes na horizontal.
  const linhaTotais = worksheet.addRow([
    "Totais",
    "",
    "",
    "",
    formatarBRL(folha.valorBruto - folha.valorGratificacoes),
    formatarBRL(folha.valorGratificacoes),
    "",
    "",
    "",
    "",
    formatarBRL(folha.valorDescontos),
    formatarBRL(folha.valorProvisoes),
    formatarBRL(folha.valorAdiantamentos),
    formatarBRL(folha.custoTotal),
    formatarBRL(folha.valorLiquido),
  ]);
  linhaTotais.eachCell((cell) => {
    cell.font = { bold: true };
  });

  worksheet.getColumn(1).width = 28;
  worksheet.getColumn(2).width = 12;
  worksheet.getColumn(3).width = 22;
  worksheet.getColumn(4).width = 26;
  for (const indice of [5, 6, 7, 8, 9, 10, 11, 12, 13, 14]) {
    const coluna = worksheet.getColumn(indice);
    coluna.width = Math.max(coluna.width ?? 0, 16);
  }

  const conteudo = await workbook.xlsx.writeBuffer();
  const base64 = Buffer.from(conteudo).toString("base64");

  return {
    ok: true,
    base64,
    nomeArquivo: nomeArquivoFolha(folha.competencia),
  };
}

/* ------------------------------------------------------------------ */
/* Tirar da folha / trazer de volta                                    */
/* ------------------------------------------------------------------ */

/**
 * Tira um colaborador DESTA folha, sem desligá-lo da empresa.
 *
 * A permissão é `editar`, mas a RPC também exige `criar`: a operação REGENERA a
 * folha, porque montar (e desmontar) item é responsabilidade de
 * `fn_gerar_folha` — a única função que sabe a regra de dinheiro do item. Ver o
 * cabeçalho da migration 20260828140000.
 *
 * O motivo é opcional e curto. Obrigar motivo transformaria o caminho rápido
 * ("entrou de licença, tiro deste mês") num formulário, e o histórico já grava
 * quem tirou e quando.
 */
export async function tirarDaFolha(
  folhaId: string,
  colaboradorId: string,
  motivo?: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar a folha" };
  }

  const idFolha = idSchema.safeParse(folhaId);
  if (!idFolha.success) return { erro: "Folha inválida" };
  const idColab = idSchema.safeParse(colaboradorId);
  if (!idColab.success) return { erro: "Colaborador inválido" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_tirar_da_folha", {
    p_folha_id: idFolha.data,
    p_colaborador_id: idColab.data,
    p_motivo: motivo?.trim() ? motivo.trim() : null,
  });

  if (error) {
    // `mensagemDeNegocio` deixa passar o texto dos `raise` da RPC (P0001), que
    // aqui são todos em pt-BR e dizem o que fazer: folha fora de rascunho,
    // sobra de adiantamento já descontada numa folha posterior, falta de
    // permissão de criar. Erro de infraestrutura cai no fallback.
    return erroAcao(
      "rh.folha.tirarDaFolha",
      error,
      mensagemDeNegocio(
        error,
        "Não foi possível tirar o colaborador da folha. Tente novamente",
      ),
    );
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(idFolha.data));
  return { ok: true };
}

/**
 * Traz de volta para a folha um colaborador que tinha sido tirado dela.
 *
 * Também regenera, e pelo mesmo motivo: é `fn_gerar_folha` que sabe montar o
 * item (base por vínculo, INSS, IRRF, adiantamento em cascata, centro de custo,
 * encargos e provisões). Uma segunda função que soubesse montar item seria uma
 * segunda cópia da regra de dinheiro.
 */
export async function voltarParaFolha(
  folhaId: string,
  colaboradorId: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar a folha" };
  }

  const idFolha = idSchema.safeParse(folhaId);
  if (!idFolha.success) return { erro: "Folha inválida" };
  const idColab = idSchema.safeParse(colaboradorId);
  if (!idColab.success) return { erro: "Colaborador inválido" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_voltar_para_folha", {
    p_folha_id: idFolha.data,
    p_colaborador_id: idColab.data,
  });

  if (error) {
    return erroAcao(
      "rh.folha.voltarParaFolha",
      error,
      mensagemDeNegocio(
        error,
        "Não foi possível colocar o colaborador de volta. Tente novamente",
      ),
    );
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(idFolha.data));
  return { ok: true };
}
