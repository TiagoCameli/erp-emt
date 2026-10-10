import type { MudancaCelula } from "@/components/canonicos";
import { lerNumeroColado } from "@/modules/execucao/_shared/numero";
import { ROTULO_TIPO_ATIVIDADE, TIPOS_ATIVIDADE, type TipoAtividade } from "@/modules/execucao/_shared/rotulos";
import { lerPredecessoras, type Predecessora } from "@/modules/execucao/cronogramas/dependencias-texto";
import { proximaLinha, type Mudanca } from "@/modules/execucao/cronogramas/hierarquia";

/**
 * Da célula editada na grade para a linha do lote (fn_ex_atividades_salvar_lote). Só interpreta texto;
 * duração, datas e validação de cronograma são do banco.
 */

export type AtividadeGrade = {
  id: string;
  codigo: string;
  nome: string;
  tipo: TipoAtividade;
  paiId: string | null;
  paiCodigo: string | null;
  ordem: number;
  servicoId: string | null;
  servicoCodigo: string | null;
  quantidade: string | null;
  unidadeId: string | null;
  unidadeSigla: string | null;
  produtividade: string | null;
  modoDuracao: "por_produtividade" | "digitada";
  duracaoDias: number;
  inicioCedo: string | null;
  fimCedo: string | null;
  folgaTotal: number | null;
  critica: boolean | null;
  predecessoras: Predecessora[];
  locais: { id: string; codigo: string; nome: string }[];
  observacao: string | null;
  /** updated_at exatamente como veio de ex_v_atividades. Nunca passa por Date: o banco compara em microssegundos. */
  versao: string;
};
export type LinhaLote = { id?: string; versao?: string } & Record<string, unknown>;
export interface ContextoEdicao {
  servicos: readonly { id: string; codigo: string }[];
  unidades: readonly { id: string; sigla: string }[];
  locais: readonly { id: string; codigo: string }[];
  codigoDaLinha: (numero: number) => string | undefined;
}

export const COLUNAS_EDITAVEIS = ["codigo", "nome", "tipo", "servico", "quantidade", "unidade", "produtividade", "modo",
  "duracao", "predecessoras", "locais", "observacao"] as const;

const igual = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "accent" }) === 0;

type Campos = { ok: true; campos: Record<string, unknown> } | { ok: false; erro: string };

export function camposDaCelula(idColuna: string, texto: string, ctx: ContextoEdicao): Campos {
  const t = texto.trim();
  switch (idColuna) {
    case "codigo":
      return t ? { ok: true, campos: { codigo: t } } : { ok: false, erro: "Informe o código" };
    case "nome":
      return t ? { ok: true, campos: { nome: t } } : { ok: false, erro: "Informe o nome" };
    case "tipo": {
      const tipo = TIPOS_ATIVIDADE.find((v) => igual(v, t) || igual(ROTULO_TIPO_ATIVIDADE[v], t));
      return tipo ? { ok: true, campos: { tipo } } : { ok: false, erro: "Tipo deve ser Resumo, Atividade ou Marco" };
    }
    case "servico": {
      if (!t) return { ok: true, campos: { servico_id: null } };
      const s = ctx.servicos.find((x) => igual(x.codigo, t));
      return s ? { ok: true, campos: { servico_id: s.id } } : { ok: false, erro: `Serviço ${t} não está na biblioteca` };
    }
    case "unidade": {
      if (!t) return { ok: true, campos: { unidade_id: null } };
      const u = ctx.unidades.find((x) => igual(x.sigla, t));
      return u ? { ok: true, campos: { unidade_id: u.id } } : { ok: false, erro: `Unidade ${t} não existe no cadastro` };
    }
    case "quantidade":
    case "produtividade": {
      const lido = lerNumeroColado(t);
      if (!lido.ok) return lido;
      if (lido.valor !== null && Number(lido.valor) < 0) return { ok: false, erro: "Não pode ser negativo" };
      return { ok: true, campos: { [idColuna]: lido.valor } };
    }
    case "modo":
      if (igual(t, "Produtividade") || igual(t, "por_produtividade")) return { ok: true, campos: { modo_duracao: "por_produtividade" } };
      if (igual(t, "Digitada")) return { ok: true, campos: { modo_duracao: "digitada" } };
      return { ok: false, erro: "Modo deve ser Produtividade ou Digitada" };
    case "duracao": {
      if (!/^\d+$/.test(t)) return { ok: false, erro: "Duração em dias inteiros" };
      return { ok: true, campos: { duracao_dias: Number(t), modo_duracao: "digitada" } };
    }
    case "predecessoras": {
      const lido = lerPredecessoras(t, ctx.codigoDaLinha);
      return lido.ok ? { ok: true, campos: { predecessoras: lido.valor } } : lido;
    }
    case "locais": {
      const ids: string[] = [];
      for (const codigo of t.split(";").map((c) => c.trim()).filter(Boolean)) {
        const l = ctx.locais.find((x) => igual(x.codigo, codigo));
        if (!l) return { ok: false, erro: `Local ${codigo} não existe nesta obra` };
        ids.push(l.id);
      }
      return { ok: true, campos: { locais: ids } };
    }
    case "observacao":
      return { ok: true, campos: { observacao: t || null } };
    default:
      return { ok: false, erro: "Esta coluna não se edita" };
  }
}

export function montarLote(mudancas: readonly MudancaCelula[], porId: ReadonlyMap<string, AtividadeGrade>, ctx: ContextoEdicao):
  { ok: true; linhas: LinhaLote[] } | { ok: false; erro: string } {
  const linhas = new Map<string, LinhaLote>();
  for (const m of mudancas) {
    const atividade = porId.get(m.idLinha);
    if (!atividade) return { ok: false, erro: "Linha não encontrada. Recarregue a grade" };
    const r = camposDaCelula(m.idColuna, m.texto, ctx);
    if (!r.ok) return { ok: false, erro: `Linha ${atividade.codigo}: ${r.erro}` };
    const linha = linhas.get(m.idLinha) ?? { id: atividade.id, versao: atividade.versao };
    linhas.set(m.idLinha, { ...linha, ...r.campos });
  }
  return { ok: true, linhas: [...linhas.values()] };
}

export function linhasNovasDoBloco(bloco: readonly string[][], idColunaInicial: string, existentes: readonly AtividadeGrade[], ctx: ContextoEdicao):
  { ok: true; linhas: LinhaLote[] } | { ok: false; erro: string } {
  const inicio = COLUNAS_EDITAVEIS.indexOf(idColunaInicial as (typeof COLUNAS_EDITAVEIS)[number]);
  if (inicio < 0) return { ok: false, erro: "Cole a partir de uma coluna editável" };
  const arvore = existentes.map((e) => ({ id: e.id, codigo: e.codigo, paiId: e.paiId, tipo: e.tipo, ordem: e.ordem }));
  const linhas: LinhaLote[] = [];
  for (const valores of bloco) {
    let campos: Record<string, unknown> = {};
    for (const [j, texto] of valores.entries()) {
      const coluna = COLUNAS_EDITAVEIS[inicio + j];
      if (!coluna || texto.trim() === "") continue;
      const r = camposDaCelula(coluna, texto, ctx);
      if (!r.ok) return { ok: false, erro: `Linha colada ${linhas.length + 1}: ${r.erro}` };
      campos = { ...campos, ...r.campos };
    }
    const proxima = proximaLinha(arvore, null);
    const codigo = typeof campos.codigo === "string" ? campos.codigo : proxima.codigo;
    linhas.push({ codigo, pai_codigo: "", ordem: proxima.ordem, ...campos });
    arvore.push({ id: `novo-${linhas.length}`, codigo, paiId: null, tipo: "atividade", ordem: proxima.ordem });
  }
  return { ok: true, linhas };
}

export function mudancasParaLote(mudancas: readonly Mudanca[], porId: ReadonlyMap<string, AtividadeGrade>): LinhaLote[] {
  return mudancas.map(({ id, ...resto }) => ({ id, versao: porId.get(id)?.versao, ...resto }));
}
