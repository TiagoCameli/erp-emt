"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import {
  BadgeCheck,
  Check,
  ExternalLink,
  Filter,
  Paperclip,
  Undo2,
  Wallet,
} from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  BotaoEspelho,
  CelulaDescricaoCategoria,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroMes,
  FiltroPeriodo,
  FiltroSelect,
  FiltroValor,
  GradeKpis,
  KPICard,
  MoneyText,
  StatusBadge,
  type FiltroConfiguravel,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  formatarBRL,
  formatarData,
  formatarDataHora,
  formatarMesAno,
} from "@/lib/formatadores";
import { ROTULO_TIPO_FORMA } from "@/modules/_shared/forma-pagamento";
import {
  marcarParcelaConferida,
  marcarParcelasConferidasEmLote,
} from "@/modules/financeiro/aprovacao-pagamentos/actions";
import type { PagamentoDireto } from "@/modules/financeiro/aprovacao-pagamentos/queries";
import { CONFERENCIA } from "@/modules/financeiro/aprovacao-pagamentos/rotulos";
import { rotuloOrigemLancamento } from "@/modules/financeiro/lancamentos/schemas";
import {
  dentroDaFaixaValor,
  dentroDoPeriodo,
  mesmoMesReferencia,
  opcoesDeNomes,
  usePaginacaoCliente,
} from "@/modules/_shared/filtros-cliente";
import {
  rotuloParcela,
  STATUS_PARCELA,
} from "@/modules/financeiro/_shared/formato";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";

/**
 * Explicação da aba. É o texto mais importante da tela: sem ele alguém lê
 * "não conferido" como pagamento preso esperando alguém liberar.
 */
const EXPLICACAO =
  "Dinheiro sai direto do caixa e cartão de crédito já nasce quitado: nenhum dos dois passa pela aprovação. Marcar como conferido é só o registro de que você conferiu, e pode ser feito depois de pago. Nada aqui prende, libera nem muda pagamento.";

/** Filtro pelo estado da conferência: é para isso que a aba existe. */
const OPCOES_CONFERENCIA = [
  { valor: "nao", rotulo: CONFERENCIA.naoMarcado },
  { valor: "sim", rotulo: CONFERENCIA.marcado },
];

/** Nota fiscal da OC de origem: informação de conferência, não pendência. */
const OPCOES_NOTA = [
  { valor: "sem", rotulo: "Sem nota fiscal" },
  { valor: "com", rotulo: "Com nota fiscal" },
];

export interface PagamentosDiretosProps {
  pagamentos: PagamentoDireto[];
  /**
   * Permissão de aprovar: é ela que libera carimbar a conferência. Nome
   * diferente do `podeRevisar` da fila ao lado de propósito: lá é a permissão de
   * DEVOLVER a parcela para ajuste, que é outra coisa.
   */
  podeConferir: boolean;
  /** Libera o link da linha para a tela do lançamento. */
  podeVerLancamento: boolean;
}

/** O que está sendo marcado: uma linha, ou a seleção inteira. */
type Alvo = { tipo: "linha"; pagamento: PagamentoDireto } | { tipo: "lote" };

/** Soma em centavos para não arrastar erro de float. */
function somarValores(pagamentos: PagamentoDireto[]): number {
  const centavos = pagamentos.reduce(
    (total, pagamento) => total + Math.round(pagamento.valor * 100),
    0,
  );
  return centavos / 100;
}

/** Célula do centro de custo: um nome, ou "Rateado" com a composição no tooltip. */
function CelulaCentroCusto({ pagamento }: { pagamento: PagamentoDireto }) {
  const { rateios } = pagamento;
  if (rateios.length === 0) {
    return <span className="text-muted-foreground">-</span>;
  }
  if (rateios.length === 1) return <span>{rateios[0].nome}</span>;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help underline decoration-dotted underline-offset-2">
          Rateado ({rateios.length})
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="flex flex-col gap-0.5">
          {rateios.map((rateio, indice) => (
            <span key={`${rateio.nome}-${indice}`} className="tabular-nums">
              {rateio.nome}: {formatarBRL(rateio.valor)}
            </span>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Célula do estado da conferência.
 *
 * Marcado ganha badge verde com quem e quando. Não marcado é texto cinza, sem
 * badge nenhum: badge âmbar ou vermelho aqui faria a linha parecer pendência
 * travando pagamento, e o pagamento já foi.
 */
function CelulaConferencia({ pagamento }: { pagamento: PagamentoDireto }) {
  if (!pagamento.conferidoEm) {
    return (
      <span className="text-muted-foreground">{CONFERENCIA.naoMarcado}</span>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      <StatusBadge
        status="aprovado"
        rotulo={CONFERENCIA.marcado}
        className="w-fit"
      />
      <span className="text-legenda text-muted-foreground">
        {pagamento.conferidoPorNome ?? "-"} ·{" "}
        <span className="tabular-nums">
          {formatarDataHora(pagamento.conferidoEm)}
        </span>
      </span>
    </div>
  );
}

/**
 * Pagamentos em dinheiro e cartão de crédito: os que não passam pela aprovação.
 *
 * A aba é registro de conferência, nunca portão. A parcela chega aqui já
 * seguindo o caminho dela (dinheiro direto para Pagamentos, cartão quitado no
 * nascimento) e continua igual depois de marcada. Marcar parcela já paga é o
 * caso normal, não a exceção, e desmarcar está na mesma linha para quem clicou
 * errado.
 */
export function PagamentosDiretos({
  pagamentos,
  podeConferir,
  podeVerLancamento,
}: PagamentosDiretosProps) {
  const router = useRouter();
  const [selecionados, setSelecionados] = React.useState<Set<string>>(
    new Set(),
  );
  const [emAndamento, setEmAndamento] = React.useState(false);
  const [filtroBusca, setFiltroBusca] = useFiltroSessao("filtroBusca", "");
  const [filtroConferencia, setFiltroConferencia] = useFiltroSessao("filtroConferencia", "");
  const [filtroSituacao, setFiltroSituacao] = useFiltroSessao("filtroSituacao", "");
  const [filtroForma, setFiltroForma] = useFiltroSessao("filtroForma", "");
  const [filtroCategoria, setFiltroCategoria] = useFiltroSessao("filtroCategoria", "");
  const [filtroFornecedor, setFiltroFornecedor] = useFiltroSessao("filtroFornecedor", "");
  const [filtroCentroCusto, setFiltroCentroCusto] = useFiltroSessao("filtroCentroCusto", "");
  const [filtroConta, setFiltroConta] = useFiltroSessao("filtroConta", "");
  const [filtroNota, setFiltroNota] = useFiltroSessao("filtroNota", "");
  const [filtroMes, setFiltroMes] = useFiltroSessao("filtroMes", "");
  const [filtroValorDe, setFiltroValorDe] = useFiltroSessao("filtroValorDe", "");
  const [filtroValorAte, setFiltroValorAte] = useFiltroSessao("filtroValorAte", "");
  const [filtroVencDe, setFiltroVencDe] = useFiltroSessao("filtroVencDe", "");
  const [filtroVencAte, setFiltroVencAte] = useFiltroSessao("filtroVencAte", "");
  const [filtroPagoDe, setFiltroPagoDe] = useFiltroSessao("filtroPagoDe", "");
  const [filtroPagoAte, setFiltroPagoAte] = useFiltroSessao("filtroPagoAte", "");
  const { paginacao, setPaginacao, zerarPagina } = usePaginacaoCliente();

  const filtrando =
    filtroBusca.trim() !== "" ||
    filtroConferencia !== "" ||
    filtroSituacao !== "" ||
    filtroForma !== "" ||
    filtroCategoria !== "" ||
    filtroFornecedor !== "" ||
    filtroCentroCusto !== "" ||
    filtroConta !== "" ||
    filtroNota !== "" ||
    filtroMes !== "" ||
    filtroValorDe !== "" ||
    filtroValorAte !== "" ||
    filtroVencDe !== "" ||
    filtroVencAte !== "" ||
    filtroPagoDe !== "" ||
    filtroPagoAte !== "";

  /** A lista depois dos filtros: seleção, lote e KPIs trabalham só em cima dela. */
  const visiveis = React.useMemo(() => {
    const termo = filtroBusca.trim().toLowerCase();
    return pagamentos.filter((pagamento) => {
      const conferido = pagamento.conferidoEm !== null;
      if (filtroConferencia === "sim" && !conferido) return false;
      if (filtroConferencia === "nao" && conferido) return false;
      if (filtroSituacao !== "" && pagamento.status !== filtroSituacao) {
        return false;
      }
      if (
        filtroForma !== "" &&
        (pagamento.formaPagamentoNome ?? "") !== filtroForma
      ) {
        return false;
      }
      if (
        filtroCategoria !== "" &&
        (pagamento.categoriaNome ?? "") !== filtroCategoria
      ) {
        return false;
      }
      if (
        filtroFornecedor !== "" &&
        pagamento.fornecedorNome !== filtroFornecedor
      ) {
        return false;
      }
      if (
        filtroCentroCusto !== "" &&
        !pagamento.rateios.some((rateio) => rateio.nome === filtroCentroCusto)
      ) {
        return false;
      }
      if (filtroConta !== "" && pagamento.contaBancariaId !== filtroConta) {
        return false;
      }
      if (filtroNota === "sem" && !pagamento.semNota) return false;
      if (filtroNota === "com" && pagamento.semNota) return false;
      if (!mesmoMesReferencia(pagamento.mesCompetencia, filtroMes))
        return false;
      if (!dentroDaFaixaValor(pagamento.valor, filtroValorDe, filtroValorAte)) {
        return false;
      }
      if (
        !dentroDoPeriodo(pagamento.dataVencimento, filtroVencDe, filtroVencAte)
      ) {
        return false;
      }
      if (
        !dentroDoPeriodo(pagamento.dataPagamento, filtroPagoDe, filtroPagoAte)
      ) {
        return false;
      }
      if (termo !== "") {
        const alvo = `${pagamento.lancamentoNumero ?? ""} ${pagamento.lancamentoDescricao} ${pagamento.fornecedorNome} ${pagamento.origemNumero ?? ""}`;
        if (!alvo.toLowerCase().includes(termo)) return false;
      }
      return true;
    });
  }, [
    pagamentos,
    filtroBusca,
    filtroConferencia,
    filtroSituacao,
    filtroForma,
    filtroCategoria,
    filtroFornecedor,
    filtroCentroCusto,
    filtroConta,
    filtroNota,
    filtroMes,
    filtroValorDe,
    filtroValorAte,
    filtroVencDe,
    filtroVencAte,
    filtroPagoDe,
    filtroPagoAte,
  ]);

  const total = React.useMemo(() => somarValores(visiveis), [visiveis]);
  const conferidos = React.useMemo(
    () => visiveis.filter((pagamento) => pagamento.conferidoEm !== null),
    [visiveis],
  );
  const naoConferidos = React.useMemo(
    () => visiveis.filter((pagamento) => pagamento.conferidoEm === null),
    [visiveis],
  );

  const selecionadosVisiveis = React.useMemo(
    () => visiveis.filter((pagamento) => selecionados.has(pagamento.id)),
    [visiveis, selecionados],
  );
  const totalSelecionado = React.useMemo(
    () => somarValores(selecionadosVisiveis),
    [selecionadosVisiveis],
  );

  const todosSelecionados =
    visiveis.length > 0 && selecionados.size === visiveis.length;
  const algumSelecionado = selecionados.size > 0;

  function alternarTodos() {
    setSelecionados((atual) =>
      atual.size === visiveis.length
        ? new Set()
        : new Set(visiveis.map((pagamento) => pagamento.id)),
    );
  }

  function alternarUm(id: string) {
    setSelecionados((atual) => {
      const proxima = new Set(atual);
      if (proxima.has(id)) proxima.delete(id);
      else proxima.add(id);
      return proxima;
    });
  }

  /**
   * Todo filtro passa por aqui: zera a seleção (seleção escondida pelo filtro
   * viraria marcação em lote de linha que ninguém está vendo) e volta para a
   * primeira página.
   */
  function aoTrocarFiltro(aplicar: () => void) {
    aplicar();
    setSelecionados(new Set());
    zerarPagina();
  }

  /** Marca ou desmarca, na linha ou no lote. `conferido` é sempre explícito. */
  async function alternarConferencia(alvo: Alvo, conferido: boolean) {
    if (emAndamento) return;
    setEmAndamento(true);
    try {
      if (alvo.tipo === "linha") {
        const resultado = await marcarParcelaConferida(
          alvo.pagamento.id,
          conferido,
        );
        if ("erro" in resultado) {
          toast.error(resultado.erro);
          return;
        }
        toast.success(
          conferido
            ? "Pagamento marcado como conferido"
            : "Marca de conferência retirada",
        );
      } else {
        const resultado = await marcarParcelasConferidasEmLote(
          [...selecionados],
          conferido,
        );
        if ("erro" in resultado) {
          toast.error(
            resultado.marcadas > 0
              ? `${resultado.marcadas} atualizado(s), mas parou: ${resultado.erro}`
              : resultado.erro,
          );
        } else {
          toast.success(
            conferido
              ? `${resultado.marcadas} pagamento(s) marcado(s) como conferido(s)`
              : `${resultado.marcadas} pagamento(s) sem a marca de conferência`,
          );
        }
        setSelecionados(new Set());
      }
      router.refresh();
    } finally {
      setEmAndamento(false);
    }
  }

  const colunas = React.useMemo<ColumnDef<PagamentoDireto, unknown>[]>(() => {
    const base: ColumnDef<PagamentoDireto, unknown>[] = [];

    if (podeConferir) {
      base.push({
        id: "selecao",
        enableSorting: false,
        size: 44,
        meta: { fixa: true, naoTruncar: true },
        header: () => (
          <Checkbox
            checked={todosSelecionados}
            onCheckedChange={alternarTodos}
            aria-label="Selecionar todos os pagamentos"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selecionados.has(row.original.id)}
            onCheckedChange={() => alternarUm(row.original.id)}
            aria-label={`Selecionar ${rotuloParcela(
              row.original.lancamentoNumero,
              row.original.numeroParcela,
              row.original.totalParcelas,
            )}`}
          />
        ),
      });
    }

    base.push(
      {
        accessorKey: "lancamentoNumero",
        header: "Lançamento",
        size: 260,
        meta: { rotulo: "Lançamento", fixa: true, naoTruncar: true },
        cell: ({ row }) => {
          const rotulo = rotuloParcela(
            row.original.lancamentoNumero,
            row.original.numeroParcela,
            row.original.totalParcelas,
          );
          return (
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {podeVerLancamento ? (
                <Link
                  href={`/financeiro/lancamentos/${row.original.lancamentoId}`}
                  onClick={(evento) => evento.stopPropagation()}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <span className="codigo-doc">{rotulo}</span>
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </Link>
              ) : (
                <span className="codigo-doc">{rotulo}</span>
              )}
            </div>
          );
        },
      },
      {
        id: "origem",
        header: "Origem",
        size: 140,
        enableSorting: false,
        meta: { rotulo: "Origem", ocultaPorPadrao: true, naoTruncar: true },
        cell: ({ row }) =>
          row.original.origem === "oc" && row.original.origemId ? (
            <Link
              href={`/compras/ordens/${row.original.origemId}`}
              onClick={(evento) => evento.stopPropagation()}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <span className="codigo-doc">
                {row.original.origemNumero ?? "OC"}
              </span>
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </Link>
          ) : (
            // Mesmo catálogo da fila de aprovação: aqui hoje não cai linha de
            // folha (o lançamento da folha nasce sem forma de pagamento, e esta
            // aba é só dinheiro e cartão), mas a origem 'diaria' cai, e ela
            // também não é "Manual".
            <span className="text-muted-foreground">
              {rotuloOrigemLancamento(row.original.origem)}
            </span>
          ),
      },
      {
        accessorKey: "fornecedorNome",
        header: "Fornecedor",
        size: 200,
        meta: { rotulo: "Fornecedor" },
        cell: ({ row }) => (
          <span className="font-medium">{row.original.fornecedorNome}</span>
        ),
      },
      {
        // Mesmo par da fila: quem trabalha nas duas abas lê a linha do mesmo
        // jeito, com a descrição e a categoria juntas.
        id: "descricaoCategoria",
        accessorKey: "lancamentoDescricao",
        header: "Descrição e categoria",
        size: 280,
        meta: { rotulo: "Descrição e categoria", naoTruncar: true },
        cell: ({ row }) => (
          <CelulaDescricaoCategoria
            descricao={row.original.lancamentoDescricao}
            categoriaNome={row.original.categoriaNome}
          />
        ),
      },
      {
        accessorKey: "categoriaNome",
        header: "Categoria do custo",
        size: 180,
        meta: { rotulo: "Categoria do custo", ocultaPorPadrao: true },
        cell: ({ row }) => <span>{row.original.categoriaNome ?? "-"}</span>,
      },
      {
        id: "centroCusto",
        header: "Centro de custo",
        size: 180,
        enableSorting: false,
        meta: {
          rotulo: "Centro de custo",
          ocultaPorPadrao: true,
          naoTruncar: true,
        },
        cell: ({ row }) => <CelulaCentroCusto pagamento={row.original} />,
      },
      {
        // Visível por padrão, ao contrário da fila: aqui a forma é o motivo de
        // a linha estar nesta aba.
        accessorKey: "formaPagamentoNome",
        header: "Forma de pagamento",
        size: 184,
        meta: { rotulo: "Forma de pagamento", naoTruncar: true },
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <span>{row.original.formaPagamentoNome ?? "-"}</span>
            <span className="text-legenda text-muted-foreground">
              {ROTULO_TIPO_FORMA[row.original.formaPagamentoTipo]}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "dataCompra",
        header: "Compra / NF",
        size: 130,
        meta: { rotulo: "Data da compra / NF", ocultaPorPadrao: true },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.dataCompra
              ? formatarData(row.original.dataCompra)
              : "-"}
          </span>
        ),
      },
      {
        accessorKey: "mesCompetencia",
        header: "Mês de referência",
        size: 176,
        meta: { rotulo: "Mês de referência" },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.mesCompetencia
              ? formatarMesAno(row.original.mesCompetencia)
              : "-"}
          </span>
        ),
      },
      {
        accessorKey: "dataVencimento",
        header: "Vencimento",
        size: 130,
        meta: { rotulo: "Vencimento" },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.dataVencimento
              ? formatarData(row.original.dataVencimento)
              : "-"}
          </span>
        ),
      },
      {
        accessorKey: "dataPagamento",
        header: "Pagamento",
        size: 130,
        meta: { rotulo: "Data do pagamento" },
        cell: ({ row }) =>
          row.original.dataPagamento ? (
            <span className="tabular-nums">
              {formatarData(row.original.dataPagamento)}
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        accessorKey: "contaBancariaNome",
        header: "Conta bancária",
        size: 180,
        meta: { rotulo: "Conta bancária", ocultaPorPadrao: true },
        cell: ({ row }) => <span>{row.original.contaBancariaNome ?? "-"}</span>,
      },
      {
        id: "nota",
        header: "Nota fiscal",
        size: 150,
        enableSorting: false,
        meta: {
          rotulo: "Nota fiscal",
          ocultaPorPadrao: true,
          naoTruncar: true,
        },
        // Texto e não badge: badge âmbar aqui pareceria pendência travando o
        // pagamento, e o pagamento desta aba já seguiu.
        cell: ({ row }) =>
          row.original.origem !== "oc" ? (
            <span className="text-muted-foreground">-</span>
          ) : row.original.semNota ? (
            <span className="text-muted-foreground">Sem nota fiscal</span>
          ) : (
            <span>Com nota fiscal</span>
          ),
      },
      {
        accessorKey: "anexos",
        header: "Anexos",
        size: 100,
        meta: {
          rotulo: "Anexos",
          ocultaPorPadrao: true,
          alinharDireita: true,
          naoTruncar: true,
        },
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Paperclip
              className="size-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            {row.original.anexos}
          </span>
        ),
      },
      {
        id: "situacao",
        accessorKey: "status",
        header: "Situação do pagamento",
        size: 190,
        enableSorting: false,
        meta: { rotulo: "Situação do pagamento", naoTruncar: true },
        cell: ({ row }) => {
          const info = STATUS_PARCELA[row.original.status];
          return <StatusBadge status={info.badge} rotulo={info.rotulo} />;
        },
      },
      {
        // Id novo junto com a palavra nova. Quem tinha escondido a coluna antiga
        // ("revisao") volta a ver esta: preferência de coluna com id que não
        // existe mais é ignorada, e ver a coluna é o padrão da aba.
        id: "conferencia",
        accessorKey: "conferidoEm",
        header: CONFERENCIA.coluna,
        size: 220,
        meta: { rotulo: CONFERENCIA.coluna, naoTruncar: true },
        cell: ({ row }) => <CelulaConferencia pagamento={row.original} />,
      },
      {
        accessorKey: "valor",
        header: "Valor",
        size: 140,
        meta: { rotulo: "Valor", alinharDireita: true },
        // Desconto entra na própria célula do valor e só quando existe: coluna
        // separada ficaria vazia em quase todo pagamento e mexeria no conjunto
        // de colunas salvo nas preferências da tabela.
        cell: ({ row }) => (
          <>
            <MoneyText valor={row.original.valor} />
            {row.original.desconto > 0 ? (
              <span className="block text-legenda text-muted-foreground">
                desconto{" "}
                <MoneyText valor={row.original.desconto} className="inline" />,
                líquido{" "}
                <MoneyText
                  valor={row.original.valorLiquido}
                  className="inline"
                />
              </span>
            ) : null}
          </>
        ),
      },
    );

    if (podeConferir) {
      base.push({
        id: "acoes",
        header: "Ações",
        enableSorting: false,
        size: 220,
        meta: {
          rotulo: "Ações",
          fixa: true,
          alinharDireita: true,
          naoTruncar: true,
        },
        cell: ({ row }) => (
          <div
            className="flex items-center justify-end gap-1"
            onClick={(evento) => evento.stopPropagation()}
          >
            {row.original.conferidoEm ? (
              // Desmarcar fica na própria linha, sem menu escondido: quem
              // clicou errado tem que desfazer no lugar em que errou.
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={emAndamento}
                onClick={() =>
                  alternarConferencia(
                    { tipo: "linha", pagamento: row.original },
                    false,
                  )
                }
              >
                <Undo2 />
                {CONFERENCIA.acaoDesmarcar}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={emAndamento}
                onClick={() =>
                  alternarConferencia(
                    { tipo: "linha", pagamento: row.original },
                    true,
                  )
                }
              >
                <Check />
                {CONFERENCIA.acaoMarcar}
              </Button>
            )}
          </div>
        ),
      });
    }

    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    podeConferir,
    podeVerLancamento,
    selecionados,
    todosSelecionados,
    emAndamento,
  ]);

  // As opções saem da própria lista, não do cadastro: filtro que oferece opção
  // sem nenhuma linha só devolve lista vazia.
  const opcoesForma = React.useMemo(
    () => opcoesDeNomes(pagamentos.map((p) => p.formaPagamentoNome)),
    [pagamentos],
  );
  const opcoesCategoria = React.useMemo(
    () => opcoesDeNomes(pagamentos.map((p) => p.categoriaNome)),
    [pagamentos],
  );
  const opcoesFornecedor = React.useMemo(
    () => opcoesDeNomes(pagamentos.map((p) => p.fornecedorNome)),
    [pagamentos],
  );
  const opcoesCentroCusto = React.useMemo(
    () =>
      opcoesDeNomes(
        pagamentos.flatMap((p) => p.rateios.map((rateio) => rateio.nome)),
      ),
    [pagamentos],
  );
  const opcoesConta = React.useMemo(() => {
    const porId = new Map<string, string>();
    for (const pagamento of pagamentos) {
      if (pagamento.contaBancariaId) {
        porId.set(
          pagamento.contaBancariaId,
          pagamento.contaBancariaNome ?? "Conta sem nome",
        );
      }
    }
    return [...porId]
      .map(([valor, rotulo]) => ({ valor, rotulo }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  }, [pagamentos]);

  const opcoesSituacao = React.useMemo(() => {
    const presentes = new Set(pagamentos.map((p) => p.status));
    return [...presentes]
      .map((status) => ({
        valor: status,
        rotulo: STATUS_PARCELA[status].rotulo,
      }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  }, [pagamentos]);

  const filtros: FiltroConfiguravel[] = [
    {
      id: "busca",
      rotulo: "Busca",
      fixo: true,
      // Entra no "Limpar filtros". Passa pelo aoTrocarFiltro como qualquer troca
      // de filtro desta tela: ele zera a seleção e volta para a primeira página,
      // e limpar a busca sem isso deixaria seleção de linha que saiu da vista.
      temValor: filtroBusca.trim() !== "",
      onLimpar: () => aoTrocarFiltro(() => setFiltroBusca("")),
      elemento: (
        <FiltroBusca
          valor={filtroBusca}
          onValorChange={(valor) => aoTrocarFiltro(() => setFiltroBusca(valor))}
          placeholder="Buscar por lançamento, descrição, fornecedor ou OC"
        />
      ),
    },
    {
      // Visível por padrão: separar o que já foi conferido do que não foi é o
      // trabalho da aba.
      id: "conferencia",
      rotulo: CONFERENCIA.coluna,
      temValor: filtroConferencia !== "",
      onLimpar: () => aoTrocarFiltro(() => setFiltroConferencia("")),
      elemento: (
        <FiltroSelect
          valor={filtroConferencia}
          onValorChange={(valor) =>
            aoTrocarFiltro(() => setFiltroConferencia(valor))
          }
          opcoes={OPCOES_CONFERENCIA}
          placeholder={CONFERENCIA.coluna}
          todosRotulo="Conferidos e não conferidos"
          className="max-w-56"
        />
      ),
    },
  ];
  if (opcoesSituacao.length > 1) {
    filtros.push({
      id: "situacao",
      rotulo: "Situação do pagamento",
      temValor: filtroSituacao !== "",
      onLimpar: () => aoTrocarFiltro(() => setFiltroSituacao("")),
      elemento: (
        <FiltroSelect
          valor={filtroSituacao}
          onValorChange={(valor) =>
            aoTrocarFiltro(() => setFiltroSituacao(valor))
          }
          opcoes={opcoesSituacao}
          placeholder="Situação"
          todosRotulo="Todas as situações"
          className="max-w-56"
        />
      ),
    });
  }
  if (opcoesForma.length > 1) {
    filtros.push({
      id: "forma",
      rotulo: "Forma de pagamento",
      temValor: filtroForma !== "",
      onLimpar: () => aoTrocarFiltro(() => setFiltroForma("")),
      elemento: (
        <FiltroSelect
          valor={filtroForma}
          onValorChange={(valor) => aoTrocarFiltro(() => setFiltroForma(valor))}
          opcoes={opcoesForma}
          placeholder="Forma de pagamento"
          todosRotulo="Dinheiro e cartão"
          className="max-w-56"
        />
      ),
    });
  }
  if (opcoesFornecedor.length > 1) {
    filtros.push({
      id: "fornecedor",
      rotulo: "Fornecedor",
      ocultoPorPadrao: true,
      temValor: filtroFornecedor !== "",
      onLimpar: () => aoTrocarFiltro(() => setFiltroFornecedor("")),
      elemento: (
        <FiltroSelect
          valor={filtroFornecedor}
          onValorChange={(valor) =>
            aoTrocarFiltro(() => setFiltroFornecedor(valor))
          }
          opcoes={opcoesFornecedor}
          placeholder="Fornecedor"
          todosRotulo="Todos os fornecedores"
          className="max-w-56"
        />
      ),
    });
  }
  if (opcoesCategoria.length > 1) {
    filtros.push({
      id: "categoria",
      rotulo: "Categoria do custo",
      ocultoPorPadrao: true,
      temValor: filtroCategoria !== "",
      onLimpar: () => aoTrocarFiltro(() => setFiltroCategoria("")),
      elemento: (
        <FiltroSelect
          valor={filtroCategoria}
          onValorChange={(valor) =>
            aoTrocarFiltro(() => setFiltroCategoria(valor))
          }
          opcoes={opcoesCategoria}
          placeholder="Categoria"
          todosRotulo="Todas as categorias"
          className="max-w-56"
        />
      ),
    });
  }
  if (opcoesCentroCusto.length > 1) {
    filtros.push({
      id: "centroCusto",
      rotulo: "Centro de custo",
      ocultoPorPadrao: true,
      temValor: filtroCentroCusto !== "",
      onLimpar: () => aoTrocarFiltro(() => setFiltroCentroCusto("")),
      elemento: (
        <FiltroSelect
          valor={filtroCentroCusto}
          onValorChange={(valor) =>
            aoTrocarFiltro(() => setFiltroCentroCusto(valor))
          }
          opcoes={opcoesCentroCusto}
          placeholder="Centro de custo"
          todosRotulo="Todos os centros de custo"
          className="max-w-56"
        />
      ),
    });
  }
  if (opcoesConta.length > 1) {
    filtros.push({
      id: "conta",
      rotulo: "Conta bancária",
      ocultoPorPadrao: true,
      temValor: filtroConta !== "",
      onLimpar: () => aoTrocarFiltro(() => setFiltroConta("")),
      elemento: (
        <FiltroSelect
          valor={filtroConta}
          onValorChange={(valor) => aoTrocarFiltro(() => setFiltroConta(valor))}
          opcoes={opcoesConta}
          todosRotulo="Todas as contas"
          className="max-w-56"
        />
      ),
    });
  }
  filtros.push(
    {
      id: "valor",
      rotulo: "Faixa de valor",
      ocultoPorPadrao: true,
      temValor: filtroValorDe !== "" || filtroValorAte !== "",
      onLimpar: () =>
        aoTrocarFiltro(() => {
          setFiltroValorDe("");
          setFiltroValorAte("");
        }),
      elemento: (
        <FiltroValor
          de={filtroValorDe}
          ate={filtroValorAte}
          onValorChange={(de, ate) =>
            aoTrocarFiltro(() => {
              setFiltroValorDe(de);
              setFiltroValorAte(ate);
            })
          }
        />
      ),
    },
    {
      id: "vencimento",
      rotulo: "Período de vencimento",
      ocultoPorPadrao: true,
      temValor: filtroVencDe !== "" || filtroVencAte !== "",
      onLimpar: () =>
        aoTrocarFiltro(() => {
          setFiltroVencDe("");
          setFiltroVencAte("");
        }),
      elemento: (
        <FiltroPeriodo
          de={filtroVencDe}
          ate={filtroVencAte}
          onPeriodoChange={(de, ate) =>
            aoTrocarFiltro(() => {
              setFiltroVencDe(de);
              setFiltroVencAte(ate);
            })
          }
          rotulo="Vencimento"
        />
      ),
    },
    {
      id: "pagamento",
      rotulo: "Período de pagamento",
      ocultoPorPadrao: true,
      temValor: filtroPagoDe !== "" || filtroPagoAte !== "",
      onLimpar: () =>
        aoTrocarFiltro(() => {
          setFiltroPagoDe("");
          setFiltroPagoAte("");
        }),
      elemento: (
        <FiltroPeriodo
          de={filtroPagoDe}
          ate={filtroPagoAte}
          onPeriodoChange={(de, ate) =>
            aoTrocarFiltro(() => {
              setFiltroPagoDe(de);
              setFiltroPagoAte(ate);
            })
          }
          rotulo="Pagamento"
        />
      ),
    },
    {
      id: "mes",
      rotulo: "Mês de referência",
      ocultoPorPadrao: true,
      temValor: filtroMes !== "",
      onLimpar: () => aoTrocarFiltro(() => setFiltroMes("")),
      elemento: (
        <FiltroMes
          valor={filtroMes}
          onValorChange={(valor) => aoTrocarFiltro(() => setFiltroMes(valor))}
        />
      ),
    },
    {
      id: "nota",
      rotulo: "Nota fiscal",
      ocultoPorPadrao: true,
      temValor: filtroNota !== "",
      onLimpar: () => aoTrocarFiltro(() => setFiltroNota("")),
      elemento: (
        <FiltroSelect
          valor={filtroNota}
          onValorChange={(valor) => aoTrocarFiltro(() => setFiltroNota(valor))}
          opcoes={OPCOES_NOTA}
          placeholder="Nota fiscal"
          todosRotulo="Com e sem nota"
        />
      ),
    },
  );

  const algumSelecionadoConferido = selecionadosVisiveis.some(
    (pagamento) => pagamento.conferidoEm !== null,
  );
  const algumSelecionadoNaoConferido = selecionadosVisiveis.some(
    (pagamento) => pagamento.conferidoEm === null,
  );

  return (
    // Mesmo motivo da fila: o Tooltip do projeto é o Radix cru, sem provider
    // embutido, e sem ancestral ele lança no cliente na hora em que a primeira
    // linha com tooltip monta. Com a lista vazia nada disso renderiza, então a
    // falta passaria despercebida até chegar dado real.
    <TooltipProvider>
      <div className="flex flex-col gap-4">
        <p className="rounded-md border border-border bg-surface px-3 py-2 text-detalhe text-muted-foreground">
          {EXPLICACAO}
        </p>

        <GradeKpis>
          <KPICard
            titulo="Dinheiro e cartão"
            valor={formatarBRL(total)}
            detalhe={
              filtrando
                ? `${visiveis.length} de ${pagamentos.length} pagamento(s) fora da aprovação`
                : `${pagamentos.length} pagamento(s) fora da aprovação`
            }
          />
          <KPICard
            titulo={CONFERENCIA.kpiMarcado}
            valor={formatarBRL(somarValores(conferidos))}
            detalhe={`${conferidos.length} com conferência registrada`}
          />
          <KPICard
            titulo={CONFERENCIA.kpiNaoMarcado}
            valor={formatarBRL(somarValores(naoConferidos))}
            detalhe={`${naoConferidos.length} sem registro de conferência. O pagamento não espera por ela.`}
          />
        </GradeKpis>

        {algumSelecionado ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface px-4 py-2.5">
            <p className="text-detalhe text-foreground">
              {selecionados.size} selecionado(s)
              <span className="text-muted-foreground">
                {" "}
                · {formatarBRL(totalSelecionado)}
              </span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {/* Mesma posição e mesmo motivo da fila ao lado (e de lancamentos,
                  ordens e da aba "Pagas"): imprimir é leitura, vem antes das
                  ações que carimbam.

                  Aqui o papel sai completo: dinheiro e cartão já nascem
                  quitados, então a parcela desta aba está paga e o espelho
                  imprime "Pagamento" com "Saiu da conta" e "Pago em". A guarda
                  para o caso não pago mora na página
                  (src/app/(espelho)/espelho/pagamentos/page.tsx), não aqui.

                  Ids de `selecionadosVisiveis`, não do Set cru, pelo mesmo
                  motivo da fila: id escondido pelo filtro não pode ir para o
                  maço. */}
              <BotaoEspelho
                rota="/espelho/pagamentos"
                ids={selecionadosVisiveis.map((pagamento) => pagamento.id)}
              />
              {podeConferir && algumSelecionadoConferido ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={emAndamento}
                  onClick={() => alternarConferencia({ tipo: "lote" }, false)}
                >
                  <Undo2 />
                  {CONFERENCIA.acaoDesmarcarLote}
                </Button>
              ) : null}
              {podeConferir && algumSelecionadoNaoConferido ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={emAndamento}
                  onClick={() => alternarConferencia({ tipo: "lote" }, true)}
                >
                  <BadgeCheck />
                  {CONFERENCIA.acaoMarcarLote}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        <DataTable
          columns={colunas}
          data={visiveis}
          filtros={filtros}
          pageIndex={paginacao.pageIndex}
          pageSize={paginacao.pageSize}
          onPaginationChange={setPaginacao}
          idTabela="financeiro.aprovacao-pagamentos.dinheiro-cartao"
          cabecalhoFixo
          emptyState={
            filtrando && pagamentos.length > 0 ? (
              <EmptyState
                icone={Filter}
                titulo="Nenhum pagamento com esses filtros"
                descricao="Existem pagamentos em dinheiro e cartão, mas nenhum bate com os filtros escolhidos. Limpe os filtros para ver tudo."
                className="border-none bg-transparent"
              />
            ) : (
              <EmptyState
                icone={Wallet}
                titulo="Nenhum pagamento em dinheiro ou cartão"
                descricao="Quando um lançamento for pago em dinheiro ou no cartão de crédito, ele aparece aqui para conferência. Ele não espera por esta aba para ser pago."
                className="border-none bg-transparent"
              />
            )
          }
        />
      </div>
    </TooltipProvider>
  );
}
