"use server";

import { revalidatePath } from "next/cache";

import { erroAcao, semLancar } from "@/lib/erros";
import { mensagemDeNegocio } from "@/lib/erros-banco";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { aprovarMedicaoSchema, quantidadeAprovadaParaBanco, type AprovarMedicaoInput } from "@/modules/medicao/medicoes/aprovacao";
import { lancarAjusteSchema, motivoCicloSchema, type LancarAjusteInput } from "@/modules/medicao/medicoes/ciclo-schemas";

/**
 * Passos do ciclo da medição (Fase 5): fechar, reabrir, ajuste, enviar, nova revisão e revisar
 * aprovada. Cada RPC confere de novo a permissão, o contrato (D3) e o status com a medição travada
 * (`for update`): o segundo pedido de um duplo clique é recusado pela regra do status. A checagem
 * aqui só evita a ida ao banco sem permissão; a recusa (P0001, pt-BR) volta como está. Aprovar
 * (Task 4) manda a quantidade aprovada por item, ou "tudo como medido".
 */

const RECURSO = "medicao.medicoes" as const;
const ROTA_LISTA = "/medicao/medicoes";

export type ResultadoCiclo = { ok: true } | { erro: string };

type Acao = "editar" | "aprovar" | "desaprovar";

async function pode(acao: Acao): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

function revalidar(medicaoId: string) {
  try {
    revalidatePath(ROTA_LISTA);
    revalidatePath(`${ROTA_LISTA}/${medicaoId}`);
  } catch {
    // O sucesso já aconteceu.
  }
}

interface Passo {
  contexto: string;
  acao: Acao;
  semPermissao: string;
  falha: string;
}

/** Corpo comum: permissão, id, RPC, recusa do banco como está, revalidação. */
async function executar(
  passo: Passo,
  medicaoId: string,
  chamar: (supabase: Awaited<ReturnType<typeof createClient>>) => PromiseLike<{ error: { code?: string; message?: string } | null }>,
  validar?: () => string | null,
): Promise<ResultadoCiclo> {
  const resultado = await semLancar(passo.contexto, async (): Promise<ResultadoCiclo> => {
    if (!(await pode(passo.acao))) return { erro: passo.semPermissao };
    if (!idSchema.safeParse(medicaoId).success) return { erro: "Medição inválida" };
    const invalido = validar?.() ?? null;
    if (invalido) return { erro: invalido };

    const supabase = await createClient();
    const { error } = await chamar(supabase);
    if (error) return erroAcao(passo.contexto, error, mensagemDeNegocio(error, passo.falha));
    revalidar(medicaoId);
    return { ok: true };
  });
  return resultado;
}

function motivoOuErro(motivo: string): { motivo: string } | { erro: string } {
  const r = motivoCicloSchema.safeParse(motivo ?? "");
  return r.success ? { motivo: r.data } : { erro: r.error.issues[0]?.message ?? "Motivo inválido" };
}

/** Aberta -> em conferência (a versão passa para a vigente no fim do período). */
export async function fecharMedicao(id: string): Promise<ResultadoCiclo> {
  return executar(
    { contexto: "medicao.medicoes.fechar", acao: "editar", semPermissao: "Sem permissão para fechar medição", falha: "Não foi possível fechar a medição. Tente novamente" },
    id,
    (s) => s.rpc("fn_mc_medicao_fechar", { p_id: id }),
  );
}

/** Em conferência -> aberta, com motivo. */
export async function reabrirMedicao(id: string, motivo: string): Promise<ResultadoCiclo> {
  const m = motivoOuErro(motivo);
  return executar(
    { contexto: "medicao.medicoes.reabrir", acao: "editar", semPermissao: "Sem permissão para reabrir medição", falha: "Não foi possível reabrir a medição. Tente novamente" },
    id,
    (s) => s.rpc("fn_mc_medicao_reabrir", { p_id: id, p_motivo: "motivo" in m ? m.motivo : "" }),
    () => ("erro" in m ? m.erro : null),
  );
}

/** Ajuste de quantidade (positiva ou negativa) na revisão em aberto. */
export async function lancarAjuste(dados: LancarAjusteInput): Promise<ResultadoCiclo> {
  const validado = lancarAjusteSchema.safeParse(dados);
  const ajuste = validado.success ? validado.data : null;
  const medicaoId = typeof dados?.medicaoId === "string" ? dados.medicaoId : "";
  return executar(
    { contexto: "medicao.medicoes.ajuste", acao: "editar", semPermissao: "Sem permissão para lançar ajuste", falha: "Não foi possível lançar o ajuste. Tente novamente" },
    medicaoId,
    (s) =>
      s.rpc("fn_mc_ajuste_lancar", {
        p_medicao: medicaoId,
        p_item: ajuste?.itemId ?? "",
        p_quantidade: ajuste?.quantidade ?? "",
        p_motivo: ajuste?.motivo ?? "",
      }),
    () => (validado.success ? null : (validado.error.issues[0]?.message ?? "Dados inválidos")),
  );
}

/** Envia a revisão em aberto (congela a medida por item). */
export async function enviarMedicao(id: string): Promise<ResultadoCiclo> {
  return executar(
    { contexto: "medicao.medicoes.enviar", acao: "editar", semPermissao: "Sem permissão para enviar medição", falha: "Não foi possível enviar a medição. Tente novamente" },
    id,
    (s) => s.rpc("fn_mc_medicao_enviar", { p_id: id }),
  );
}

/** A revisão enviada vira substituída e nasce a REVnn+1 em aberto, com motivo. */
export async function novaRevisao(id: string, motivo: string): Promise<ResultadoCiclo> {
  const m = motivoOuErro(motivo);
  return executar(
    { contexto: "medicao.medicoes.nova_revisao", acao: "editar", semPermissao: "Sem permissão para abrir nova revisão", falha: "Não foi possível abrir a nova revisão. Tente novamente" },
    id,
    (s) => s.rpc("fn_mc_medicao_nova_revisao", { p_id: id, p_motivo: "motivo" in m ? m.motivo : "" }),
    () => ("erro" in m ? m.erro : null),
  );
}

/** Abre a revisão pós-aprovação (a medição continua aprovada). Permissão `desaprovar`. */
export async function revisarAprovada(id: string, motivo: string): Promise<ResultadoCiclo> {
  const m = motivoOuErro(motivo);
  return executar(
    { contexto: "medicao.medicoes.revisar_aprovada", acao: "desaprovar", semPermissao: "Sem permissão para revisar medição aprovada", falha: "Não foi possível abrir a revisão da medição aprovada. Tente novamente" },
    id,
    (s) => s.rpc("fn_mc_medicao_revisar_aprovada", { p_id: id, p_motivo: "motivo" in m ? m.motivo : "" }),
    () => ("erro" in m ? m.erro : null),
  );
}

type ItensAprovados = { item_id: string; quantidade: string }[];

/** Converte as quantidades cruas da tela (pt-BR; vazio é 0; ambíguo recusado) para a RPC. */
function itensParaBanco(itens: { itemId: string; quantidade: string }[]): { itens: ItensAprovados } | { erro: string } {
  const vistos = new Set<string>();
  const saida: ItensAprovados = [];
  for (const item of itens) {
    if (vistos.has(item.itemId)) return { erro: "Item repetido na aprovação" };
    vistos.add(item.itemId);
    const r = quantidadeAprovadaParaBanco(item.quantidade);
    if ("erro" in r) return { erro: `Quantidade aprovada inválida: ${r.erro}` };
    saida.push({ item_id: item.itemId, quantidade: r.valor });
  }
  return { itens: saida };
}

/**
 * Aprova a revisão enviada. Com `tudoComoMedido`, cada item vai com a medida congelada e os itens
 * não são mandados. Sem ele, cada item vai com a quantidade digitada (vazio é 0); item congelado
 * que não vier também vai 0 (regra da RPC). Permissão `aprovar`.
 */
export async function aprovarMedicao(dados: AprovarMedicaoInput): Promise<ResultadoCiclo> {
  const validado = aprovarMedicaoSchema.safeParse(dados);
  const medicaoId = typeof dados?.id === "string" ? dados.id : "";
  const tudo = validado.success && validado.data.tudoComoMedido;
  const convertidos = validado.success && !tudo ? itensParaBanco(validado.data.itens) : { itens: [] as ItensAprovados };
  return executar(
    { contexto: "medicao.medicoes.aprovar", acao: "aprovar", semPermissao: "Sem permissão para aprovar medição", falha: "Não foi possível aprovar a medição. Tente novamente" },
    medicaoId,
    (s) =>
      s.rpc("fn_mc_medicao_aprovar", {
        p_id: medicaoId,
        p_itens: "itens" in convertidos ? convertidos.itens : [],
        p_tudo_como_medido: tudo,
      }),
    () => {
      if (!validado.success) return validado.error.issues[0]?.message ?? "Dados inválidos";
      return "erro" in convertidos ? convertidos.erro : null;
    },
  );
}
