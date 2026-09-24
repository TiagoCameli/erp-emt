import "server-only";

import { eventosDoAuditLog, type EventoTrilha, type RegistroAuditLog } from "@/components/canonicos";
import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import { resolverNomesAuditLog } from "@/lib/trilha-nomes";
import { paraNumeroDoBanco } from "@/modules/manutencao/servicos/formato";
import { PAGO_POR_EMPRESA } from "@/modules/frete/pagamentos/regras";
import { nomesUsuariosFrete } from "@/modules/frete/_shared/usuarios";

/**
 * Leituras da aba Pagamentos de frete (`frete.pagamentos`). A tabela tem poucas centenas
 * de linhas por ano: vem inteira (`todasAsLinhas`, sem o teto de 1000 que a origem tinha)
 * e a tela filtra em memória, como a origem.
 */

export interface Opcao {
  id: string;
  nome: string;
}

export function nomeFornecedor(f: { razao_social: string; nome_fantasia: string | null } | null): string {
  if (!f) return "";
  return f.nome_fantasia?.trim() || f.razao_social;
}

export interface Transportadora {
  id: string;
  nome: string;
  ativo: boolean;
  /** Fantasia e razão social, para casar a planilha. */
  nomes: string[];
}

/**
 * Fornecedores marcados como transportadora ou dono de tanque (o `fn_frete_exigir_transportadora`
 * aceita os dois). Ativos e inativos: o filtro precisa do nome dos antigos; o formulário
 * oferece só os ativos.
 */
export async function listarTransportadoras(): Promise<Transportadora[]> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("fornecedores")
      .select("id, razao_social, nome_fantasia, ativo")
      .or("eh_transportadora.eq.true,eh_dona_de_tanque.eq.true")
      .order("razao_social")
      .order("id")
      .range(de, ate),
  );
  if (erro) throw new Error("Não foi possível carregar as transportadoras");
  return linhas
    .map((f) => ({
      id: f.id,
      nome: nomeFornecedor(f),
      ativo: f.ativo,
      nomes: [f.nome_fantasia ?? "", f.razao_social].filter((n) => n.trim() !== ""),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export interface OpcaoPagoPor {
  nome: string;
  tipo: "Empresa" | "Fornecedor" | "Funcionário";
}

/**
 * Opções do "Pago por" da origem: "EMT Construtora" + fornecedores ativos + funcionários
 * ativos. Os colaboradores passam pela RLS do cadastro (`cadastros.colaboradores/ver`):
 * quem não vê o cadastro de colaboradores não recebe os nomes deles.
 */
export async function listarOpcoesPagoPor(): Promise<OpcaoPagoPor[]> {
  const supabase = await createClient();
  const [fornecedores, colaboradores] = await Promise.all([
    todasAsLinhas((de, ate) =>
      supabase
        .from("fornecedores")
        .select("id, razao_social, nome_fantasia")
        .eq("ativo", true)
        .order("razao_social")
        .order("id")
        .range(de, ate),
    ),
    todasAsLinhas((de, ate) =>
      supabase.from("colaboradores").select("id, nome").eq("ativo", true).order("nome").order("id").range(de, ate),
    ),
  ]);
  if (fornecedores.erro) throw new Error("Não foi possível carregar os fornecedores");
  // Sem permissão de ver colaboradores a RLS devolve vazio; erro de verdade também só tira
  // os funcionários da lista, sem derrubar a tela.
  const opcoes: OpcaoPagoPor[] = [{ nome: PAGO_POR_EMPRESA, tipo: "Empresa" }];
  for (const f of fornecedores.linhas) opcoes.push({ nome: nomeFornecedor(f), tipo: "Fornecedor" });
  if (!colaboradores.erro) for (const c of colaboradores.linhas) opcoes.push({ nome: c.nome, tipo: "Funcionário" });
  return opcoes;
}

export interface PagamentoLinha {
  id: string;
  data: string;
  transportadoraId: string;
  transportadoraNome: string;
  /** "AAAA-MM-01". */
  mesReferencia: string;
  valor: number;
  metodo: string;
  quantidadeCombustivel: number;
  responsavel: string;
  notaFiscal: string | null;
  pagoPor: string;
  observacoes: string | null;
  origem: string;
  criadoEm: string;
  atualizadoEm: string;
  excluidoEm: string | null;
  motivoExclusao: string | null;
}

/** Os lançados, ou (com `excluidos`) só os da lixeira. Ordem data desc, desempate por id. */
export async function listarPagamentos(excluidos = false): Promise<PagamentoLinha[]> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("frete_pagamentos")
      .select(
        "id, data, transportadora_id, mes_referencia, valor, metodo, quantidade_combustivel, responsavel, nota_fiscal, pago_por, observacoes, origem, created_at, updated_at, excluido_em, motivo_exclusao, fornecedores(razao_social, nome_fantasia)",
      )
      .filter("excluido_em", excluidos ? "not.is" : "is", null)
      .order("data", { ascending: false })
      .order("id")
      .range(de, ate),
  );
  if (erro) throw new Error("Não foi possível carregar os pagamentos de frete");
  return linhas.map((l) => ({
    id: l.id,
    data: l.data,
    transportadoraId: l.transportadora_id,
    transportadoraNome: nomeFornecedor(l.fornecedores),
    mesReferencia: l.mes_referencia,
    valor: paraNumeroDoBanco(l.valor),
    metodo: l.metodo,
    quantidadeCombustivel: paraNumeroDoBanco(l.quantidade_combustivel),
    responsavel: l.responsavel,
    notaFiscal: l.nota_fiscal,
    pagoPor: l.pago_por,
    observacoes: l.observacoes,
    origem: l.origem,
    criadoEm: l.created_at,
    atualizadoEm: l.updated_at,
    excluidoEm: l.excluido_em,
    motivoExclusao: l.motivo_exclusao,
  }));
}

/**
 * Trilha de um registro do Frete pelo audit_log. A RLS do audit_log só abre para quem vê a
 * Auditoria; para o resto a trilha volta vazia (é o mesmo em todas as trilhas do ERP).
 */
export async function trilhaDoRegistro(
  tabela: "frete_pagamentos" | "pedidos_material",
  id: string,
  entidade: string,
  genero: "f" | "m",
): Promise<EventoTrilha[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, tabela, registro_id, acao, usuario_id, dados_antes, dados_depois, criado_em")
    .eq("tabela", tabela)
    .eq("registro_id", id)
    .order("criado_em", { ascending: false })
    .order("id", { ascending: false });
  if (error || !data) return [];

  const nomesPorId = await nomesUsuariosFrete(
    supabase,
    data.map((l) => l.usuario_id),
  );

  const registros: RegistroAuditLog[] = data.map((l) => ({
    id: l.id,
    tabela: l.tabela,
    registro_id: l.registro_id,
    acao: l.acao,
    usuario_id: l.usuario_id,
    usuario_nome: l.usuario_id === null ? "Sistema" : (nomesPorId.get(l.usuario_id) ?? "Sistema"),
    dados_antes: l.dados_antes,
    dados_depois: l.dados_depois,
    criado_em: l.criado_em,
  }));
  const nomes = await resolverNomesAuditLog(supabase, registros);
  return eventosDoAuditLog(registros, { nomes, entidade, genero });
}
