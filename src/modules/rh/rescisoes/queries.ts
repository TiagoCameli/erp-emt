import "server-only";

import {
  eventosDoAuditLog,
  type EventoTrilha,
  type RegistroAuditLog,
} from "@/components/canonicos";
import { createClient } from "@/lib/supabase/server";
import { resolverNomesAuditLog } from "@/lib/trilha-nomes";
import type {
  AvisoRescisao,
  StatusRescisao,
  TipoRescisao,
} from "@/modules/rh/rescisoes/formato";

/** Linha da listagem de rescisões. */
export interface RescisaoLista {
  id: string;
  numero: string;
  colaboradorNome: string;
  tipo: TipoRescisao;
  aviso: AvisoRescisao;
  dataDesligamento: string;
  status: StatusRescisao;
  valorProventos: number;
  valorDescontos: number;
  valorLiquido: number;
  /** Null enquanto a rescisão não foi aprovada — a conta a pagar só nasce ali. */
  lancamentoId: string | null;
}

/** Uma verba do documento. */
export interface ItemRescisao {
  id: string;
  /** Null nas linhas acrescentadas à mão; é o que as distingue das calculadas. */
  codigo: string | null;
  descricao: string;
  natureza: "provento" | "desconto";
  referencia: string | null;
  valor: number;
  editadoManualmente: boolean;
  ordem: number;
}

export interface RescisaoDetalhe extends RescisaoLista {
  colaboradorId: string;
  colaboradorCpf: string | null;
  colaboradorFuncao: string | null;
  colaboradorAdmissao: string | null;
  colaboradorVinculo: string;
  dataAviso: string | null;
  dataVencimento: string | null;
  remuneracaoBase: number;
  saldoFgts: number;
  feriasVencidasPeriodos: number;
  observacao: string | null;
  motivoRejeicao: string | null;
  centroCustoNome: string | null;
  aprovadoEm: string | null;
  aprovadoPorNome: string | null;
  itens: ItemRescisao[];
  /**
   * Quantos períodos aquisitivos completos a pessoa tem, menos as férias
   * registradas como gozadas. É PISTA para a tela, não o valor da conta:
   * `rh_ferias` está vazia, então para quem trabalha há anos este número é
   * alto e provavelmente falso. Quem informa é o Tiago.
   */
  periodosVencidosSugeridos: number | null;
  /**
   * Saldo de adiantamento ainda em aberto desta pessoa. A rescisão NÃO desconta
   * sozinha: a folha da competência ainda vai rodar e descontar o que couber, e
   * um segundo caminho de desconto pagaria o mesmo dinheiro duas vezes. A tela
   * mostra o número para quem estiver conferindo decidir.
   */
  adiantamentoEmAberto: number;
}

const SELECT_LISTA = `
  id, numero, tipo, aviso, data_desligamento, status,
  valor_proventos, valor_descontos, valor_liquido, lancamento_id,
  colaboradores!rh_rescisoes_colaborador_id_fkey(nome)
`;

interface LinhaLista {
  id: string;
  numero: string;
  tipo: string;
  aviso: string;
  data_desligamento: string;
  status: string;
  valor_proventos: number;
  valor_descontos: number;
  valor_liquido: number;
  lancamento_id: string | null;
  colaboradores: { nome: string } | null;
}

function paraLista(linha: LinhaLista): RescisaoLista {
  return {
    id: linha.id,
    numero: linha.numero,
    colaboradorNome: linha.colaboradores?.nome ?? "(colaborador removido)",
    tipo: linha.tipo as TipoRescisao,
    aviso: linha.aviso as AvisoRescisao,
    dataDesligamento: linha.data_desligamento,
    status: linha.status as StatusRescisao,
    valorProventos: Number(linha.valor_proventos),
    valorDescontos: Number(linha.valor_descontos),
    valorLiquido: Number(linha.valor_liquido),
    lancamentoId: linha.lancamento_id,
  };
}

export async function listarRescisoes(): Promise<RescisaoLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("rh_rescisoes")
    .select(SELECT_LISTA)
    .is("excluido_em", null)
    .order("data_desligamento", { ascending: false })
    // Desempate estável: sem ele duas rescisões do mesmo dia podem trocar de
    // lugar entre uma leitura e outra, e a tabela "pula" ao recarregar.
    .order("numero", { ascending: false });

  if (error || !data) return [];
  return (data as unknown as LinhaLista[]).map(paraLista);
}

export async function buscarRescisao(
  id: string,
): Promise<RescisaoDetalhe | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("rh_rescisoes")
    .select(
      `
      id, numero, tipo, aviso, data_aviso, data_desligamento, data_vencimento,
      status, remuneracao_base, saldo_fgts, ferias_vencidas_periodos,
      observacao, motivo_rejeicao, aprovado_em, lancamento_id,
      valor_proventos, valor_descontos, valor_liquido, colaborador_id,
      colaboradores!rh_rescisoes_colaborador_id_fkey(
        nome, cpf, data_admissao, vinculo, funcoes(nome)
      ),
      centros_custo(nome),
      aprovador:usuarios!rh_rescisoes_aprovado_por_fkey(nome)
    `,
    )
    .eq("id", id)
    .is("excluido_em", null)
    .maybeSingle();

  if (error || !data) return null;

  const linha = data as unknown as {
    id: string;
    numero: string;
    tipo: string;
    aviso: string;
    data_aviso: string | null;
    data_desligamento: string;
    data_vencimento: string | null;
    status: string;
    remuneracao_base: number;
    saldo_fgts: number;
    ferias_vencidas_periodos: number;
    observacao: string | null;
    motivo_rejeicao: string | null;
    aprovado_em: string | null;
    lancamento_id: string | null;
    valor_proventos: number;
    valor_descontos: number;
    valor_liquido: number;
    colaborador_id: string;
    colaboradores: {
      nome: string;
      cpf: string | null;
      data_admissao: string | null;
      vinculo: string;
      funcoes: { nome: string } | null;
    } | null;
    centros_custo: { nome: string } | null;
    aprovador: { nome: string } | null;
  };

  // As três leituras que sobram não dependem uma da outra: em paralelo, para a
  // tela não somar três idas ao banco em sequência.
  const [itensResp, sugestaoResp, adiantamentoResp] = await Promise.all([
    supabase
      .from("rh_rescisao_itens")
      .select(
        "id, codigo, descricao, natureza, referencia, valor, editado_manualmente, ordem",
      )
      .eq("rescisao_id", id)
      .order("ordem", { ascending: true })
      // `ordem` empata entre linhas livres criadas no mesmo clique.
      .order("id", { ascending: true }),
    supabase.rpc("fn_rescisao_periodos_vencidos", {
      p_colaborador: linha.colaborador_id,
      p_data_fim: linha.data_desligamento,
    }),
    supabase
      .from("rh_adiantamento_parcelas")
      .select("valor_previsto, rh_adiantamentos!inner(colaborador_id)")
      .is("folha_id", null)
      .eq("rh_adiantamentos.colaborador_id", linha.colaborador_id),
  ]);

  const itens: ItemRescisao[] = (itensResp.data ?? []).map((item) => ({
    id: item.id,
    codigo: item.codigo,
    descricao: item.descricao,
    natureza: item.natureza as "provento" | "desconto",
    referencia: item.referencia,
    valor: Number(item.valor),
    editadoManualmente: item.editado_manualmente,
    ordem: item.ordem,
  }));

  const adiantamentoEmAberto = (adiantamentoResp.data ?? []).reduce(
    (soma, parcela) => soma + Number(parcela.valor_previsto),
    0,
  );

  return {
    id: linha.id,
    numero: linha.numero,
    colaboradorId: linha.colaborador_id,
    colaboradorNome: linha.colaboradores?.nome ?? "(colaborador removido)",
    colaboradorCpf: linha.colaboradores?.cpf ?? null,
    colaboradorFuncao: linha.colaboradores?.funcoes?.nome ?? null,
    colaboradorAdmissao: linha.colaboradores?.data_admissao ?? null,
    colaboradorVinculo: linha.colaboradores?.vinculo ?? "clt",
    tipo: linha.tipo as TipoRescisao,
    aviso: linha.aviso as AvisoRescisao,
    dataAviso: linha.data_aviso,
    dataDesligamento: linha.data_desligamento,
    dataVencimento: linha.data_vencimento,
    status: linha.status as StatusRescisao,
    remuneracaoBase: Number(linha.remuneracao_base),
    saldoFgts: Number(linha.saldo_fgts),
    feriasVencidasPeriodos: linha.ferias_vencidas_periodos,
    observacao: linha.observacao,
    motivoRejeicao: linha.motivo_rejeicao,
    centroCustoNome: linha.centros_custo?.nome ?? null,
    aprovadoEm: linha.aprovado_em,
    aprovadoPorNome: linha.aprovador?.nome ?? null,
    valorProventos: Number(linha.valor_proventos),
    valorDescontos: Number(linha.valor_descontos),
    valorLiquido: Number(linha.valor_liquido),
    lancamentoId: linha.lancamento_id,
    itens,
    periodosVencidosSugeridos:
      sugestaoResp.data === null || sugestaoResp.data === undefined
        ? null
        : Number(sugestaoResp.data),
    adiantamentoEmAberto,
  };
}

/** Colaborador que ainda pode receber uma rescisão, para o formulário. */
export interface ColaboradorParaRescisao {
  id: string;
  nome: string;
  salario: number | null;
  dataAdmissao: string | null;
}

/**
 * Só CLT ativo e sem rescisão viva. Os três filtros são o mesmo que a
 * `fn_gerar_rescisao` aplica; oferecer no combo alguém que a RPC vai recusar é
 * fazer a pessoa preencher a tela para levar um erro no fim.
 */
export async function listarColaboradoresParaRescisao(): Promise<
  ColaboradorParaRescisao[]
> {
  const supabase = await createClient();

  const [colaboradoresResp, comRescisaoResp] = await Promise.all([
    supabase
      .from("colaboradores")
      .select("id, nome, salario, data_admissao")
      .eq("ativo", true)
      .eq("vinculo", "clt")
      .order("nome"),
    supabase.from("rh_rescisoes").select("colaborador_id").is("excluido_em", null),
  ]);

  const jaTem = new Set(
    (comRescisaoResp.data ?? []).map((linha) => linha.colaborador_id),
  );

  return (colaboradoresResp.data ?? [])
    .filter((colaborador) => !jaTem.has(colaborador.id))
    .map((colaborador) => ({
      id: colaborador.id,
      nome: colaborador.nome,
      salario: colaborador.salario === null ? null : Number(colaborador.salario),
      dataAdmissao: colaborador.data_admissao,
    }));
}

export async function trilhaDaRescisao(id: string): Promise<EventoTrilha[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("audit_log")
    .select(
      "id, tabela, registro_id, acao, usuario_id, dados_antes, dados_depois, criado_em",
    )
    .eq("tabela", "rh_rescisoes")
    .eq("registro_id", id)
    .order("criado_em", { ascending: false })
    .order("id", { ascending: false });

  if (error || !data) return [];

  const idsUsuarios = [
    ...new Set(
      data
        .map((linha) => linha.usuario_id)
        .filter((usuarioId): usuarioId is string => usuarioId !== null),
    ),
  ];

  const nomesPorId = new Map<string, string>();
  if (idsUsuarios.length > 0) {
    const { data: usuarios } = await supabase.rpc("nomes_usuarios_auditoria", {
      p_ids: idsUsuarios,
    });
    for (const usuario of usuarios ?? []) {
      nomesPorId.set(usuario.id, usuario.nome);
    }
  }

  const registros: RegistroAuditLog[] = data.map((linha) => ({
    id: linha.id,
    tabela: linha.tabela,
    registro_id: linha.registro_id,
    acao: linha.acao,
    usuario_id: linha.usuario_id,
    usuario_nome:
      linha.usuario_id === null
        ? "Sistema"
        : (nomesPorId.get(linha.usuario_id) ?? "Sistema"),
    dados_antes: linha.dados_antes,
    dados_depois: linha.dados_depois,
    criado_em: linha.criado_em,
  }));

  const nomes = await resolverNomesAuditLog(supabase, registros);
  return eventosDoAuditLog(registros, {
    nomes,
    entidade: "Rescisão",
    genero: "f",
  });
}
