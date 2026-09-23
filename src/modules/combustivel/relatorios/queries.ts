import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import { raizDoCentro, type SaidaRelatorio } from "@/modules/combustivel/relatorios/consolidar";
import { fimExclusivoDoDia, inicioDoDia, type Periodo } from "@/modules/combustivel/relatorios/periodo";
import { paraNumeroDoBanco, paraNumeroOuNulo, rotuloEquipamento } from "@/modules/manutencao/servicos/formato";

/** Teto de saídas por arquivo. Acima disso a action pede um período menor. */
export const LIMITE_SAIDAS_RELATORIO = 50_000;

const SELECT_SAIDA =
  "id, data, origem, tipo_consumidor, tanque_id, equipamento_id, transportadora_id, placa, motorista, insumo_id, litros, " +
  "preco_combustivel, preco_proprietario, taxa_litro, preco_unitario, preco_medio_tanque, valor_total, pago, pago_em, " +
  "medicao, tipo_medicao, centro_custo_id, canal, observacoes, created_at, " +
  "abastecimento_alocacoes(centro_custo_id, percentual, litros)";

interface LinhaSaidaBanco {
  id: string;
  data: string;
  origem: string;
  tipo_consumidor: string;
  tanque_id: string | null;
  equipamento_id: string | null;
  transportadora_id: string | null;
  placa: string | null;
  motorista: string | null;
  insumo_id: string;
  litros: number;
  preco_combustivel: number | null;
  preco_proprietario: number | null;
  taxa_litro: number;
  preco_unitario: number;
  preco_medio_tanque: number | null;
  valor_total: number;
  pago: boolean;
  pago_em: string | null;
  medicao: number | null;
  tipo_medicao: string | null;
  centro_custo_id: string | null;
  canal: string;
  observacoes: string | null;
  created_at: string;
  abastecimento_alocacoes: { centro_custo_id: string; percentual: number; litros: number }[];
}

/**
 * Todas as saídas NÃO EXCLUÍDAS do período (dias de Rio Branco), com as
 * alocações por obra e os nomes resolvidos. Paginada por `todasAsLinhas` e
 * ordenada por data e id (desempate, senão a paginação repete e pula linha).
 *
 * Os cadastros vêm inteiros (dezenas de tanques e equipamentos, centenas de
 * centros) em vez de `.in()` com os ids das saídas, que estoura a URL.
 */
export async function lerSaidasDoPeriodo(periodo: Periodo): Promise<SaidaRelatorio[]> {
  const supabase = await createClient();

  const [saidas, tanques, equipamentos, insumos, centros] = await Promise.all([
    todasAsLinhas<LinhaSaidaBanco>((de, ate) =>
      supabase
        .from("combustivel_saidas")
        .select(SELECT_SAIDA)
        .is("excluido_em", null)
        .gte("data", inicioDoDia(periodo.de))
        .lt("data", fimExclusivoDoDia(periodo.ate))
        .order("data")
        .order("id")
        .range(de, ate)
        .returns<LinhaSaidaBanco[]>(),
    ),
    todasAsLinhas((de, ate) => supabase.from("tanques").select("id, nome, apelido").order("id").range(de, ate)),
    todasAsLinhas((de, ate) =>
      supabase.from("equipamentos").select("id, codigo, descricao, placa").order("id").range(de, ate),
    ),
    todasAsLinhas((de, ate) => supabase.from("insumos").select("id, nome").eq("ativo", true).order("id").range(de, ate)),
    todasAsLinhas((de, ate) => supabase.from("centros_custo").select("id, nome, pai_id").order("id").range(de, ate)),
  ]);
  if (saidas.erro || tanques.erro || equipamentos.erro || insumos.erro || centros.erro) {
    throw new Error(saidas.erro ?? tanques.erro ?? equipamentos.erro ?? insumos.erro ?? centros.erro ?? "leitura falhou");
  }

  const transportadoraIds = [
    ...new Set(saidas.linhas.map((s) => s.transportadora_id).filter((id): id is string => id !== null)),
  ];
  const nomeTransportadora = new Map<string, string>();
  if (transportadoraIds.length > 0) {
    const { data, error } = await supabase
      .from("fornecedores")
      .select("id, razao_social, nome_fantasia")
      .in("id", transportadoraIds);
    if (error) throw new Error(error.message);
    for (const f of data ?? []) nomeTransportadora.set(f.id, f.nome_fantasia?.trim() || f.razao_social);
  }

  // O insumo da saída pode estar inativo hoje: o que falta vem por id.
  const nomeInsumo = new Map(insumos.linhas.map((i) => [i.id, i.nome]));
  const faltando = [...new Set(saidas.linhas.map((s) => s.insumo_id))].filter((id) => !nomeInsumo.has(id));
  if (faltando.length > 0) {
    const { data, error } = await supabase.from("insumos").select("id, nome").in("id", faltando);
    if (error) throw new Error(error.message);
    for (const i of data ?? []) nomeInsumo.set(i.id, i.nome);
  }

  const nomeTanque = new Map(tanques.linhas.map((t) => [t.id, t.apelido?.trim() || t.nome]));
  const nomeEquipamento = new Map(equipamentos.linhas.map((e) => [e.id, rotuloEquipamento(e)]));
  const arvore = new Map(centros.linhas.map((c) => [c.id, { nome: c.nome, paiId: c.pai_id }]));

  return saidas.linhas.map((s) => ({
    id: s.id,
    data: s.data,
    origem: s.origem,
    tipoConsumidor: s.tipo_consumidor,
    tanqueNome: s.tanque_id ? (nomeTanque.get(s.tanque_id) ?? null) : null,
    equipamentoId: s.equipamento_id,
    equipamentoNome: s.equipamento_id ? (nomeEquipamento.get(s.equipamento_id) ?? null) : null,
    transportadoraId: s.transportadora_id,
    transportadoraNome: s.transportadora_id ? (nomeTransportadora.get(s.transportadora_id) ?? null) : null,
    placa: s.placa,
    motorista: s.motorista,
    insumoId: s.insumo_id,
    combustivel: nomeInsumo.get(s.insumo_id) ?? "Combustível não encontrado",
    litros: paraNumeroDoBanco(s.litros),
    precoCombustivel: paraNumeroOuNulo(s.preco_combustivel),
    precoProprietario: paraNumeroOuNulo(s.preco_proprietario),
    taxaLitro: paraNumeroDoBanco(s.taxa_litro),
    precoUnitario: paraNumeroDoBanco(s.preco_unitario),
    precoMedioTanque: paraNumeroOuNulo(s.preco_medio_tanque),
    valorTotal: paraNumeroDoBanco(s.valor_total),
    pago: s.pago,
    pagoEm: s.pago_em,
    medicao: paraNumeroOuNulo(s.medicao),
    tipoMedicao: s.tipo_medicao,
    centroCustoNome: s.centro_custo_id ? (arvore.get(s.centro_custo_id)?.nome ?? null) : null,
    canal: s.canal,
    observacoes: s.observacoes,
    criadoEm: s.created_at,
    alocacoes: (s.abastecimento_alocacoes ?? []).map((a) => {
      const raiz = raizDoCentro(a.centro_custo_id, arvore);
      return {
        centroRaizId: raiz?.id ?? null,
        centroRaizNome: raiz?.nome ?? "Centro de custo não encontrado",
        percentual: paraNumeroDoBanco(a.percentual),
        litros: paraNumeroDoBanco(a.litros),
      };
    }),
  }));
}

/** Quantas saídas o período tem, sem baixar nenhuma (o banco conta). */
export async function contarSaidasDoPeriodo(periodo: Periodo): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("combustivel_saidas")
    .select("id", { count: "exact", head: true })
    .is("excluido_em", null)
    .gte("data", inicioDoDia(periodo.de))
    .lt("data", fimExclusivoDoDia(periodo.ate));
  if (error) throw new Error(error.message);
  return count ?? 0;
}
