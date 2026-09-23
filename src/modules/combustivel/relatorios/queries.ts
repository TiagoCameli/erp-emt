import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import { relogioDeParede, type BaseCombustivel } from "@/modules/combustivel/anomalias/base";
import type {
  CadastrosRelatorio,
  EntradaRelatorio,
  TransferenciaRelatorio,
} from "@/modules/combustivel/relatorios/consolidar";
import { fimExclusivoDoDia, inicioDoDia, type Periodo } from "@/modules/combustivel/relatorios/periodo";
import { paraNumeroDoBanco } from "@/modules/manutencao/servicos/formato";

/** Os nomes que os relatórios usam, tirados da base compartilhada. */
export function cadastrosDaBase(base: BaseCombustivel): CadastrosRelatorio {
  return {
    equipamentos: new Map(base.equipamentos.map((e) => [e.id, { descricao: e.descricao, codigo: e.codigo, tipo: e.tipo }])),
    transportadoraNome: base.transportadoraNome,
    obraNome: base.obraNome,
  };
}

interface LinhaEntrada {
  id: string;
  data_hora: string;
  tanque_id: string;
  insumo_id: string;
  litros: number | string;
  valor_total: number | string;
  nota_fiscal: string | null;
  observacoes: string | null;
  created_by: string | null;
  fornecedores: { razao_social: string; nome_fantasia: string | null } | null;
}

/** Entradas não excluídas do período (dias de Rio Branco), com o nome do fornecedor. */
export async function lerEntradasDoPeriodo(periodo: Periodo): Promise<EntradaRelatorio[]> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas<LinhaEntrada>((de, ate) =>
    supabase
      .from("combustivel_entradas")
      .select(
        "id, data_hora, tanque_id, insumo_id, litros, valor_total, nota_fiscal, observacoes, created_by, fornecedores(razao_social, nome_fantasia)",
      )
      .is("excluido_em", null)
      .gte("data_hora", inicioDoDia(periodo.de))
      .lt("data_hora", fimExclusivoDoDia(periodo.ate))
      .order("data_hora", { ascending: false })
      .order("id")
      .range(de, ate)
      .returns<LinhaEntrada[]>(),
  );
  if (erro) throw new Error("Não foi possível ler as entradas de combustível");
  return linhas.map((e) => ({
    id: e.id,
    dataHora: relogioDeParede(e.data_hora),
    tanqueId: e.tanque_id,
    tipoCombustivel: e.insumo_id,
    litros: paraNumeroDoBanco(e.litros),
    valorTotal: paraNumeroDoBanco(e.valor_total),
    fornecedor: e.fornecedores ? e.fornecedores.nome_fantasia?.trim() || e.fornecedores.razao_social : "",
    notaFiscal: e.nota_fiscal,
    observacoes: e.observacoes,
    createdBy: e.created_by,
  }));
}

/** Transferências não excluídas do período. */
export async function lerTransferenciasDoPeriodo(periodo: Periodo): Promise<TransferenciaRelatorio[]> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("combustivel_transferencias")
      .select("id, data_hora, tanque_origem_id, tanque_destino_id, litros, valor_total, observacoes, created_by")
      .is("excluido_em", null)
      .gte("data_hora", inicioDoDia(periodo.de))
      .lt("data_hora", fimExclusivoDoDia(periodo.ate))
      .order("data_hora", { ascending: false })
      .order("id")
      .range(de, ate),
  );
  if (erro) throw new Error("Não foi possível ler as transferências de combustível");
  return linhas.map((t) => ({
    id: t.id,
    dataHora: relogioDeParede(t.data_hora),
    tanqueOrigemId: t.tanque_origem_id,
    tanqueDestinoId: t.tanque_destino_id,
    litros: paraNumeroDoBanco(t.litros),
    valorTotal: paraNumeroDoBanco(t.valor_total),
    observacoes: t.observacoes,
    createdBy: t.created_by,
  }));
}

/**
 * Nome de quem lançou ("Criado por" da origem). Se a política de `usuarios` não deixar
 * ler, a coluna sai vazia: é informação de apoio, não motivo para negar o arquivo.
 */
export async function lerNomesDeUsuarios(ids: readonly string[]): Promise<Map<string, string>> {
  const nomes = new Map<string, string>();
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return nomes;
  const supabase = await createClient();
  for (let i = 0; i < unicos.length; i += 100) {
    const { data, error } = await supabase.from("usuarios").select("id, nome").in("id", unicos.slice(i, i + 100));
    if (error) return nomes;
    for (const u of data ?? []) nomes.set(u.id, u.nome);
  }
  return nomes;
}

/** Transportadoras ativas (bloco "Transportadoras" da aba Cadastros). */
export async function lerTransportadorasAtivas(): Promise<string[]> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("fornecedores")
      .select("id, razao_social, nome_fantasia")
      .eq("eh_transportadora", true)
      .eq("ativo", true)
      .order("id")
      .range(de, ate),
  );
  if (erro) throw new Error("Não foi possível ler as transportadoras");
  return linhas.map((f) => f.nome_fantasia?.trim() || f.razao_social);
}
