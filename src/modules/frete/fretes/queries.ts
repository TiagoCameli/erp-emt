import "server-only";

import type { EventoTrilha, RegistroAuditLog } from "@/components/canonicos";
import { eventosDoAuditLog } from "@/components/canonicos";
import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import { resolverNomesAuditLog } from "@/lib/trilha-nomes";
import { listarCentrosCusto } from "@/modules/_shared/centro-custo/queries";
import { precoUnitarioMaterial, tipoDoFrete } from "@/modules/frete/fretes/schemas";
import type { FreteLinha, Opcao, OpcoesFrete } from "@/modules/frete/fretes/tipos";
import { nomesUsuariosFrete } from "@/modules/frete/_shared/usuarios";
import { paraNumeroDoBanco } from "@/modules/manutencao/servicos/formato";

/** Leituras da aba Fretes (`frete.fretes`). A RLS (fn_ve_frete) cobre a leitura. */

function nomeFornecedor(f: { razao_social: string; nome_fantasia: string | null } | null): string {
  if (!f) return "";
  return f.nome_fantasia?.trim() || f.razao_social;
}

const SELECT_FRETE =
  "id, tipo, data, data_chegada, centro_custo_id, origem_localidade_id, destino_localidade_id, transportadora_id, motorista, placa_carreta, insumo_id, peso_toneladas, km_rodados, valor_tkm, valor_total, valor_material, nota_fiscal, nota_fiscal2, observacoes, excluido_em, motivo_exclusao, created_at, created_by, updated_at, updated_by, origem_loc:localidades!fretes_origem_localidade_id_fkey(nome), destino_loc:localidades!fretes_destino_localidade_id_fkey(nome), transportadora:fornecedores!fretes_transportadora_id_fkey(razao_social, nome_fantasia), insumos(nome), centros_custo(nome, codigo)";

type LinhaFreteBanco = {
  id: string;
  tipo: string;
  data: string;
  data_chegada: string | null;
  centro_custo_id: string | null;
  origem_localidade_id: string;
  destino_localidade_id: string;
  transportadora_id: string;
  motorista: string;
  placa_carreta: string | null;
  insumo_id: string;
  peso_toneladas: number;
  km_rodados: number;
  valor_tkm: number;
  valor_total: number;
  valor_material: number;
  nota_fiscal: string | null;
  nota_fiscal2: string | null;
  observacoes: string | null;
  excluido_em: string | null;
  motivo_exclusao: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
  origem_loc: { nome: string } | null;
  destino_loc: { nome: string } | null;
  transportadora: { razao_social: string; nome_fantasia: string | null } | null;
  insumos: { nome: string } | null;
  centros_custo: { nome: string; codigo: string | null } | null;
};

function paraFreteLinha(l: LinhaFreteBanco): FreteLinha {
  const peso = paraNumeroDoBanco(l.peso_toneladas);
  const valorMaterial = paraNumeroDoBanco(l.valor_material);
  return {
    id: l.id,
    tipo: tipoDoFrete(l.tipo),
    data: l.data,
    dataChegada: l.data_chegada,
    centroCustoId: l.centro_custo_id,
    obraNome: l.centros_custo ? l.centros_custo.nome : null,
    origemId: l.origem_localidade_id,
    origemNome: l.origem_loc?.nome?.trim() ?? "",
    destinoId: l.destino_localidade_id,
    destinoNome: l.destino_loc?.nome?.trim() ?? "",
    transportadoraId: l.transportadora_id,
    transportadoraNome: nomeFornecedor(l.transportadora),
    motorista: l.motorista,
    placaCarreta: l.placa_carreta,
    insumoId: l.insumo_id,
    insumoNome: l.insumos?.nome ?? l.insumo_id,
    pesoToneladas: peso,
    kmRodados: paraNumeroDoBanco(l.km_rodados),
    valorTkm: paraNumeroDoBanco(l.valor_tkm),
    valorTotal: paraNumeroDoBanco(l.valor_total),
    valorMaterial,
    precoUnitario: precoUnitarioMaterial(valorMaterial, peso),
    notaFiscal: l.nota_fiscal,
    notaFiscal2: l.nota_fiscal2,
    observacoes: l.observacoes,
    createdAt: l.created_at,
    createdBy: l.created_by,
    updatedAt: l.updated_at,
    updatedBy: l.updated_by,
    excluidoEm: l.excluido_em,
    motivoExclusao: l.motivo_exclusao,
  };
}

/**
 * Todos os fretes vivos (ou só os da lixeira, com `excluidos`), por `todasAsLinhas`: a
 * origem já passa de mil, e o rodapé soma o filtro inteiro. Ordem da origem, saída
 * desc, com desempate por id para a paginação não repetir linha.
 */
export async function listarFretes(excluidos = false): Promise<FreteLinha[]> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("fretes")
      .select(SELECT_FRETE)
      .filter("excluido_em", excluidos ? "not.is" : "is", null)
      .order("data", { ascending: false })
      .order("id")
      .range(de, ate),
  );
  if (erro) throw new Error("Não foi possível carregar os fretes");

  return linhas.map(paraFreteLinha);
}

/** Um frete pelo id, vivo ou na lixeira (a página de detalhe mostra os dois). Nulo: não achou. */
export async function buscarFrete(id: string): Promise<FreteLinha | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("fretes").select(SELECT_FRETE).eq("id", id).maybeSingle();
  if (error) throw new Error("Não foi possível carregar o frete");
  return data ? paraFreteLinha(data) : null;
}

/** Localidades ativas (origem e destino). */
export async function listarLocalidadesAtivas(): Promise<Opcao[]> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase.from("localidades").select("id, nome").eq("ativo", true).order("nome").order("id").range(de, ate),
  );
  if (erro) throw new Error("Não foi possível carregar as localidades");
  return linhas.map((l) => ({ id: l.id, nome: l.nome.trim() }));
}

/**
 * Transportadoras do frete: fornecedores ativos marcados como transportadora ou dono de
 * tanque. A origem oferecia TODOS os fornecedores e o crédito na conta corrente só
 * nascia para os marcados; no ERP a `fn_frete_salvar` exige a marca, então a lista só
 * oferece quem passa.
 */
export async function listarTransportadorasFrete(): Promise<Opcao[]> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("fornecedores")
      .select("id, razao_social, nome_fantasia")
      .eq("ativo", true)
      .or("eh_transportadora.eq.true,eh_dona_de_tanque.eq.true")
      .order("razao_social")
      .order("id")
      .range(de, ate),
  );
  if (erro) throw new Error("Não foi possível carregar as transportadoras");
  return linhas
    .map((f) => ({ id: f.id, nome: nomeFornecedor(f) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Insumos ativos (são mais de 3 mil: `todasAsLinhas`). */
export async function listarInsumosAtivos(): Promise<Opcao[]> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase.from("insumos").select("id, nome").eq("ativo", true).order("nome").order("id").range(de, ate),
  );
  if (erro) throw new Error("Não foi possível carregar os materiais");
  return linhas.map((i) => ({ id: i.id, nome: i.nome }));
}

/** Obras: as raízes de obra do centro de custo (a obra da origem). */
export async function listarObras(): Promise<Opcao[]> {
  const centros = await listarCentrosCusto();
  return centros
    .filter((c) => c.paiId === null && c.tipo === "obra")
    .map((c) => ({ id: c.id, nome: c.codigo ? `${c.codigo} ${c.nome}` : c.nome }));
}

export async function listarOpcoesFrete(): Promise<OpcoesFrete> {
  const [localidades, transportadoras, insumos, obras] = await Promise.all([
    listarLocalidadesAtivas(),
    listarTransportadorasFrete(),
    listarInsumosAtivos(),
    listarObras(),
  ]);
  return { localidades, transportadoras, insumos, obras };
}

/**
 * Nomes de usuários (criado por, alterado por, trilha), pela RPC do Frete: devolve o
 * nome a quem vê qualquer tela do Frete. A de auditoria devolvia vazio para quem só tem
 * Frete, e o "Criado por" saía "-".
 */
export async function nomesDeUsuarios(ids: string[]): Promise<Record<string, string>> {
  const supabase = await createClient();
  return Object.fromEntries(await nomesUsuariosFrete(supabase, ids));
}

/**
 * Histórico do frete a partir do audit_log (a HistoricoTimeline da origem). A RLS do
 * audit_log só mostra a quem vê a auditoria; para os outros, a lista vem vazia.
 */
export async function trilhaDoFrete(id: string): Promise<EventoTrilha[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, tabela, registro_id, acao, usuario_id, dados_antes, dados_depois, criado_em")
    .eq("tabela", "fretes")
    .eq("registro_id", id)
    .order("criado_em", { ascending: false })
    .order("id", { ascending: false });
  if (error || !data) return [];

  const nomesUsuario = await nomesDeUsuarios(
    data.map((l) => l.usuario_id).filter((u): u is string => u !== null),
  );
  const registros: RegistroAuditLog[] = data.map((l) => ({
    id: l.id,
    tabela: l.tabela,
    registro_id: l.registro_id,
    acao: l.acao,
    usuario_id: l.usuario_id,
    usuario_nome: l.usuario_id ? (nomesUsuario[l.usuario_id] ?? "Sistema") : "Sistema",
    dados_antes: l.dados_antes,
    dados_depois: l.dados_depois,
    criado_em: l.criado_em,
  }));
  const nomes = await resolverNomesAuditLog(supabase, registros);
  return eventosDoAuditLog(registros, { nomes, entidade: "Frete", genero: "m" });
}

/** Dia de chegada e se o frete está vivo (para a chegada pela foto). */
export async function lerChegadaDoFrete(id: string): Promise<{ dataChegada: string | null } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fretes")
    .select("data_chegada")
    .eq("id", id)
    .is("excluido_em", null)
    .maybeSingle();
  if (error || !data) return null;
  return { dataChegada: data.data_chegada };
}
