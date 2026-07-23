import type { Json } from "@/lib/database.types";
import { formatarBRL, formatarData, formatarDataHora } from "@/lib/formatadores";

import type { EventoTrilha, TipoEventoTrilha } from "./trilha";

/** Linha do audit_log, com nome do usuário se a query fizer o join. */
export interface RegistroAuditLog {
  id: number | string;
  tabela: string;
  registro_id: string | null;
  acao: string;
  usuario_id?: string | null;
  usuario_nome?: string | null;
  dados_antes: Json | null;
  dados_depois: Json | null;
  criado_em: string;
}

export type TabelaFk =
  | "condicoes_pagamento"
  | "fornecedores"
  | "centros_custo"
  | "insumos"
  | "usuarios";

type TipoCampo = "texto" | "dinheiro" | "data" | "datahora" | "situacao" | "booleano" | "fk";
interface MetaCampo { rotulo?: string; tipo?: TipoCampo; oculto?: boolean; fkTabela?: TabelaFk; }

const CAMPOS: Record<string, MetaCampo> = {
  status: { rotulo: "Situação", tipo: "situacao" },
  valor_total: { rotulo: "Valor total", tipo: "dinheiro" },
  valor: { rotulo: "Valor", tipo: "dinheiro" },
  valor_nf: { rotulo: "Valor da NF", tipo: "dinheiro" },
  preco_unitario: { rotulo: "Preço unitário", tipo: "dinheiro" },
  quantidade: { rotulo: "Quantidade", tipo: "texto" },
  condicao_pagamento_id: { rotulo: "Condição de pagamento", tipo: "fk", fkTabela: "condicoes_pagamento" },
  fornecedor_id: { rotulo: "Fornecedor", tipo: "fk", fkTabela: "fornecedores" },
  centro_custo_id: { rotulo: "Centro de custo", tipo: "fk", fkTabela: "centros_custo" },
  insumo_id: { rotulo: "Insumo", tipo: "fk", fkTabela: "insumos" },
  motivo_rejeicao: { rotulo: "Motivo" },
  observacoes: { rotulo: "Observações" },
  numero_nf: { rotulo: "Nota fiscal" },
  data_emissao: { rotulo: "Data de emissão", tipo: "data" },
  data_recebimento: { rotulo: "Data do recebimento", tipo: "data" },
  data_vencimento: { rotulo: "Vencimento", tipo: "data" },
  aprovado_por: { oculto: true },
  aprovado_em: { oculto: true },
  created_by: { oculto: true },
  updated_at: { oculto: true },
  created_at: { oculto: true },
};

/** Campos FK -> tabela, exportado para o resolvedor de nomes (server) reusar. */
export const CAMPOS_FK: Record<string, TabelaFk> = Object.fromEntries(
  Object.entries(CAMPOS)
    .filter(([, m]) => m.fkTabela)
    .map(([k, m]) => [k, m.fkTabela as TabelaFk]),
);

const SITUACOES: Record<string, string> = {
  rascunho: "Rascunho",
  pendente_aprovacao: "Pendente de aprovação",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
  cancelado: "Cancelado",
  recebido: "Recebido",
  recebido_parcial: "Recebido parcial",
  finalizada: "Finalizada",
  pago: "Pago",
  pendente: "Pendente",
  previsto: "Previsto",
  a_pagar: "A pagar",
  a_receber: "A receber",
};

type ObjetoJson = { [chave: string]: Json | undefined };
function ehObjetoJson(v: Json | null): v is ObjetoJson {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function rotuloCampo(campo: string): string {
  return CAMPOS[campo]?.rotulo ?? campo.replace(/_/g, " ");
}

/** Formata o valor NOVO conforme o tipo do campo. Devolve null se deve ocultar. */
function valorFormatado(
  campo: string,
  valor: Json | undefined,
  nomes: Record<string, string>,
): string | null {
  const meta = CAMPOS[campo] ?? {};
  if (meta.oculto) return null;
  if (meta.tipo === "fk") {
    if (typeof valor !== "string" || !valor) return null; // vazio de FK: ocultar
    const nome = nomes[valor];
    return nome ?? null; // sem nome resolvido: ocultar (não mostra uuid cru)
  }
  if (valor === null || valor === undefined) return "—";
  switch (meta.tipo) {
    case "dinheiro":
      return formatarBRL(Number(valor));
    case "data":
      return formatarData(String(valor));
    case "datahora":
      return formatarDataHora(String(valor));
    case "situacao":
      return SITUACOES[String(valor)] ?? String(valor);
    case "booleano":
      return valor ? "sim" : "não";
    default:
      if (typeof valor === "object") return JSON.stringify(valor);
      return String(valor);
  }
}

function participio(base: string, genero: "f" | "m"): string {
  // base no feminino terminando em "a": "criada" -> "criado"
  return genero === "m" ? base.replace(/a$/, "o") : base;
}

function tituloEvento(
  acao: string,
  antes: ObjetoJson | null,
  depois: ObjetoJson | null,
  entidade: string,
  genero: "f" | "m",
): { titulo: string; tipo: TipoEventoTrilha } {
  const A = acao.toUpperCase();
  if (A === "INSERT") return { titulo: `${entidade} ${participio("criada", genero)}`, tipo: "criacao" };
  if (A === "DELETE") return { titulo: `${entidade} ${participio("excluída", genero)}`, tipo: "exclusao" };
  const antesStatus = antes && typeof antes.status === "string" ? antes.status : undefined;
  const depoisStatus = depois && typeof depois.status === "string" ? depois.status : undefined;
  if (depoisStatus && depoisStatus !== antesStatus) {
    switch (depoisStatus) {
      case "pendente_aprovacao":
        return antesStatus === "aprovado"
          ? { titulo: "Aprovação revertida", tipo: "desaprovacao" }
          : { titulo: `${participio("Enviada", genero)} para aprovação`, tipo: "edicao" };
      case "aprovado":
        return { titulo: participio("Aprovada", genero), tipo: "aprovacao" };
      case "rejeitado":
        return { titulo: participio("Rejeitada", genero), tipo: "rejeicao" };
      case "cancelado":
        return { titulo: participio("Cancelada", genero), tipo: "rejeicao" };
      case "recebido":
        return { titulo: participio("Recebida", genero), tipo: "aprovacao" };
      case "recebido_parcial":
        return { titulo: "Recebimento parcial", tipo: "edicao" };
      case "finalizada":
        return { titulo: participio("Finalizada", genero), tipo: "aprovacao" };
      case "rascunho":
        return { titulo: "Voltou para rascunho", tipo: "edicao" };
      default:
        return { titulo: `Situação: ${SITUACOES[depoisStatus] ?? depoisStatus}`, tipo: "edicao" };
    }
  }
  return { titulo: "Dados alterados", tipo: "edicao" };
}

/** Linhas "Rótulo: valor novo" dos campos que mudaram (só valor novo, sem "→"). */
function descricaoDasMudancas(
  antes: ObjetoJson | null,
  depois: ObjetoJson | null,
  nomes: Record<string, string>,
): string | undefined {
  if (!ehObjetoJson(depois)) return undefined;
  const antesObj = ehObjetoJson(antes) ? antes : {};
  const linhas: string[] = [];
  for (const campo of Object.keys(depois)) {
    if (campo === "status") continue; // já vira título
    if (JSON.stringify(antesObj[campo] ?? null) === JSON.stringify(depois[campo] ?? null)) continue;
    const v = valorFormatado(campo, depois[campo], nomes);
    if (v === null) continue;
    linhas.push(`${rotuloCampo(campo)}: ${v}`);
  }
  return linhas.length ? linhas.slice(0, 6).join(" · ") : undefined;
}

/** Converte linhas do audit_log em eventos prontos para o componente Trilha. */
export function eventosDoAuditLog(
  registros: RegistroAuditLog[],
  opcoes?: { nomes?: Record<string, string>; entidade?: string; genero?: "f" | "m" },
): EventoTrilha[] {
  const nomes = opcoes?.nomes ?? {};
  const entidade = opcoes?.entidade ?? "Registro";
  const genero = opcoes?.genero ?? "m";
  return registros.map((r) => {
    const antes = ehObjetoJson(r.dados_antes) ? r.dados_antes : null;
    const depois = ehObjetoJson(r.dados_depois) ? r.dados_depois : null;
    const { titulo, tipo } = tituloEvento(r.acao, antes, depois, entidade, genero);
    const acaoNormalizada = r.acao.toUpperCase();
    // Em INSERT/DELETE a descrição por campo polui; mantemos só no UPDATE.
    const descricao =
      acaoNormalizada === "UPDATE" ? descricaoDasMudancas(antes, depois, nomes) : undefined;
    return {
      id: String(r.id),
      data: r.criado_em,
      titulo,
      descricao,
      usuario: r.usuario_nome ?? undefined,
      tipo,
    };
  });
}
