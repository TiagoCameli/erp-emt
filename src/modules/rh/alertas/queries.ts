import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  cadastroFaltando,
  urgenciaDocumento,
  urgenciaFerias,
  type Urgencia,
} from "@/modules/rh/alertas/calculo";
import { listarDocumentos, type SituacaoDocumento } from "@/modules/rh/documentos/queries";
import { listarFerias, type SituacaoFerias } from "@/modules/rh/ferias/queries";

/** Ordena os alertas com crítico antes de aviso e, dentro do mesmo nível, por uma chave string asc (nulos por último). */
function ordenarPorUrgenciaEChave<T extends { urgencia: Urgencia }>(
  itens: T[],
  chave: (item: T) => string | null,
): T[] {
  return [...itens].sort((a, b) => {
    if (a.urgencia !== b.urgencia) {
      return a.urgencia === "critico" ? -1 : 1;
    }
    const chaveA = chave(a);
    const chaveB = chave(b);
    if (chaveA === chaveB) return 0;
    if (chaveA === null) return 1;
    if (chaveB === null) return -1;
    return chaveA < chaveB ? -1 : 1;
  });
}

/** Alerta de documento (ASO/exame/certificado) vencido ou a vencer. */
export interface AlertaDocumento {
  id: string;
  colaboradorId: string;
  colaboradorNome: string;
  descricao: string;
  tipo: string;
  dataVencimento: string | null;
  situacao: SituacaoDocumento;
  urgencia: Urgencia;
}

/**
 * Alertas de documentos: reusa `listarDocumentos()` (situação já calculada
 * na fonte), filtra só vencido/a_vencer, mapeia a urgência e ordena crítico
 * antes de aviso, e dentro do mesmo nível por vencimento mais próximo.
 */
export async function listarAlertasDocumentos(): Promise<AlertaDocumento[]> {
  const documentos = await listarDocumentos();

  const alertas: AlertaDocumento[] = documentos
    .filter((doc) => doc.situacao === "vencido" || doc.situacao === "a_vencer")
    .map((doc) => ({
      id: doc.id,
      colaboradorId: doc.colaboradorId,
      colaboradorNome: doc.colaboradorNome,
      descricao: doc.descricao,
      tipo: doc.tipo,
      dataVencimento: doc.dataVencimento,
      situacao: doc.situacao,
      // Não deveria ser null aqui (filtro já restringiu a vencido/a_vencer),
      // mas cai em "aviso" como fallback defensivo em vez de quebrar o mapeamento.
      urgencia: urgenciaDocumento(doc.situacao) ?? "aviso",
    }));

  return ordenarPorUrgenciaEChave(alertas, (a) => a.dataVencimento);
}

/** Alerta de férias vencidas ou a vencer (limite de gozo). */
export interface AlertaFerias {
  id: string;
  colaboradorId: string;
  colaboradorNome: string;
  limiteGozo: string;
  situacao: SituacaoFerias;
  urgencia: Urgencia;
}

/**
 * Alertas de férias: reusa `listarFerias()` (situação já calculada na
 * fonte), filtra só vencida/a_vencer, mapeia a urgência e ordena crítico
 * antes de aviso, e dentro do mesmo nível por limite de gozo mais próximo.
 */
export async function listarAlertasFerias(): Promise<AlertaFerias[]> {
  const ferias = await listarFerias();

  const alertas: AlertaFerias[] = ferias
    .filter((f) => f.situacao === "vencida" || f.situacao === "a_vencer")
    .map((f) => ({
      id: f.id,
      colaboradorId: f.colaboradorId,
      colaboradorNome: f.colaboradorNome,
      limiteGozo: f.limiteGozo,
      situacao: f.situacao,
      urgencia: urgenciaFerias(f.situacao) ?? "aviso",
    }));

  return ordenarPorUrgenciaEChave(alertas, (a) => a.limiteGozo);
}

/** Alerta de EPI a recolher: colaborador inativo com EPI ainda não devolvido. */
export interface AlertaEpi {
  id: string;
  colaboradorId: string;
  colaboradorNome: string;
  descricao: string;
  ca: string | null;
  quantidade: number;
  dataEntrega: string;
}

/**
 * Alertas de EPI a recolher: EPIs sem devolução (`data_devolucao is null`)
 * de colaboradores já inativos (`colaboradores.ativo = false`) — quem saiu
 * mas ainda está com o equipamento. Sempre crítico (não passa por
 * `urgenciaDocumento`/`urgenciaFerias`, que são específicas de situação de
 * vencimento). Ordenado por data de entrega mais antiga primeiro (no banco).
 *
 * Via `fn_epis_a_recolher` (SECURITY DEFINER, gateada por `rh.epis`/ver): a
 * fn atravessa a RLS de `colaboradores` e gateia pela permissão correta, sem
 * depender de `cadastros.colaboradores`. Um `!inner join` no PostgREST vira
 * INNER JOIN real e a RLS tudo-ou-nada de `colaboradores` zeraria o resultado
 * para quem tem `rh.epis` mas não `cadastros.colaboradores` (perfil RH) — um
 * falso "nenhum EPI a recolher" silencioso.
 */
export async function listarAlertasEpiRecolher(): Promise<AlertaEpi[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("fn_epis_a_recolher");

  if (error) {
    throw new Error("Não foi possível carregar os alertas de EPI a recolher");
  }

  return (data ?? []).map((linha) => ({
    id: linha.id,
    colaboradorId: linha.colaborador_id,
    colaboradorNome: linha.colaborador_nome,
    descricao: linha.descricao,
    ca: linha.ca,
    quantidade: linha.quantidade,
    dataEntrega: linha.data_entrega,
  }));
}

/** Alerta de cadastro incompleto: colaborador ativo sem salário e/ou sem dados bancários. */
export interface AlertaCadastro {
  colaboradorId: string;
  colaboradorNome: string;
  semSalario: boolean;
  semBanco: boolean;
}

/**
 * Alertas de cadastro incompleto: colaboradores ativos sem salário
 * registrado (só para vínculo CLT — ver `VINCULOS_FOLHA_SALARIO` em
 * `calculo.ts`) e/ou sem nenhum meio de recebimento (banco ou chave Pix,
 * qualquer vínculo). Só devolve quem tem pelo menos um dos dois problemas.
 */
export async function listarAlertasCadastro(): Promise<AlertaCadastro[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("colaboradores")
    .select("id, nome, vinculo, salario, banco, chave_pix, ativo")
    .eq("ativo", true);

  if (error) {
    throw new Error("Não foi possível carregar os alertas de cadastro");
  }

  const alertas: AlertaCadastro[] = [];

  for (const c of data ?? []) {
    const { semSalario, semBanco } = cadastroFaltando({
      ativo: c.ativo,
      vinculo: c.vinculo,
      salario: c.salario,
      banco: c.banco,
      chavePix: c.chave_pix,
    });

    if (semSalario || semBanco) {
      alertas.push({
        colaboradorId: c.id,
        colaboradorNome: c.nome,
        semSalario,
        semBanco,
      });
    }
  }

  return alertas;
}
