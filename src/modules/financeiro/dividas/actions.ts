"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  contemplacaoSchema,
  contratoSchema,
  cotaSchema,
  eventoSchema,
  linhaConsorcioSchema,
  linhasCronogramaSchema,
  paraCentavo,
  type ContemplacaoInput,
  type ContratoInput,
  type CotaInput,
  type EventoInput,
  type LinhaConsorcioInput,
  type LinhaCronogramaInput,
} from "@/modules/financeiro/dividas/schemas";

const RECURSO = "financeiro.dividas" as const;

/**
 * Trocar o cronograma muda os juros que o DRE pega no mês do vencimento e o
 * saldo devedor da aba Créditos: as três telas revalidam juntas.
 */
const ROTAS = ["/financeiro/dividas", "/financeiro/relatorios"];

function revalidar(detalhe?: string) {
  for (const rota of ROTAS) revalidatePath(rota);
  if (detalhe) revalidatePath(detalhe);
}

export type ResultadoAcao = { ok: true; id?: string } | { erro: string };

async function pode(acao: "ver" | "editar"): Promise<boolean> {
  const usuario = await getUsuarioLogado();
  return temPermissao(usuario, RECURSO, acao);
}

function primeiroErro(erro: z.ZodError): string {
  return erro.issues[0]?.message ?? "Dados inválidos";
}

/** Linhas do cronograma ao centavo, nas chaves que as RPCs leem. */
function linhasContrato(linhas: LinhaCronogramaInput[]) {
  return linhas.map((l) => ({
    vencimento: l.vencimento,
    principal: paraCentavo(l.principal),
    juros: paraCentavo(l.juros),
    encargos: paraCentavo(l.encargos),
  }));
}

/**
 * Cria ou edita o contrato. Quem barra de verdade é `fn_salvar_contrato_divida`:
 * permissão, etapa ativa em Empréstimos ou imobilizado, lançamento das
 * prestações a pagar e o da liberação a receber.
 */
export async function salvarContrato(id: string | null, dados: ContratoInput): Promise<ResultadoAcao> {
  if (!(await pode("editar"))) return { erro: "Sem permissão para editar contratos de dívida" };
  if (id !== null && !idSchema.safeParse(id).success) return { erro: "Contrato inválido" };
  const validado = contratoSchema.safeParse(dados);
  if (!validado.success) return { erro: primeiroErro(validado.error) };
  const v = validado.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_salvar_contrato_divida", {
    p_id: id,
    p_dados: {
      credor: v.credor,
      numero: v.numero,
      tipo: v.tipo,
      centroCustoId: v.centroCustoId,
      lancamentoId: v.lancamentoId ?? "",
      lancamentoLiberacaoId: v.lancamentoLiberacaoId ?? "",
      valorContratado: paraCentavo(v.valorContratado),
      valorLiberado: paraCentavo(v.valorLiberado),
      dataLiberacao: v.dataLiberacao,
      taxaAm: v.taxaAm,
      indexador: v.indexador,
      sistema: v.sistema,
      carenciaMeses: v.carenciaMeses,
      parcelas: v.parcelas,
      primeiroVencimento: v.primeiroVencimento,
      garantia: v.garantia ?? "",
      ...(v.status ? { status: v.status } : {}),
      observacoes: v.observacoes ?? "",
    },
  });
  if (error) {
    return erroAcao("financeiro.dividas.salvarContrato", error, error.message || "Não foi possível salvar o contrato");
  }
  revalidar(`/financeiro/dividas/contratos/${data}`);
  return { ok: true, id: data };
}

/**
 * Gera o cronograma Price ou SAC pelos dados do contrato. Com cronograma já
 * gravado, o banco pede o motivo e recusa se houver parcela paga (aí a troca
 * é por evento).
 */
export async function gerarCronograma(contratoId: string, motivo?: string): Promise<ResultadoAcao> {
  if (!(await pode("editar"))) return { erro: "Sem permissão para editar contratos de dívida" };
  if (!idSchema.safeParse(contratoId).success) return { erro: "Contrato inválido" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_gerar_cronograma_contrato", {
    p_contrato: contratoId,
    p_motivo: motivo?.trim() || undefined,
  });
  if (error) {
    return erroAcao("financeiro.dividas.gerarCronograma", error, error.message || "Não foi possível gerar o cronograma");
  }
  revalidar(`/financeiro/dividas/contratos/${contratoId}`);
  return { ok: true };
}

/** O cronograma do banco, digitado ou colado do PDF. A soma do principal fecha o liberado (o banco confere). */
export async function salvarCronogramaDoBanco(
  contratoId: string,
  linhas: LinhaCronogramaInput[],
  motivo?: string,
): Promise<ResultadoAcao> {
  if (!(await pode("editar"))) return { erro: "Sem permissão para editar contratos de dívida" };
  if (!idSchema.safeParse(contratoId).success) return { erro: "Contrato inválido" };
  const validado = linhasCronogramaSchema.safeParse(linhas);
  if (!validado.success) return { erro: primeiroErro(validado.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_salvar_cronograma_contrato", {
    p_contrato: contratoId,
    p_linhas: linhasContrato(validado.data),
    p_motivo: motivo?.trim() || undefined,
  });
  if (error) {
    return erroAcao("financeiro.dividas.salvarCronogramaDoBanco", error, error.message || "Não foi possível salvar o cronograma");
  }
  revalidar(`/financeiro/dividas/contratos/${contratoId}`);
  return { ok: true };
}

/** Amortização, quitação ou renegociação: grava versão nova do cronograma, com o motivo. */
export async function registrarEvento(dados: EventoInput): Promise<ResultadoAcao> {
  if (!(await pode("editar"))) return { erro: "Sem permissão para editar contratos de dívida" };
  const validado = eventoSchema.safeParse(dados);
  if (!validado.success) return { erro: primeiroErro(validado.error) };
  const v = validado.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_registrar_evento_contrato", {
    p_contrato: v.contratoId,
    p_tipo: v.tipo,
    p_data: v.data,
    p_valor: v.valor === undefined ? null : paraCentavo(v.valor),
    p_motivo: v.motivo,
    p_linhas: v.linhas && v.linhas.length > 0 ? linhasContrato(v.linhas) : undefined,
  });
  if (error) {
    return erroAcao("financeiro.dividas.registrarEvento", error, error.message || "Não foi possível registrar o evento");
  }
  revalidar(`/financeiro/dividas/contratos/${v.contratoId}`);
  return { ok: true };
}

/** Cria ou edita a cota. O banco gera o cronograma ao criar e ao mudar a conta da parcela. */
export async function salvarCota(id: string | null, dados: CotaInput): Promise<ResultadoAcao> {
  if (!(await pode("editar"))) return { erro: "Sem permissão para editar consórcios" };
  if (id !== null && !idSchema.safeParse(id).success) return { erro: "Cota inválida" };
  const validado = cotaSchema.safeParse(dados);
  if (!validado.success) return { erro: primeiroErro(validado.error) };
  const v = validado.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_salvar_consorcio_cota", {
    p_id: id,
    p_dados: {
      administradora: v.administradora,
      grupo: v.grupo,
      cota: v.cota,
      bem: v.bem,
      centroCustoId: v.centroCustoId ?? "",
      lancamentoId: v.lancamentoId ?? "",
      valorCredito: paraCentavo(v.valorCredito),
      prazo: v.prazo,
      taxaAdmPct: v.taxaAdmPct,
      fundoReservaPct: v.fundoReservaPct,
      primeiroVencimento: v.primeiroVencimento,
      observacoes: v.observacoes ?? "",
    },
  });
  if (error) {
    return erroAcao("financeiro.dividas.salvarCota", error, error.message || "Não foi possível salvar a cota");
  }
  revalidar(`/financeiro/dividas/consorcios/${data}`);
  return { ok: true, id: data };
}

/** O cronograma da administradora (parcelas reajustadas). O fundo comum soma o crédito. */
export async function salvarCronogramaConsorcio(
  cotaId: string,
  linhas: LinhaConsorcioInput[],
): Promise<ResultadoAcao> {
  if (!(await pode("editar"))) return { erro: "Sem permissão para editar consórcios" };
  if (!idSchema.safeParse(cotaId).success) return { erro: "Cota inválida" };
  const validado = z.array(linhaConsorcioSchema).min(1, { error: "Informe as parcelas" }).safeParse(linhas);
  if (!validado.success) return { erro: primeiroErro(validado.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_salvar_cronograma_consorcio", {
    p_cota: cotaId,
    p_linhas: validado.data.map((l) => ({
      vencimento: l.vencimento,
      fundoComum: paraCentavo(l.fundoComum),
      taxaAdm: paraCentavo(l.taxaAdm),
      fundoReserva: paraCentavo(l.fundoReserva),
    })),
  });
  if (error) {
    return erroAcao("financeiro.dividas.salvarCronogramaConsorcio", error, error.message || "Não foi possível salvar o cronograma");
  }
  revalidar(`/financeiro/dividas/consorcios/${cotaId}`);
  return { ok: true };
}

/** Contemplação por sorteio ou lance. Depois dela, o que falta pagar é dívida. */
export async function contemplarCota(dados: ContemplacaoInput): Promise<ResultadoAcao> {
  if (!(await pode("editar"))) return { erro: "Sem permissão para editar consórcios" };
  const validado = contemplacaoSchema.safeParse(dados);
  if (!validado.success) return { erro: primeiroErro(validado.error) };
  const v = validado.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_contemplar_consorcio", {
    p_cota: v.cotaId,
    p_data: v.data,
    p_forma: v.forma,
    p_valor_carta: paraCentavo(v.valorCarta),
    p_valor_lance: v.forma === "lance" && v.valorLance !== undefined ? paraCentavo(v.valorLance) : undefined,
    p_bem_centro_id: v.bemCentroId || undefined,
    p_motivo: v.motivo?.trim() || undefined,
  });
  if (error) {
    return erroAcao("financeiro.dividas.contemplarCota", error, error.message || "Não foi possível contemplar a cota");
  }
  revalidar(`/financeiro/dividas/consorcios/${v.cotaId}`);
  return { ok: true };
}

export interface LancamentoOpcao {
  id: string;
  numero: string;
  descricao: string;
  valor: number;
}

/**
 * Busca do seletor de lançamento: as prestações são `a_pagar`, a liberação é
 * `a_receber`; cancelado não entra (o banco recusa). Pelo número
 * (LAN-2026-6722) ou por um pedaço da descrição; 20 resultados bastam para
 * escolher, e a busca sob demanda evita mandar milhares de lançamentos à tela.
 */
export async function buscarLancamentos(
  tipo: "a_pagar" | "a_receber",
  texto: string,
): Promise<LancamentoOpcao[] | { erro: string }> {
  if (!(await pode("editar"))) return { erro: "Sem permissão" };
  if (tipo !== "a_pagar" && tipo !== "a_receber") return { erro: "Tipo inválido" };
  // Vírgula e parênteses quebrariam o filtro `or` do PostgREST.
  const termo = texto.trim().slice(0, 80).replace(/[,()%*\\]/g, " ").trim();
  if (termo.length < 2) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lancamentos")
    .select("id, numero, descricao, valor")
    .eq("tipo", tipo)
    .neq("status", "cancelado")
    .or(`numero.ilike.%${termo}%,descricao.ilike.%${termo}%`)
    .order("data_compra", { ascending: false })
    .limit(20);
  if (error) return erroAcao("financeiro.dividas.buscarLancamentos", error, "Não foi possível buscar os lançamentos");
  return (data ?? []).map((l) => ({ id: l.id, numero: l.numero, descricao: l.descricao, valor: Number(l.valor) }));
}
