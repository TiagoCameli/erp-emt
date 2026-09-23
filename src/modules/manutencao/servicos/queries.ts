import "server-only";

import type { EventoTrilha } from "@/components/canonicos/trilha";
import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import type {
  PrioridadeOs,
  StatusOs,
  TipoOs,
  UnidadeOleo,
} from "@/modules/manutencao/_shared/rotulos";
import {
  aplicarFiltrosServicos,
  type FiltrosServicos,
} from "@/modules/manutencao/servicos/filtros";
import {
  paraNumeroDoBanco,
  paraNumeroOuNulo,
  rotuloEquipamento,
  somarValoresOperacionais,
} from "@/modules/manutencao/servicos/formato";
import { chaveSaldo } from "@/modules/manutencao/servicos/schemas";
import { eventosDaTrilhaOs } from "@/modules/manutencao/servicos/trilha";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// ---------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------

export interface OsLista {
  id: string;
  numero: string;
  numeroLegado: string | null;
  equipamentoId: string;
  equipamentoNome: string;
  propriedade: string | null;
  tipo: TipoOs;
  prioridade: PrioridadeOs;
  status: StatusOs;
  dataAbertura: string;
  dataConclusao: string | null;
  custoTotal: number;
}

export interface ResultadoListaServicos {
  itens: OsLista[];
  /** Quantas OS o filtro acha, em todas as páginas. */
  total: number;
  /** Soma do custo de TODAS as OS do filtro (não só da página), calculada aqui. */
  custoDoFiltro: number;
}

const SELECT_LISTA =
  "id, numero, numero_legado, equipamento_id, tipo, prioridade, status, data_abertura, data_conclusao, custo_total, equipamentos(codigo, descricao, placa, propriedade)";

/**
 * Página do caderno de serviços, com o total e a soma do custo pelo MESMO filtro.
 *
 * Paginação no servidor com `count: "exact"`: a origem tinha um `.limit(200)`
 * que cortava a lista em silêncio. A soma do custo vem de uma segunda consulta
 * com o mesmo `aplicarFiltrosServicos`, só com a coluna do custo, paginada por
 * `todasAsLinhas` (o PostgREST corta em 1.000 sem avisar). Somar a página daria
 * o total de 25 OS com cara de total do período.
 *
 * O desempate por `id` no fim do ORDER BY impede a paginação de repetir uma OS
 * numa página e perder outra na seguinte (várias OS abrem no mesmo dia).
 */
export async function listarServicos(filtros: FiltrosServicos): Promise<ResultadoListaServicos> {
  const supabase = await createClient();
  const de = filtros.pagina * filtros.tamanho;
  const ate = de + filtros.tamanho - 1;

  const pagina = aplicarFiltrosServicos(
    supabase
      .from("ordens_servico")
      .select(SELECT_LISTA, { count: "exact" })
      .is("excluido_em", null),
    filtros,
  )
    .order("data_abertura", { ascending: false })
    .order("numero", { ascending: false })
    .order("id")
    .range(de, ate);

  const [resultadoPagina, resultadoSoma] = await Promise.all([
    pagina,
    todasAsLinhas((inicio, fim) =>
      aplicarFiltrosServicos(
        supabase.from("ordens_servico").select("custo_total").is("excluido_em", null),
        filtros,
      )
        .order("id")
        .range(inicio, fim),
    ),
  ]);

  if (resultadoPagina.error) {
    throw new Error("Não foi possível carregar as ordens de serviço");
  }
  // Soma pela metade é pior que soma nenhuma: um total de custo errado com cara
  // de certo é exatamente o que esta tela existe para evitar.
  if (resultadoSoma.erro) {
    throw new Error("Não foi possível somar o custo das ordens de serviço");
  }

  const itens: OsLista[] = (resultadoPagina.data ?? []).map((linha) => ({
    id: linha.id,
    numero: linha.numero,
    numeroLegado: linha.numero_legado,
    equipamentoId: linha.equipamento_id,
    equipamentoNome: linha.equipamentos ? rotuloEquipamento(linha.equipamentos) : "",
    propriedade: linha.equipamentos?.propriedade ?? null,
    tipo: linha.tipo as TipoOs,
    prioridade: linha.prioridade as PrioridadeOs,
    status: linha.status as StatusOs,
    dataAbertura: linha.data_abertura,
    dataConclusao: linha.data_conclusao,
    custoTotal: paraNumeroDoBanco(linha.custo_total),
  }));

  return {
    itens,
    total: resultadoPagina.count ?? itens.length,
    custoDoFiltro: somarValoresOperacionais(
      resultadoSoma.linhas.map((linha) => paraNumeroDoBanco(linha.custo_total)),
    ),
  };
}

// ---------------------------------------------------------------------------
// Opções dos formulários
// ---------------------------------------------------------------------------

export interface EquipamentoOpcaoOs {
  id: string;
  rotulo: string;
  propriedade: string;
  /** Tem etapa no centro de custo (próprio, Colorado). Alugado não tem. */
  temEtapa: boolean;
  controlePor: string;
}

/**
 * Equipamentos ativos para abrir OS, com a informação de que a OS vai pedir a
 * obra (alugado, sem etapa). A etapa é lida do centro de custo, e não deduzida da
 * propriedade, porque é isso que o fn_os_salvar consulta.
 */
export async function listarEquipamentosParaOs(): Promise<EquipamentoOpcaoOs[]> {
  const supabase = await createClient();

  const [equipamentos, etapas] = await Promise.all([
    todasAsLinhas((de, ate) =>
      supabase
        .from("equipamentos")
        .select("id, codigo, descricao, placa, propriedade, controle_por")
        .eq("ativo", true)
        .order("codigo", { ascending: true, nullsFirst: false })
        .order("descricao")
        .order("id")
        .range(de, ate),
    ),
    todasAsLinhas((de, ate) =>
      supabase
        .from("centros_custo")
        .select("equipamento_id")
        .not("equipamento_id", "is", null)
        .order("id")
        .range(de, ate),
    ),
  ]);

  if (equipamentos.erro || etapas.erro) {
    throw new Error("Não foi possível carregar os equipamentos");
  }

  const comEtapa = new Set(
    etapas.linhas
      .map((linha) => linha.equipamento_id)
      .filter((id): id is string => id !== null),
  );

  return equipamentos.linhas.map((equipamento) => ({
    id: equipamento.id,
    rotulo: rotuloEquipamento(equipamento),
    propriedade: equipamento.propriedade,
    temEtapa: comEtapa.has(equipamento.id),
    controlePor: equipamento.controle_por,
  }));
}

export interface FornecedorOpcaoOs {
  id: string;
  nome: string;
}

/** Fornecedores ativos, paginados até o fim (já são mais de 900). */
export async function listarFornecedoresAtivos(): Promise<FornecedorOpcaoOs[]> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("fornecedores")
      .select("id, razao_social, nome_fantasia")
      .eq("ativo", true)
      .order("razao_social")
      .order("id")
      .range(de, ate),
  );
  if (erro) throw new Error("Não foi possível carregar os fornecedores");
  return linhas.map((fornecedor) => ({
    id: fornecedor.id,
    nome: fornecedor.nome_fantasia ?? fornecedor.razao_social,
  }));
}

export interface SaldoOpcao {
  /** "depositoId:insumoId", o valor do Combobox. */
  chave: string;
  depositoId: string;
  depositoNome: string;
  insumoId: string;
  insumoNome: string;
  unidade: string | null;
  saldo: number;
  custoMedio: number;
}

export interface SaldoOleoOpcao extends SaldoOpcao {
  tipoOleoId: string;
  tipoOleoNome: string;
}

export interface SaldosParaOs {
  pecas: SaldoOpcao[];
  oleos: SaldoOleoOpcao[];
}

/**
 * O que dá para baixar agora: pares depósito × insumo com saldo maior que zero,
 * lidos de `almoxarifado_saldos` (o saldo único, mantido por gatilho).
 *
 * Óleo é o insumo cujo `almoxarifado_itens.tipo_oleo_id` está preenchido; o tipo
 * de óleo vem dali, não é escolhido na tela. Esses insumos saem da lista de
 * peças para o óleo não ser lançado como peça por engano.
 */
export async function listarSaldosParaOs(): Promise<SaldosParaOs> {
  const supabase = await createClient();

  const [saldos, itensOleo] = await Promise.all([
    todasAsLinhas((de, ate) =>
      supabase
        .from("almoxarifado_saldos")
        .select(
          "deposito_id, insumo_id, saldo, custo_medio, almoxarifado_depositos(nome), insumos(nome, unidades_medida(sigla))",
        )
        .gt("saldo", 0)
        .order("deposito_id")
        .order("insumo_id")
        .range(de, ate),
    ),
    todasAsLinhas((de, ate) =>
      supabase
        .from("almoxarifado_itens")
        .select("insumo_id, tipo_oleo_id, tipos_oleo(nome, ativo)")
        .not("tipo_oleo_id", "is", null)
        .order("id")
        .range(de, ate),
    ),
  ]);

  if (saldos.erro || itensOleo.erro) {
    throw new Error("Não foi possível carregar o saldo do almoxarifado");
  }

  const oleoPorInsumo = new Map<string, { tipoOleoId: string; tipoOleoNome: string; ativo: boolean }>();
  for (const item of itensOleo.linhas) {
    if (!item.tipo_oleo_id) continue;
    oleoPorInsumo.set(item.insumo_id, {
      tipoOleoId: item.tipo_oleo_id,
      tipoOleoNome: item.tipos_oleo?.nome ?? "",
      ativo: item.tipos_oleo?.ativo ?? false,
    });
  }

  const pecas: SaldoOpcao[] = [];
  const oleos: SaldoOleoOpcao[] = [];
  for (const linha of saldos.linhas) {
    const opcao: SaldoOpcao = {
      chave: chaveSaldo(linha.deposito_id, linha.insumo_id),
      depositoId: linha.deposito_id,
      depositoNome: linha.almoxarifado_depositos?.nome ?? "",
      insumoId: linha.insumo_id,
      insumoNome: linha.insumos?.nome ?? "",
      unidade: linha.insumos?.unidades_medida?.sigla ?? null,
      saldo: paraNumeroDoBanco(linha.saldo),
      custoMedio: paraNumeroDoBanco(linha.custo_medio),
    };
    const oleo = oleoPorInsumo.get(linha.insumo_id);
    if (!oleo) {
      pecas.push(opcao);
    } else if (oleo.ativo) {
      // Tipo de óleo inativo: a RPC recusa ("Tipo de óleo inválido"), então nem oferece.
      oleos.push({ ...opcao, tipoOleoId: oleo.tipoOleoId, tipoOleoNome: oleo.tipoOleoNome });
    }
  }

  const porNome = (a: SaldoOpcao, b: SaldoOpcao) =>
    a.insumoNome.localeCompare(b.insumoNome, "pt-BR") ||
    a.depositoNome.localeCompare(b.depositoNome, "pt-BR");
  pecas.sort(porNome);
  oleos.sort(porNome);
  return { pecas, oleos };
}

// ---------------------------------------------------------------------------
// Detalhe
// ---------------------------------------------------------------------------

export interface OsDetalhe {
  id: string;
  numero: string;
  numeroLegado: string | null;
  status: StatusOs;
  tipo: TipoOs;
  prioridade: PrioridadeOs;
  equipamentoId: string;
  equipamentoNome: string;
  equipamentoPropriedade: string | null;
  equipamentoControlePor: string | null;
  /** O equipamento tem etapa própria no centro de custo (não é alugado). */
  equipamentoTemEtapa: boolean;
  centroCustoId: string;
  centroCustoNome: string;
  descricao: string;
  defeitoReportado: string | null;
  causaRaiz: string | null;
  observacoes: string | null;
  dataAbertura: string;
  dataInicio: string | null;
  dataConclusao: string | null;
  medicaoAbertura: number | null;
  medicaoConclusao: number | null;
  custoPecas: number;
  custoOleos: number;
  custoTerceiros: number;
  custoTotal: number;
  motivoCancelamento: string | null;
  origem: string;
}

/** A OS pelo id, ou null se não existe, foi excluída ou a RLS não deixa ver. */
export async function buscarOs(id: string): Promise<OsDetalhe | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ordens_servico")
    .select(
      `id, numero, numero_legado, status, tipo, prioridade, equipamento_id, centro_custo_id,
       descricao, defeito_reportado, causa_raiz, observacoes, data_abertura, data_inicio,
       data_conclusao, medicao_abertura, medicao_conclusao, custo_pecas, custo_oleos,
       custo_terceiros, custo_total, motivo_cancelamento, origem,
       equipamentos(codigo, descricao, placa, propriedade, controle_por),
       centros_custo(codigo, nome, pai_id)`,
    )
    .eq("id", id)
    .is("excluido_em", null)
    .maybeSingle();

  if (error) throw new Error("Não foi possível carregar a ordem de serviço");
  if (!data) return null;

  const { data: etapaDoEquipamento } = await supabase
    .from("centros_custo")
    .select("id")
    .eq("equipamento_id", data.equipamento_id)
    .limit(1)
    .maybeSingle();

  let centroCustoNome = data.centros_custo
    ? [data.centros_custo.codigo, data.centros_custo.nome].filter(Boolean).join(" ")
    : "";
  // Etapa: o nome dela sozinho ("Escavadeira 320") não diz em que obra está.
  if (data.centros_custo?.pai_id) {
    const { data: pai } = await supabase
      .from("centros_custo")
      .select("codigo, nome")
      .eq("id", data.centros_custo.pai_id)
      .maybeSingle();
    if (pai) {
      const nomePai = [pai.codigo, pai.nome].filter(Boolean).join(" ");
      centroCustoNome = `${nomePai} / ${data.centros_custo.nome}`;
    }
  }

  return {
    id: data.id,
    numero: data.numero,
    numeroLegado: data.numero_legado,
    status: data.status as StatusOs,
    tipo: data.tipo as TipoOs,
    prioridade: data.prioridade as PrioridadeOs,
    equipamentoId: data.equipamento_id,
    equipamentoNome: data.equipamentos ? rotuloEquipamento(data.equipamentos) : "",
    equipamentoPropriedade: data.equipamentos?.propriedade ?? null,
    equipamentoControlePor: data.equipamentos?.controle_por ?? null,
    equipamentoTemEtapa: etapaDoEquipamento !== null,
    centroCustoId: data.centro_custo_id,
    centroCustoNome,
    descricao: data.descricao,
    defeitoReportado: data.defeito_reportado,
    causaRaiz: data.causa_raiz,
    observacoes: data.observacoes,
    dataAbertura: data.data_abertura,
    dataInicio: data.data_inicio,
    dataConclusao: data.data_conclusao,
    medicaoAbertura: paraNumeroOuNulo(data.medicao_abertura),
    medicaoConclusao: paraNumeroOuNulo(data.medicao_conclusao),
    custoPecas: paraNumeroDoBanco(data.custo_pecas),
    custoOleos: paraNumeroDoBanco(data.custo_oleos),
    custoTerceiros: paraNumeroDoBanco(data.custo_terceiros),
    custoTotal: paraNumeroDoBanco(data.custo_total),
    motivoCancelamento: data.motivo_cancelamento,
    origem: data.origem,
  };
}

export interface PecaOs {
  id: string;
  insumoNome: string;
  unidade: string | null;
  depositoNome: string;
  quantidade: number;
  custoUnitario: number;
  custoTotal: number;
  observacoes: string | null;
}

export interface OleoOs {
  id: string;
  tipoOleoNome: string;
  insumoNome: string;
  depositoNome: string;
  quantidade: number;
  unidade: UnidadeOleo;
  valorUnitario: number;
  valorTotal: number;
}

export interface TerceiroOs {
  id: string;
  fornecedorNome: string;
  descricao: string;
  notaFiscal: string | null;
  valor: number;
}

export interface LinhasOs {
  pecas: PecaOs[];
  oleos: OleoOs[];
  terceiros: TerceiroOs[];
}

/** As três listas de linhas da OS, na ordem em que entraram. */
export async function listarLinhasOs(osId: string): Promise<LinhasOs> {
  const supabase = await createClient();
  const [pecas, oleos, terceiros] = await Promise.all([
    supabase
      .from("os_pecas")
      .select(
        "id, quantidade, custo_unitario, custo_total, observacoes, created_at, insumos(nome, unidades_medida(sigla)), almoxarifado_depositos(nome)",
      )
      .eq("ordem_servico_id", osId)
      .order("created_at")
      .order("id"),
    supabase
      .from("os_oleos")
      .select(
        "id, quantidade, unidade, valor_unitario, valor_total, created_at, tipos_oleo(nome), insumos(nome), almoxarifado_depositos(nome)",
      )
      .eq("ordem_servico_id", osId)
      .order("created_at")
      .order("id"),
    supabase
      .from("os_terceiros")
      .select("id, descricao, valor, nota_fiscal, created_at, fornecedores(razao_social, nome_fantasia)")
      .eq("ordem_servico_id", osId)
      .order("created_at")
      .order("id"),
  ]);

  if (pecas.error || oleos.error || terceiros.error) {
    throw new Error("Não foi possível carregar as linhas da ordem de serviço");
  }

  return {
    pecas: (pecas.data ?? []).map((linha) => ({
      id: linha.id,
      insumoNome: linha.insumos?.nome ?? "",
      unidade: linha.insumos?.unidades_medida?.sigla ?? null,
      depositoNome: linha.almoxarifado_depositos?.nome ?? "",
      quantidade: paraNumeroDoBanco(linha.quantidade),
      custoUnitario: paraNumeroDoBanco(linha.custo_unitario),
      custoTotal: paraNumeroDoBanco(linha.custo_total),
      observacoes: linha.observacoes,
    })),
    oleos: (oleos.data ?? []).map((linha) => ({
      id: linha.id,
      tipoOleoNome: linha.tipos_oleo?.nome ?? "",
      insumoNome: linha.insumos?.nome ?? "",
      depositoNome: linha.almoxarifado_depositos?.nome ?? "",
      quantidade: paraNumeroDoBanco(linha.quantidade),
      unidade: (linha.unidade === "kg" ? "kg" : "L") as UnidadeOleo,
      valorUnitario: paraNumeroDoBanco(linha.valor_unitario),
      valorTotal: paraNumeroDoBanco(linha.valor_total),
    })),
    terceiros: (terceiros.data ?? []).map((linha) => ({
      id: linha.id,
      fornecedorNome: linha.fornecedores
        ? (linha.fornecedores.nome_fantasia ?? linha.fornecedores.razao_social)
        : "",
      descricao: linha.descricao,
      notaFiscal: linha.nota_fiscal,
      valor: paraNumeroDoBanco(linha.valor),
    })),
  };
}

/**
 * Nomes dos usuários da trilha pela RPC da Manutenção (20260923110000): devolve o nome
 * para quem vê qualquer tela da Manutenção, que é quem chega nesta página.
 */
async function nomesDeUsuarios(supabase: Supabase, ids: string[]): Promise<Map<string, string>> {
  const nomes = new Map<string, string>();
  if (ids.length === 0) return nomes;
  const { data } = await supabase.rpc("nomes_usuarios_manutencao", { p_ids: ids });
  for (const usuario of data ?? []) nomes.set(usuario.id, usuario.nome);
  return nomes;
}

/** Histórico de status (quem, quando, de, para, motivo) para a Trilha. */
export async function trilhaOs(osId: string, usuarioLogado: { id: string; nome: string } | null): Promise<EventoTrilha[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("os_transicoes")
    .select("id, status_de, status_para, motivo, usuario_id, criado_em")
    .eq("ordem_servico_id", osId)
    .order("criado_em", { ascending: false })
    .order("id", { ascending: false });

  if (error || !data) return [];

  const ids = [
    ...new Set(data.map((linha) => linha.usuario_id).filter((id): id is string => id !== null)),
  ];
  const nomes = await nomesDeUsuarios(supabase, ids);
  if (usuarioLogado && !nomes.has(usuarioLogado.id)) nomes.set(usuarioLogado.id, usuarioLogado.nome);

  return eventosDaTrilhaOs(
    data.map((linha) => ({
      id: linha.id,
      statusDe: linha.status_de,
      statusPara: linha.status_para,
      motivo: linha.motivo,
      usuarioNome: linha.usuario_id ? (nomes.get(linha.usuario_id) ?? null) : "Sistema",
      criadoEm: linha.criado_em,
    })),
  );
}

export interface EquipamentoFiltro {
  id: string;
  rotulo: string;
}

/**
 * Todos os equipamentos, ativos e inativos, para o FILTRO da lista: equipamento
 * vendido continua tendo OS no histórico, e o filtro tem de alcançá-lo.
 */
export async function listarEquipamentosParaFiltro(): Promise<EquipamentoFiltro[]> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("equipamentos")
      .select("id, codigo, descricao, placa, ativo")
      .order("codigo", { ascending: true, nullsFirst: false })
      .order("descricao")
      .order("id")
      .range(de, ate),
  );
  if (erro) throw new Error("Não foi possível carregar os equipamentos");
  return linhas.map((equipamento) => ({
    id: equipamento.id,
    rotulo: equipamento.ativo
      ? rotuloEquipamento(equipamento)
      : `${rotuloEquipamento(equipamento)} (inativo)`,
  }));
}
