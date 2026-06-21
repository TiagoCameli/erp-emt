import "server-only";

import { dataHojeISO } from "@/lib/formatadores";
import { createClient } from "@/lib/supabase/server";

/**
 * Painel de Alertas da Gestão (somente leitura). Junta os alertas acionáveis
 * da empresa de cinco fontes (estoque, documentos, férias, faturas a receber e
 * ordens de serviço), cada uma calculando a sua situação na leitura com base na
 * data de hoje no fuso do sistema (dataHojeISO). As agregações cruzam dados em
 * JS com Maps para evitar N+1: nunca uma query por linha.
 */

/** Situação de vencimento: vencido (já passou) ou a vencer (dentro da janela). */
export type SituacaoVencimento = "vencido" | "a_vencer";

/** Janela, em dias, para documentos "a vencer". */
const DIAS_DOCUMENTO_A_VENCER = 30;

/** Janela, em dias, para férias "a vencer". */
const DIAS_FERIAS_A_VENCER = 60;

/** Soma N dias a uma data yyyy-MM-dd, devolvendo yyyy-MM-dd. */
function somarDias(data: string, dias: number): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  const base = new Date(Date.UTC(ano, mes - 1, dia));
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

/** Soma 12 meses a uma data yyyy-MM-dd, devolvendo yyyy-MM-dd. */
function somarDozeMeses(data: string): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  const base = new Date(Date.UTC(ano, mes - 1, dia));
  base.setUTCFullYear(base.getUTCFullYear() + 1);
  return base.toISOString().slice(0, 10);
}

/** Chave de cruzamento insumo + depósito. */
function chaveSaldo(insumoId: string, depositoId: string): string {
  return `${insumoId}|${depositoId}`;
}

/** Resultado padrão de cada fonte: lista de ocorrências + contagem total. */
export interface BlocoAlerta<T> {
  itens: T[];
  total: number;
}

/** Item de estoque crítico: saldo abaixo do mínimo definido. */
export interface EstoqueCriticoItem {
  insumoNome: string;
  insumoCodigo: string | null;
  depositoNome: string;
  quantidade: number;
  minimo: number;
  unidadeSigla: string;
}

/** Documento (ASO, CNH, etc.) vencido ou a vencer. */
export interface DocumentoAlertaItem {
  colaboradorNome: string;
  tipo: string;
  descricao: string;
  dataVencimento: string;
  situacao: SituacaoVencimento;
}

/** Férias vencidas ou a vencer (limite de gozo). */
export interface FeriasAlertaItem {
  colaboradorNome: string;
  limiteGozo: string;
  dias: number;
  situacao: SituacaoVencimento;
}

/** Fatura (parcela a receber) vencida. */
export interface FaturaAlertaItem {
  descricao: string;
  numero: string | null;
  dataVencimento: string;
  valor: number;
}

/** Ordem de serviço aberta ou em execução. */
export interface OrdemAlertaItem {
  numero: string | null;
  equipamentoDescricao: string;
  status: string;
  dataAbertura: string;
}

/**
 * Estoque crítico: mínimos definidos cruzados com o saldo atual. Item crítico =
 * saldo (0 quando não há linha de saldo) menor que o mínimo. Duas queries
 * (mínimos com embeds + saldos), cruzadas por Map. Ordenado pela maior falta.
 */
export async function estoqueCritico(): Promise<BlocoAlerta<EstoqueCriticoItem>> {
  const supabase = await createClient();

  const [minimosResp, saldosResp] = await Promise.all([
    supabase
      .from("estoque_minimos")
      .select(
        `insumo_id, deposito_id, minimo,
         insumos(nome, codigo, unidades_medida(sigla)),
         depositos(nome)`,
      ),
    supabase.from("estoque_saldos").select("insumo_id, deposito_id, quantidade"),
  ]);

  if (minimosResp.error) {
    throw new Error("Não foi possível carregar o estoque crítico");
  }

  const saldoPorChave = new Map<string, number>();
  for (const saldo of saldosResp.data ?? []) {
    saldoPorChave.set(
      chaveSaldo(saldo.insumo_id, saldo.deposito_id),
      saldo.quantidade,
    );
  }

  const itens = (minimosResp.data ?? [])
    .map((minimo) => {
      const quantidade =
        saldoPorChave.get(chaveSaldo(minimo.insumo_id, minimo.deposito_id)) ?? 0;
      return {
        insumoNome: minimo.insumos?.nome ?? "-",
        insumoCodigo: minimo.insumos?.codigo ?? null,
        depositoNome: minimo.depositos?.nome ?? "-",
        quantidade,
        minimo: minimo.minimo,
        unidadeSigla: minimo.insumos?.unidades_medida?.sigla ?? "",
      };
    })
    .filter((item) => item.quantidade < item.minimo)
    .sort(
      (a, b) =>
        a.minimo - a.quantidade - (b.minimo - b.quantidade) ||
        a.insumoNome.localeCompare(b.insumoNome),
    )
    .reverse();

  return { itens, total: itens.length };
}

/**
 * Documentos vencendo: rh_documentos com data_vencimento definida, vencidos ou
 * a vencer em até 30 dias. Calcula a situação na leitura e ordena pelo
 * vencimento mais próximo. Uma query com embed do colaborador.
 */
export async function documentosVencendo(): Promise<
  BlocoAlerta<DocumentoAlertaItem>
> {
  const supabase = await createClient();
  const hoje = dataHojeISO();
  const limite = somarDias(hoje, DIAS_DOCUMENTO_A_VENCER);

  const { data, error } = await supabase
    .from("rh_documentos")
    .select(
      "tipo, descricao, data_vencimento, colaboradores(nome)",
    )
    .not("data_vencimento", "is", null)
    .lte("data_vencimento", limite)
    .order("data_vencimento", { ascending: true });

  if (error) {
    throw new Error("Não foi possível carregar os documentos vencendo");
  }

  const itens: DocumentoAlertaItem[] = (data ?? [])
    .filter((linha): linha is typeof linha & { data_vencimento: string } =>
      linha.data_vencimento !== null,
    )
    .map((linha) => ({
      colaboradorNome: linha.colaboradores?.nome ?? "-",
      tipo: linha.tipo,
      descricao: linha.descricao,
      dataVencimento: linha.data_vencimento,
      situacao: linha.data_vencimento < hoje ? "vencido" : "a_vencer",
    }));

  return { itens, total: itens.length };
}

/**
 * Férias vencendo: rh_ferias ainda programadas, com limite de gozo (fim do
 * período aquisitivo + 12 meses) já vencido ou a vencer em até 60 dias.
 * Filtra e ordena na leitura. Uma query com embed do colaborador.
 */
export async function feriasVencendo(): Promise<BlocoAlerta<FeriasAlertaItem>> {
  const supabase = await createClient();
  const hoje = dataHojeISO();
  const limiteJanela = somarDias(hoje, DIAS_FERIAS_A_VENCER);

  const { data, error } = await supabase
    .from("rh_ferias")
    .select(
      "periodo_aquisitivo_fim, dias, status, colaboradores(nome)",
    )
    .eq("status", "programada");

  if (error) {
    throw new Error("Não foi possível carregar as férias vencendo");
  }

  const itens: FeriasAlertaItem[] = (data ?? [])
    .map((linha) => {
      const limiteGozo = somarDozeMeses(linha.periodo_aquisitivo_fim);
      return {
        colaboradorNome: linha.colaboradores?.nome ?? "-",
        limiteGozo,
        dias: linha.dias,
        situacao: (hoje > limiteGozo ? "vencido" : "a_vencer") as SituacaoVencimento,
      };
    })
    .filter((item) => item.limiteGozo <= limiteJanela)
    .sort((a, b) => a.limiteGozo.localeCompare(b.limiteGozo));

  return { itens, total: itens.length };
}

/**
 * Faturas vencidas: parcelas a receber pendentes com vencimento anterior a
 * hoje, do lançamento tipo 'a_receber'. Uma query com inner join no lançamento
 * para resolver número e descrição. Ordena pelo vencimento mais antigo.
 */
export async function faturasVencidas(): Promise<BlocoAlerta<FaturaAlertaItem>> {
  const supabase = await createClient();
  const hoje = dataHojeISO();

  const { data, error } = await supabase
    .from("lancamento_parcelas")
    .select(
      "data_vencimento, valor, status, lancamentos!inner(numero, descricao, tipo)",
    )
    .eq("status", "pendente")
    .eq("lancamentos.tipo", "a_receber")
    .not("data_vencimento", "is", null)
    .lt("data_vencimento", hoje)
    .order("data_vencimento", { ascending: true });

  if (error) {
    throw new Error("Não foi possível carregar as faturas vencidas");
  }

  const itens: FaturaAlertaItem[] = (data ?? [])
    .filter((linha): linha is typeof linha & { data_vencimento: string } =>
      linha.data_vencimento !== null,
    )
    .map((linha) => ({
      descricao: linha.lancamentos?.descricao ?? "-",
      numero: linha.lancamentos?.numero ?? null,
      dataVencimento: linha.data_vencimento,
      valor: linha.valor,
    }));

  return { itens, total: itens.length };
}

/**
 * Ordens de serviço abertas: status aberta ou em execução, com o equipamento
 * resolvido. Uma query com embed do equipamento. Ordena pela abertura mais
 * antiga (as que mais demoram primeiro).
 */
export async function ordensAbertas(): Promise<BlocoAlerta<OrdemAlertaItem>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ordens_servico")
    .select(
      "numero, status, data_abertura, equipamentos(descricao)",
    )
    .in("status", ["aberta", "em_execucao"])
    .order("data_abertura", { ascending: true });

  if (error) {
    throw new Error("Não foi possível carregar as ordens de serviço abertas");
  }

  const itens: OrdemAlertaItem[] = (data ?? []).map((linha) => ({
    numero: linha.numero,
    equipamentoDescricao: linha.equipamentos?.descricao ?? "-",
    status: linha.status,
    dataAbertura: linha.data_abertura,
  }));

  return { itens, total: itens.length };
}
