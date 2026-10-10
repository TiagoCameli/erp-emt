"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarRange } from "lucide-react";

import { ConfirmDialog, DataTable, EmptyState, GradeEdicao, type AtalhoGrade, type ColunaGrade, type MudancaCelula } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { formatarData, formatarQuantidade } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { ROTULO_TIPO_ATIVIDADE, TIPOS_ATIVIDADE } from "@/modules/execucao/_shared/rotulos";
import { excluirAtividades, recalcular, renumerarEap, salvarLinhas, type ResultadoGrade } from "@/modules/execucao/cronogramas/actions";
import { BarraCronograma, type AcaoBarra } from "@/modules/execucao/cronogramas/components/barra-cronograma";
import { formatarPredecessoras } from "@/modules/execucao/cronogramas/dependencias-texto";
import {
  linhasNovasDoBloco,
  montarLote,
  mudancasParaLote,
  type AtividadeGrade,
  type ContextoEdicao,
  type LinhaLote,
} from "@/modules/execucao/cronogramas/edicao";
import { avancar, moverAbaixo, moverAcima, ordenarArvore, proximaLinha, recuar, type Mudanca } from "@/modules/execucao/cronogramas/hierarquia";

type Linha = AtividadeGrade & { nivel: number };

/** Número do banco ("1234.5") no texto de edição pt-BR ("1234,5"): "1.234" não pode voltar ambíguo. */
const paraEdicao = (n: string | null) => (n === null ? "" : n.replace(".", ","));
const ehAtividade = (l: AtividadeGrade) => l.tipo === "atividade";

const OPCOES_TIPO = TIPOS_ATIVIDADE.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_ATIVIDADE[t] }));
const OPCOES_MODO = [
  { valor: "por_produtividade", rotulo: "Produtividade" },
  { valor: "digitada", rotulo: "Digitada" },
];

function colunasDaGrade(servicos: ContextoEdicao["servicos"], unidades: ContextoEdicao["unidades"]): ColunaGrade<Linha>[] {
  const opcoesServico = [{ valor: "", rotulo: "Sem serviço" }, ...servicos.map((s) => ({ valor: s.codigo, rotulo: s.codigo }))];
  const opcoesUnidade = [{ valor: "", rotulo: "Sem unidade" }, ...unidades.map((u) => ({ valor: u.sigla, rotulo: u.sigla }))];
  return [
    { id: "codigo", titulo: "Código", largura: 80, mono: true, exibir: (l) => l.codigo, editar: { texto: (l) => l.codigo } },
    {
      id: "nome",
      titulo: "Nome",
      largura: 220,
      recuo: (l) => l.nivel,
      exibir: (l) => <span className={cn("truncate", l.tipo === "resumo" && "font-semibold")}>{l.nome}</span>,
      editar: { texto: (l) => l.nome },
      copiar: (l) => l.nome,
    },
    { id: "tipo", titulo: "Tipo", largura: 100, exibir: (l) => ROTULO_TIPO_ATIVIDADE[l.tipo], editar: { texto: (l) => l.tipo, opcoes: OPCOES_TIPO } },
    {
      id: "servico",
      titulo: "Serviço",
      largura: 110,
      mono: true,
      exibir: (l) => l.servicoCodigo ?? "",
      editar: { texto: (l) => l.servicoCodigo ?? "", opcoes: opcoesServico, podeEditar: ehAtividade },
      copiar: (l) => l.servicoCodigo ?? "",
    },
    {
      id: "quantidade",
      titulo: "Qtd",
      largura: 90,
      direita: true,
      exibir: (l) => (l.quantidade === null ? "" : formatarQuantidade(l.quantidade)),
      editar: { texto: (l) => paraEdicao(l.quantidade), podeEditar: ehAtividade },
    },
    {
      id: "unidade",
      titulo: "Un",
      largura: 60,
      exibir: (l) => l.unidadeSigla ?? "",
      editar: { texto: (l) => l.unidadeSigla ?? "", opcoes: opcoesUnidade, podeEditar: ehAtividade },
      copiar: (l) => l.unidadeSigla ?? "",
    },
    {
      id: "produtividade",
      titulo: "Produtividade",
      largura: 100,
      direita: true,
      exibir: (l) => (l.produtividade === null ? "" : formatarQuantidade(l.produtividade)),
      editar: { texto: (l) => paraEdicao(l.produtividade), podeEditar: ehAtividade },
    },
    {
      id: "modo",
      titulo: "Modo",
      largura: 110,
      exibir: (l) => (ehAtividade(l) ? (l.modoDuracao === "por_produtividade" ? "Produtividade" : "Digitada") : ""),
      editar: { texto: (l) => l.modoDuracao, opcoes: OPCOES_MODO, podeEditar: ehAtividade },
    },
    {
      id: "duracao",
      titulo: "Duração",
      largura: 80,
      direita: true,
      exibir: (l) => l.duracaoDias,
      // Na por_produtividade a duração é do banco; resumo e marco também.
      editar: { texto: (l) => String(l.duracaoDias), podeEditar: (l) => ehAtividade(l) && l.modoDuracao === "digitada" },
    },
    { id: "inicio", titulo: "Início", largura: 90, exibir: (l) => formatarData(l.inicioCedo) },
    { id: "termino", titulo: "Término", largura: 90, exibir: (l) => formatarData(l.fimCedo) },
    { id: "folga", titulo: "Folga", largura: 60, direita: true, exibir: (l) => l.folgaTotal ?? "" },
    {
      id: "critica",
      titulo: "Crítica",
      largura: 50,
      exibir: (l) => (l.critica ? <span aria-label="No caminho crítico" role="img" className="mx-auto size-2 rounded-full bg-status-rejeitado" /> : null),
      copiar: (l) => (l.critica ? "Sim" : ""),
    },
    {
      id: "predecessoras",
      titulo: "Predecessoras",
      largura: 140,
      mono: true,
      exibir: (l) => formatarPredecessoras(l.predecessoras),
      editar: { texto: (l) => formatarPredecessoras(l.predecessoras) },
    },
    {
      id: "locais",
      titulo: "Locais",
      largura: 120,
      exibir: (l) => l.locais.map((x) => x.codigo).join("; "),
      editar: { texto: (l) => l.locais.map((x) => x.codigo).join("; ") },
    },
    { id: "observacao", titulo: "Observação", largura: 200, exibir: (l) => l.observacao ?? "", editar: { texto: (l) => l.observacao ?? "" } },
  ];
}

/** Árvore na ordem de exibição, com o nível de cada linha para o recuo. */
function emOrdem(atividades: readonly AtividadeGrade[]): Linha[] {
  const porId = new Map(atividades.map((a) => [a.id, a]));
  const nivel = (a: AtividadeGrade): number => {
    let n = 0;
    let pai = a.paiId ? porId.get(a.paiId) : undefined;
    while (pai && n < 50) {
      n += 1;
      pai = pai.paiId ? porId.get(pai.paiId) : undefined;
    }
    return n;
  };
  return ordenarArvore(atividades).flatMap((l) => {
    const a = porId.get(l.id);
    return a ? [{ ...a, nivel: nivel(a) }] : [];
  });
}

export interface GradeCronogramaProps {
  cronogramaId: string;
  atividades: AtividadeGrade[];
  servicos: ContextoEdicao["servicos"];
  unidades: ContextoEdicao["unidades"];
  locais: ContextoEdicao["locais"];
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
}

/**
 * Grade do cronograma. Só interpreta o que se digita (edicao.ts) e manda o lote: o banco valida,
 * grava tudo ou nada e recalcula as datas, e a grade troca tudo pelo que volta relido.
 */
export function GradeCronograma({ cronogramaId, atividades: iniciais, servicos, unidades, locais, podeCriar, podeEditar, podeExcluir }: GradeCronogramaProps) {
  const [atividades, setAtividades] = React.useState(iniciais);
  // A página relê as atividades depois de salvar o calendário ou os dados do cronograma.
  const [origem, setOrigem] = React.useState(iniciais);
  if (origem !== iniciais) {
    setOrigem(iniciais);
    setAtividades(iniciais);
  }
  const [selecionadas, setSelecionadas] = React.useState<Set<string>>(() => new Set());
  const [salvando, iniciar] = React.useTransition();
  const [excluindo, setExcluindo] = React.useState<string[] | null>(null);

  // Toda escrita da grade entra numa fila, uma de cada vez, e cada uma monta o lote na hora em que
  // sai, a partir da última resposta do banco (`atuais`), não do que estava na tela quando se digitou.
  // O lote confere a versão de cada linha: duas edições seguidas na mesma linha, com a segunda montada
  // antes de a primeira voltar, iriam com a versão velha e o banco recusaria a segunda.
  const atuais = React.useRef(atividades);
  const fila = React.useRef<Promise<unknown>>(Promise.resolve());
  React.useEffect(() => {
    atuais.current = iniciais;
  }, [iniciais]);

  const linhas = React.useMemo(() => emOrdem(atividades), [atividades]);
  const porId = React.useMemo(() => new Map(atividades.map((a) => [a.id, a])), [atividades]);
  const colunas = React.useMemo(() => colunasDaGrade(servicos, unidades), [servicos, unidades]);
  const somenteLeitura = !podeEditar && !podeCriar;

  /** Estado mais recente vindo do banco, para montar o lote dentro da fila. */
  function estadoAtual() {
    const lista = atuais.current;
    const ordem = emOrdem(lista);
    const ctx: ContextoEdicao = { servicos, unidades, locais, codigoDaLinha: (n: number) => ordem[n - 1]?.codigo };
    return { lista, linhas: ordem, porId: new Map(lista.map((a) => [a.id, a])), ctx };
  }

  function naFila<T>(passo: () => Promise<T>): Promise<T> {
    const resultado = fila.current.then(passo);
    fila.current = resultado.catch(() => undefined);
    return resultado;
  }

  /** Chama o banco e já guarda a resposta em `atuais`, antes de o próximo passo da fila montar o seu lote. */
  async function chamar(acao: () => Promise<ResultadoGrade>): Promise<ResultadoGrade> {
    const resposta = await acao();
    if (!("erro" in resposta)) atuais.current = resposta.atividades;
    return resposta;
  }

  function aplicar(resposta: ResultadoGrade): boolean {
    if ("erro" in resposta) {
      toast.error(resposta.erro);
      return false;
    }
    atuais.current = resposta.atividades;
    setAtividades(resposta.atividades);
    const ids = new Set(resposta.atividades.map((a) => a.id));
    setSelecionadas((atual) => new Set([...atual].filter((id) => ids.has(id))));
    return true;
  }

  /** `acao` roda dentro da fila; devolve null quando não há o que mandar (lote vazio ou texto que não se interpreta). */
  function executar(acao: () => Promise<ResultadoGrade> | null) {
    iniciar(async () => {
      const resposta = await naFila(async () => {
        const chamada = acao();
        return chamada ? chamar(() => chamada) : null;
      });
      if (!resposta) return;
      iniciar(() => {
        aplicar(resposta);
      });
    });
  }

  /** Monta o lote dentro da fila; `null` do montador = nada a mandar. */
  function enviar(montar: (estado: ReturnType<typeof estadoAtual>) => LinhaLote[] | null) {
    executar(() => {
      const lote = montar(estadoAtual());
      return lote && lote.length > 0 ? salvarLinhas(cronogramaId, lote) : null;
    });
  }

  function aoEditar(mudancas: MudancaCelula[]) {
    enviar(({ porId: atual, ctx }) => {
      const r = montarLote(mudancas, atual, ctx);
      if (!r.ok) {
        toast.error(r.erro);
        return null;
      }
      return r.linhas;
    });
  }

  function aoColarAlem(bloco: string[][], idColunaInicial: string) {
    if (!podeCriar) {
      toast.error("Sem permissão para criar atividade");
      return;
    }
    enviar(({ lista, ctx }) => {
      const r = linhasNovasDoBloco(bloco, idColunaInicial, lista, ctx);
      if (!r.ok) {
        toast.error(r.erro);
        return null;
      }
      return r.linhas;
    });
  }

  const mover = (operacao: (linhas: Linha[], id: string) => Mudanca[], id: string) =>
    enviar((atual) => mudancasParaLote(operacao(atual.linhas, id), atual.porId));

  function novaLinha(idReferencia: string | null) {
    enviar((atual) => {
      const p = proximaLinha(atual.linhas, idReferencia);
      return [{ codigo: p.codigo, pai_codigo: p.pai_codigo, ordem: p.ordem, nome: "Nova atividade" }, ...mudancasParaLote(p.mudancas, atual.porId)];
    });
  }

  // A linha das ações da barra: a única marcada.
  const marcada = selecionadas.size === 1 ? [...selecionadas][0] : null;

  function acaoEm(acao: AcaoBarra | AtalhoGrade, id: string | null) {
    switch (acao) {
      case "inserir": if (podeCriar) novaLinha(id); return;
      case "recuar": if (podeEditar && id) mover(recuar, id); return;
      case "avancar": if (podeEditar && id) mover(avancar, id); return;
      case "acima": if (podeEditar && id) mover(moverAcima, id); return;
      case "abaixo": if (podeEditar && id) mover(moverAbaixo, id); return;
      case "excluir": {
        if (!podeExcluir) return;
        const ids = id && !selecionadas.has(id) ? [id] : [...selecionadas];
        if (ids.length) setExcluindo(ids);
        return;
      }
      case "renumerar": if (podeEditar) executar(() => renumerarEap(cronogramaId)); return;
      case "recalcular": if (podeEditar) executar(() => recalcular(cronogramaId)); return;
    }
  }

  const visiveis = new Set<AcaoBarra>([
    ...(podeCriar ? (["inserir"] as const) : []),
    ...(podeEditar ? (["recuar", "avancar", "acima", "abaixo", "renumerar", "recalcular"] as const) : []),
    ...(podeExcluir ? (["excluir"] as const) : []),
  ]);
  const habilitadas = new Set<AcaoBarra>(
    [...visiveis].filter((a) => {
      if (a === "excluir") return selecionadas.size > 0;
      if (a === "recuar" || a === "avancar" || a === "acima" || a === "abaixo") return marcada !== null;
      return true;
    }),
  );

  const codigosExcluindo = (excluindo ?? []).map((id) => porId.get(id)?.codigo).filter(Boolean).join(", ");

  return (
    <div className="flex flex-col gap-3">
      {somenteLeitura ? null : (
        <BarraCronograma
          visiveis={visiveis}
          habilitadas={habilitadas}
          salvando={salvando}
          onAcao={(acao) => acaoEm(acao, acao === "excluir" ? null : marcada)}
        />
      )}
      {linhas.length === 0 ? (
        <p className="text-detalhe text-muted-foreground">
          {podeCriar
            ? "Nenhuma atividade ainda. Crie a primeira pela barra ou clique na grade e cole um bloco do Excel."
            : "Este cronograma ainda não tem atividades."}
        </p>
      ) : null}
      <GradeEdicao<Linha>
        rotulo="Atividades do cronograma"
        linhas={linhas}
        colunas={colunas}
        idDaLinha={(l) => l.id}
        onEditar={aoEditar}
        onColarAlem={aoColarAlem}
        onAtalho={(atalho, idLinha) => acaoEm(atalho, idLinha)}
        selecionadas={selecionadas}
        onSelecionadasChange={setSelecionadas}
        somenteLeitura={somenteLeitura}
      />
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setExcluindo(null);
        }}
        titulo={excluindo && excluindo.length > 1 ? `Excluir ${excluindo.length} linhas` : "Excluir linha"}
        descricao={`Linhas ${codigosExcluindo} vão para a lixeira com o motivo. As linhas de dentro de um resumo e os vínculos delas vão junto.`}
        textoConfirmar="Excluir"
        variante="destrutivo"
        exigeMotivo
        minMotivo={3}
        onConfirmar={async (motivo) => {
          if (!excluindo) return;
          const ids = excluindo;
          const ok = aplicar(await naFila(() => chamar(() => excluirAtividades(cronogramaId, ids, motivo ?? ""))));
          if (!ok) return false;
          setExcluindo(null);
        }}
      />
    </div>
  );
}

const colunasCelular: ColumnDef<Linha, unknown>[] = [
  { accessorKey: "codigo", header: "Código", size: 90, meta: { celular: "destaque" }, cell: ({ row }) => <span className="font-mono">{row.original.codigo}</span> },
  { accessorKey: "nome", header: "Nome", size: 220, meta: { celular: "titulo" } },
  { id: "inicio", header: "Início", size: 100, cell: ({ row }) => formatarData(row.original.inicioCedo) },
  { id: "termino", header: "Término", size: 100, cell: ({ row }) => formatarData(row.original.fimCedo) },
];

/** Lista só de leitura para o celular: a grade é feita para computador. */
export function AtividadesCelular({ atividades }: { atividades: AtividadeGrade[] }) {
  const linhas = React.useMemo(() => emOrdem(atividades), [atividades]);
  return (
    <DataTable<Linha>
      columns={colunasCelular}
      data={linhas}
      idDaLinha={(l) => l.id}
      emptyState={<EmptyState icone={CalendarRange} titulo="Nenhuma atividade ainda" className="border-none bg-transparent" />}
    />
  );
}
