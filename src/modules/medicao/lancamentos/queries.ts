import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import { facetasNoServidor, type FacetasPresentes } from "@/modules/_shared/filtros-facetados";

import type { FiltrosLancamentos, LancamentoLista, ServicoParaLancar } from "./tipos";

/** Um contrato do usuário com medição aberta, para a tela de lançar pelo celular (Task 6). */
export interface ContratoParaLancarCampo {
  id: string;
  codigo: string;
  nomeObra: string;
  tipoLocalizacao: "rodovia" | "texto";
}

/** Padrão ilike do termo, sem os caracteres que quebram o `or()` do PostgREST (mesmo padrão de
 * `padraoBuscaOs` em manutencao/servicos/filtros.ts). */
function padraoBusca(termo: string): string {
  return `%${termo.replace(/[,()"'\\%*]/g, "").trim()}%`;
}

/**
 * Quantos anexos (fotos e arquivos) cada lançamento tem, para o clipe da lista (`SeloAnexos`,
 * mesmo padrão de Combustível). Não existe RPC de agregação para isto: conta as linhas de
 * `anexo_vinculos` em memória, com `todasAsLinhas` (o teto de 1.000 do PostgREST vale aqui também
 * — um contrato com muitos lançamentos e fotos passa disso fácil).
 */
async function contarAnexos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  idsLancamentos: string[],
): Promise<Map<string, number>> {
  if (idsLancamentos.length === 0) return new Map();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("anexo_vinculos")
      .select("entidade_id")
      .eq("entidade_tipo", "mc_lancamento")
      .in("entidade_id", idsLancamentos)
      .range(de, ate),
  );
  if (erro) throw new Error(erro);
  const contagem = new Map<string, number>();
  for (const v of linhas) {
    if (!v.entidade_id) continue;
    contagem.set(v.entidade_id, (contagem.get(v.entidade_id) ?? 0) + 1);
  }
  return contagem;
}

/** O pedaço do builder do PostgREST que os filtros dos lançamentos usam. */
interface ConsultaFiltravelLancamentos<T> {
  eq: (coluna: string, valor: string | number) => T;
  is: (coluna: string, valor: null) => T;
  gte: (coluna: string, valor: string) => T;
  lte: (coluna: string, valor: string) => T;
  or: (filtro: string) => T;
}

/**
 * Aplica os filtros da lista (contrato, não excluídos, medição, período, item, busca). Serve a
 * lista e as facetas (`facetasLancamentos`), que precisam do MESMO recorte. Síncrona: o builder é
 * "thenable" (ver `aplicarFiltrosPagas` em financeiro/pagamentos/filtros-pagas.ts).
 */
export function aplicarFiltrosLancamentos<T extends ConsultaFiltravelLancamentos<T>>(
  consultaInicial: T,
  filtros: FiltrosLancamentos,
): T {
  let consulta = consultaInicial.eq("contrato_id", filtros.contratoId).is("excluido_em", null);
  if (filtros.medicao !== undefined) consulta = consulta.eq("medicao_numero", filtros.medicao);
  if (filtros.de) consulta = consulta.gte("data", filtros.de);
  if (filtros.ate) consulta = consulta.lte("data", filtros.ate);
  if (filtros.itemId) consulta = consulta.eq("item_id", filtros.itemId);
  if (filtros.busca) {
    const padrao = padraoBusca(filtros.busca);
    if (padrao !== "%%") {
      consulta = consulta.or(
        `codigo.ilike.${padrao},descricao.ilike.${padrao},estaca.ilike.${padrao},local_texto.ilike.${padrao},observacao.ilike.${padrao}`,
      );
    }
  }
  return consulta;
}

/**
 * Lista de lançamentos do contrato, não excluídos, de `mc_v_lancamentos` (a RLS das tabelas de
 * origem vale, `security_invoker`). `todasAsLinhas` por causa do teto de 1.000 linhas do
 * PostgREST: um contrato de obra longa passa disso fácil. Quantidade e km chegam como TEXTO do
 * numeric (`::text` no select, D7): a tela só EXIBE com `numeroExibicao`, nunca soma ou arredonda.
 */
export async function listarLancamentos(filtros: FiltrosLancamentos): Promise<LancamentoLista[]> {
  const supabase = await createClient();

  const { linhas, erro } = await todasAsLinhas((de, ate) => {
    const consulta = supabase
      .from("mc_v_lancamentos")
      .select(
        `id, contrato_id, medicao_id, medicao_numero, medicao_status, item_id, codigo, descricao, unidade, data,
        quantidade:quantidade::text, km_inicial:km_inicial::text, km_final:km_final::text, estaca, local_texto,
        observacao, motivo_excesso, created_at, created_by`,
      );
    return aplicarFiltrosLancamentos(consulta, filtros).order("data", { ascending: false }).order("id").range(de, ate);
  });
  if (erro) throw new Error(erro);

  const contagemAnexos = await contarAnexos(
    supabase,
    linhas.map((l) => l.id).filter((id): id is string => id !== null),
  );

  return linhas.map((l) => ({
    id: l.id ?? "",
    contratoId: l.contrato_id ?? "",
    medicaoId: l.medicao_id ?? "",
    medicaoNumero: l.medicao_numero ?? 0,
    medicaoStatus: l.medicao_status ?? "",
    itemId: l.item_id ?? "",
    codigo: l.codigo,
    descricao: l.descricao,
    unidade: l.unidade,
    data: l.data ?? "",
    quantidade: l.quantidade ?? "0",
    kmInicial: l.km_inicial,
    kmFinal: l.km_final,
    estaca: l.estaca,
    localTexto: l.local_texto,
    observacao: l.observacao,
    motivoExcesso: l.motivo_excesso,
    createdAt: l.created_at ?? "",
    createdBy: l.created_by,
    anexos: contagemAnexos.get(l.id ?? "") ?? 0,
  }));
}

/** Os filtros de seleção da lista: medição (pelo número, como na URL) e item. */
export type FacetaLancamentos = "medicao" | "item";

/**
 * O que existe na lista filtrada, por filtro de seleção (ver `_shared/filtros-facetados`): as
 * medições oferecidas são as que têm lançamento no período, item e busca escolhidos, e os itens,
 * os lançados na medição e no período. Traz só as duas colunas das chaves; um contrato longo tem
 * alguns milhares de lançamentos, o que é leve.
 */
export async function facetasLancamentos(filtros: FiltrosLancamentos): Promise<FacetasPresentes<FacetaLancamentos>> {
  const supabase = await createClient();
  type Linha = { medicao_numero: number | null; item_id: string | null };
  return facetasNoServidor<Linha, FacetaLancamentos>(
    {
      medicao: {
        ativo: filtros.medicao !== undefined,
        chave: (l) => (l.medicao_numero === null ? null : String(l.medicao_numero)),
      },
      item: { ativo: !!filtros.itemId, chave: (l) => l.item_id },
    },
    async (exceto) => {
      const recorte: FiltrosLancamentos = {
        ...filtros,
        ...(exceto === "medicao" ? { medicao: undefined } : {}),
        ...(exceto === "item" ? { itemId: undefined } : {}),
      };
      const { linhas, erro } = await todasAsLinhas<Linha>((de, ate) =>
        aplicarFiltrosLancamentos(supabase.from("mc_v_lancamentos").select("medicao_numero, item_id"), recorte)
          .order("id")
          .range(de, ate),
      );
      if (erro) throw new Error(erro);
      return linhas;
    },
  );
}

/**
 * Serviços lançáveis: as linhas `tipo = 'servico'` de `mc_v_planilha_linhas`, uma por MEDIÇÃO
 * ABERTA do contrato (não por versão). O formulário e o colar do Excel resolvem o item pela data
 * (que escolhe a medição, pelo período) e pelo código — só entre os serviços DAQUELA medição.
 *
 * Duas medições abertas podem apontar para a MESMA versão da planilha (spec 7.3: abrir a 11ª não
 * espera a 10ª fechar, e não entra aditivo entre as duas): agrupar por `versao_id` e escolher uma
 * medição por versão perderia a outra, e a data dela deixaria de achar serviço nenhum. Por isso
 * cada linha da versão vira UM `ServicoParaLancar` por medição aberta que a usa, mesmo repetindo
 * código e descrição.
 */
export async function servicosParaLancar(contratoId: string): Promise<ServicoParaLancar[]> {
  const supabase = await createClient();

  const { data: medicoes, error } = await supabase
    .from("mc_medicoes")
    .select("id, numero, periodo_inicio, periodo_fim, versao_id")
    .eq("contrato_id", contratoId)
    .eq("status", "aberta")
    .order("numero");
  if (error) throw error;
  if (!medicoes || medicoes.length === 0) return [];

  const medicoesPorVersao = new Map<string, typeof medicoes>();
  for (const medicao of medicoes) {
    const lista = medicoesPorVersao.get(medicao.versao_id) ?? [];
    lista.push(medicao);
    medicoesPorVersao.set(medicao.versao_id, lista);
  }
  const versaoIds = [...medicoesPorVersao.keys()];

  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("mc_v_planilha_linhas")
      .select("versao_id, item_id, codigo, descricao, unidade, ordem, quantidade_prevista:quantidade_prevista::text")
      .eq("tipo", "servico")
      .in("versao_id", versaoIds)
      .order("ordem")
      .range(de, ate),
  );
  if (erro) throw new Error(erro);

  const servicos: ServicoParaLancar[] = [];
  for (const l of linhas) {
    if (!l.versao_id || !l.item_id) continue;
    for (const medicao of medicoesPorVersao.get(l.versao_id) ?? []) {
      servicos.push({
        medicaoId: medicao.id,
        medicaoNumero: medicao.numero,
        periodoInicio: medicao.periodo_inicio,
        periodoFim: medicao.periodo_fim,
        itemId: l.item_id,
        codigo: l.codigo ?? "",
        descricao: l.descricao ?? "",
        unidade: l.unidade,
        quantidadePrevista: l.quantidade_prevista,
        ordem: l.ordem ?? 0,
      });
    }
  }
  return servicos;
}

/**
 * Contratos com pelo menos uma medição aberta, para a tela do celular (Task 6) perguntar o
 * contrato só quando o usuário tem mais de um: a RLS de `mc_medicoes` e `mc_contratos` já limita
 * à lista de acesso (D3), sem filtro de usuário aqui. Uma linha por medição aberta, então o mesmo
 * contrato pode repetir na consulta (duas medições abertas ao mesmo tempo, spec 7.3): o mapa por
 * id devolve cada contrato uma vez só.
 */
export async function contratosParaLancarCampo(): Promise<ContratoParaLancarCampo[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("mc_medicoes")
    .select("contrato:mc_contratos!inner(id, codigo, nome_obra, tipo_localizacao, excluido_em)")
    .eq("status", "aberta");
  if (error) throw error;

  const vistos = new Map<string, ContratoParaLancarCampo>();
  for (const linha of data ?? []) {
    const contrato = linha.contrato;
    if (!contrato || contrato.excluido_em) continue;
    if (!vistos.has(contrato.id)) {
      vistos.set(contrato.id, {
        id: contrato.id,
        codigo: contrato.codigo,
        nomeObra: contrato.nome_obra,
        tipoLocalizacao: contrato.tipo_localizacao === "rodovia" ? "rodovia" : "texto",
      });
    }
  }
  return [...vistos.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
}
