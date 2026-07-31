"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Check,
  CheckCheck,
  ExternalLink,
  Filter,
  Inbox,
  Paperclip,
  PenLine,
} from "lucide-react";
import { toast } from "sonner";

import {
  CelulaDescricaoCategoria,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroMes,
  FiltroPeriodo,
  FiltroSelect,
  FiltroValor,
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
import { formatarBRL, formatarData, formatarMesAno } from "@/lib/formatadores";
import {
  aprovarParcela,
  aprovarParcelasEmLote,
  revisarParcela,
  revisarParcelasEmLote,
} from "@/modules/financeiro/aprovacao-pagamentos/actions";
import type {
  ParcelaPendente,
  ParcelasIncompletas,
  ResumoFora,
} from "@/modules/financeiro/aprovacao-pagamentos/queries";
import type { ContaBancariaOpcao } from "@/modules/financeiro/pagamentos/queries";
import {
  dentroDaFaixaValor,
  dentroDoPeriodo,
  mesmoMesReferencia,
  opcoesDeNomes,
  usePaginacaoCliente,
} from "@/modules/financeiro/_shared/filtros-cliente";
import { rotuloParcela } from "@/modules/financeiro/_shared/formato";
import { AprovarDialog } from "./aprovar-dialog";
import { PainelConferencia } from "./painel-conferencia";

/** Aviso de nota fiscal da OC de origem: não bloqueia aprovar, só informa. */
const OPCOES_NOTA = [
  { valor: "sem", rotulo: "Sem nota fiscal" },
  { valor: "com", rotulo: "Com nota fiscal" },
];

/** Origem do lançamento: veio de uma ordem de compra ou foi lançado à mão. */
const OPCOES_ORIGEM = [
  { valor: "oc", rotulo: "Ordem de compra" },
  { valor: "manual", rotulo: "Manual" },
];

export interface FilaAprovacaoProps {
  parcelas: ParcelaPendente[];
  /** O que está fora da fila por lançamento incompleto (estado vazio honesto). */
  incompletas: ParcelasIncompletas;
  /** Parcelas devolvidas para ajuste: saíram da fila, seguem na previsão. */
  emRevisao: ResumoFora;
  /** Aprovadas cuja data autorizada ainda não chegou. */
  aguardandoData: ResumoFora;
  /** Fora da fila só porque ninguém escolheu a conta bancária ainda. */
  aguardandoConta: ResumoFora;
  /** Contas ativas, para trocar a conta na hora de aprovar. */
  contas: ContaBancariaOpcao[];
  podeAprovar: boolean;
  /** Permissão de desaprovar: é ela que libera mandar para revisão. */
  podeRevisar: boolean;
  /** Libera o atalho do painel para a tela do lançamento. */
  podeEditarLancamento: boolean;
  /** Para a personalização de colunas não vazar entre pessoas no navegador. */
  idUsuario: string;
}

/** O que está sendo aprovado ou revisado: uma linha, ou a seleção inteira. */
type Alvo = { tipo: "linha"; parcela: ParcelaPendente } | { tipo: "lote" };

/**
 * Descrição do estado vazio. "Nada aqui" sozinho manda o usuário procurar um
 * botão de "enviar para aprovação" que não existe: o que segura parcela fora da
 * fila é lançamento incompleto, e é isso que a tela diz.
 */
function descricaoVazia(incompletas: ParcelasIncompletas): string {
  if (incompletas.parcelas === 0) {
    return "Parcelas de dinheiro e cartão de crédito não passam por aqui: elas vão direto para Pagamentos.";
  }
  const plural = incompletas.parcelas > 1;
  return `${incompletas.parcelas} parcela${plural ? "s" : ""} de ${formatarBRL(
    incompletas.valor,
  )} está${plural ? "o" : ""} em ${
    incompletas.lancamentos > 1
      ? `${incompletas.lancamentos} lançamentos incompletos`
      : "um lançamento incompleto"
  }: as parcelas precisam somar o valor do lançamento para entrar na fila.`;
}

/** Soma o valor das parcelas, em centavos para não arrastar erro de float. */
function somarValores(parcelas: ParcelaPendente[]): number {
  const centavos = parcelas.reduce(
    (total, parcela) => total + Math.round(parcela.valor * 100),
    0,
  );
  return centavos / 100;
}

/** Célula do centro de custo: um nome, ou "Rateado" com a composição no tooltip. */
function CelulaCentroCusto({ parcela }: { parcela: ParcelaPendente }) {
  const { rateios } = parcela;
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
 * Fila de aprovação de pagamentos: parcelas a pagar aguardando aval.
 *
 * Aprovar abre o modal da data: aprovar é autorizar o pagamento para um dia, e
 * sem escolha a data cai no vencimento da parcela. Revisar devolve a parcela
 * para quem lançou, com motivo obrigatório, sem cancelar nada: o lançamento
 * continua vivo e continua contando na previsão de caixa.
 *
 * Clicar na linha (fora dos botões) abre o painel de conferência somente
 * leitura, com o lançamento inteiro e navegação entre os itens da fila.
 *
 * A tabela traz mais colunas do que mostra: o padrão visível é enxuto e o
 * usuário liga o resto no menu "Colunas", com largura e ordem guardadas no
 * navegador.
 */
export function FilaAprovacao({
  parcelas,
  incompletas,
  emRevisao,
  aguardandoData,
  aguardandoConta,
  contas,
  podeAprovar,
  podeRevisar,
  podeEditarLancamento,
  idUsuario,
}: FilaAprovacaoProps) {
  const router = useRouter();
  const [selecionadas, setSelecionadas] = React.useState<Set<string>>(
    new Set(),
  );
  const [alvoAprovacao, setAlvoAprovacao] = React.useState<Alvo | null>(null);
  const [alvoRevisao, setAlvoRevisao] = React.useState<Alvo | null>(null);
  const [emConferencia, setEmConferencia] =
    React.useState<ParcelaPendente | null>(null);
  const [filtroBusca, setFiltroBusca] = React.useState("");
  const [filtroConta, setFiltroConta] = React.useState("");
  const [filtroCategoria, setFiltroCategoria] = React.useState("");
  const [filtroFornecedor, setFiltroFornecedor] = React.useState("");
  const [filtroCentroCusto, setFiltroCentroCusto] = React.useState("");
  const [filtroForma, setFiltroForma] = React.useState("");
  const [filtroOrigem, setFiltroOrigem] = React.useState("");
  const [filtroNota, setFiltroNota] = React.useState("");
  const [filtroMes, setFiltroMes] = React.useState("");
  const [filtroValorDe, setFiltroValorDe] = React.useState("");
  const [filtroValorAte, setFiltroValorAte] = React.useState("");
  const [filtroVencDe, setFiltroVencDe] = React.useState("");
  const [filtroVencAte, setFiltroVencAte] = React.useState("");
  const { paginacao, setPaginacao, zerarPagina } = usePaginacaoCliente();

  const filtrando =
    filtroBusca.trim() !== "" ||
    filtroConta !== "" ||
    filtroCategoria !== "" ||
    filtroFornecedor !== "" ||
    filtroCentroCusto !== "" ||
    filtroForma !== "" ||
    filtroOrigem !== "" ||
    filtroNota !== "" ||
    filtroMes !== "" ||
    filtroValorDe !== "" ||
    filtroValorAte !== "" ||
    filtroVencDe !== "" ||
    filtroVencAte !== "";

  /**
   * A fila depois dos filtros. Tudo o que é seleção, lote, KPI e navegação do
   * painel trabalha em cima desta lista: aprovar em lote não pode alcançar linha
   * que a pessoa não está vendo.
   */
  const visiveis = React.useMemo(() => {
    const termo = filtroBusca.trim().toLowerCase();
    return parcelas.filter((parcela) => {
      if (filtroConta !== "" && parcela.contaBancariaId !== filtroConta) {
        return false;
      }
      if (
        filtroCategoria !== "" &&
        (parcela.categoriaNome ?? "") !== filtroCategoria
      ) {
        return false;
      }
      if (
        filtroFornecedor !== "" &&
        parcela.fornecedorNome !== filtroFornecedor
      ) {
        return false;
      }
      if (
        filtroCentroCusto !== "" &&
        !parcela.rateios.some((rateio) => rateio.nome === filtroCentroCusto)
      ) {
        return false;
      }
      if (
        filtroForma !== "" &&
        (parcela.formaPagamentoNome ?? "") !== filtroForma
      ) {
        return false;
      }
      if (filtroOrigem === "oc" && parcela.origem !== "oc") return false;
      if (filtroOrigem === "manual" && parcela.origem === "oc") return false;
      if (filtroNota === "sem" && !parcela.semNota) return false;
      if (filtroNota === "com" && parcela.semNota) return false;
      if (!mesmoMesReferencia(parcela.mesCompetencia, filtroMes)) return false;
      if (!dentroDaFaixaValor(parcela.valor, filtroValorDe, filtroValorAte)) {
        return false;
      }
      if (
        !dentroDoPeriodo(parcela.dataVencimento, filtroVencDe, filtroVencAte)
      ) {
        return false;
      }
      if (termo !== "") {
        const alvo = `${parcela.lancamentoNumero ?? ""} ${parcela.lancamentoDescricao} ${parcela.fornecedorNome} ${parcela.origemNumero ?? ""}`;
        if (!alvo.toLowerCase().includes(termo)) return false;
      }
      return true;
    });
  }, [
    parcelas,
    filtroBusca,
    filtroConta,
    filtroCategoria,
    filtroFornecedor,
    filtroCentroCusto,
    filtroForma,
    filtroOrigem,
    filtroNota,
    filtroMes,
    filtroValorDe,
    filtroValorAte,
    filtroVencDe,
    filtroVencAte,
  ]);

  const totalAprovar = React.useMemo(() => somarValores(visiveis), [visiveis]);

  const selecionadasNaFila = React.useMemo(
    () => visiveis.filter((parcela) => selecionadas.has(parcela.id)),
    [visiveis, selecionadas],
  );
  const totalSelecionado = React.useMemo(
    () => somarValores(selecionadasNaFila),
    [selecionadasNaFila],
  );

  const todasSelecionadas =
    visiveis.length > 0 && selecionadas.size === visiveis.length;
  const algumaSelecionada = selecionadas.size > 0;

  // Índice da parcela em conferência, para as setas do painel andarem na fila.
  const indiceConferencia = emConferencia
    ? visiveis.findIndex((parcela) => parcela.id === emConferencia.id)
    : -1;

  function alternarTodas() {
    setSelecionadas((atual) =>
      atual.size === visiveis.length
        ? new Set()
        : new Set(visiveis.map((parcela) => parcela.id)),
    );
  }

  /**
   * Todo filtro passa por aqui. Duas coisas obrigatórias:
   *
   * 1. Zera a seleção. Seleção sobrevivente escondida pelo filtro viraria
   *    aprovação em lote de dinheiro que ninguém conferiu.
   * 2. Volta para a primeira página, senão a pessoa filtra e cai numa página
   *    vazia, concluindo que não existe pagamento com aquele critério.
   */
  function aoTrocarFiltro(aplicar: () => void) {
    aplicar();
    setSelecionadas(new Set());
    zerarPagina();
  }

  function trocarFiltroConta(valor: string) {
    aoTrocarFiltro(() => setFiltroConta(valor));
  }

  function trocarFiltroCategoria(valor: string) {
    aoTrocarFiltro(() => setFiltroCategoria(valor));
  }

  function alternarUma(id: string) {
    setSelecionadas((atual) => {
      const proxima = new Set(atual);
      if (proxima.has(id)) proxima.delete(id);
      else proxima.add(id);
      return proxima;
    });
  }

  function tirarDaSelecao(id: string) {
    setSelecionadas((atual) => {
      const proxima = new Set(atual);
      proxima.delete(id);
      return proxima;
    });
  }

  async function confirmarAprovacao(
    dataProgramada: string | null,
    contaId: string | null,
  ) {
    if (!alvoAprovacao) return;

    if (alvoAprovacao.tipo === "linha") {
      const parcela = alvoAprovacao.parcela;
      const resultado = await aprovarParcela(
        parcela.id,
        dataProgramada,
        contaId,
      );
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      toast.success("Pagamento aprovado");
      tirarDaSelecao(parcela.id);
      if (emConferencia?.id === parcela.id) setEmConferencia(null);
    } else {
      const resultado = await aprovarParcelasEmLote(
        [...selecionadas],
        dataProgramada,
        contaId,
      );
      if ("erro" in resultado) {
        toast.error(
          resultado.aprovadas > 0
            ? `${resultado.aprovadas} pagamento(s) aprovado(s), mas parou: ${resultado.erro}`
            : resultado.erro,
        );
        setSelecionadas(new Set());
        setAlvoAprovacao(null);
        router.refresh();
        return;
      }
      toast.success(`${resultado.aprovadas} pagamento(s) aprovado(s)`);
      setSelecionadas(new Set());
    }

    setAlvoAprovacao(null);
    router.refresh();
  }

  async function confirmarRevisao(motivo?: string) {
    if (!alvoRevisao) return;
    const texto = motivo ?? "";

    if (alvoRevisao.tipo === "linha") {
      const parcela = alvoRevisao.parcela;
      const resultado = await revisarParcela(parcela.id, texto);
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      toast.success("Pagamento enviado para revisão");
      tirarDaSelecao(parcela.id);
      if (emConferencia?.id === parcela.id) setEmConferencia(null);
    } else {
      const resultado = await revisarParcelasEmLote([...selecionadas], texto);
      if ("erro" in resultado) {
        toast.error(
          resultado.revisadas > 0
            ? `${resultado.revisadas} enviado(s) para revisão, mas parou: ${resultado.erro}`
            : resultado.erro,
        );
        setSelecionadas(new Set());
        setAlvoRevisao(null);
        router.refresh();
        return;
      }
      toast.success(`${resultado.revisadas} enviado(s) para revisão`);
      setSelecionadas(new Set());
    }

    setAlvoRevisao(null);
    router.refresh();
  }

  const colunas = React.useMemo<ColumnDef<ParcelaPendente, unknown>[]>(() => {
    const base: ColumnDef<ParcelaPendente, unknown>[] = [];

    if (podeAprovar || podeRevisar) {
      base.push({
        id: "selecao",
        enableSorting: false,
        size: 44,
        meta: { fixa: true, naoTruncar: true },
        header: () => (
          <Checkbox
            checked={todasSelecionadas}
            onCheckedChange={alternarTodas}
            aria-label="Selecionar todos os pagamentos"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selecionadas.has(row.original.id)}
            onCheckedChange={() => alternarUma(row.original.id)}
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
        // A descrição saiu daqui: virou a coluna "Descrição e categoria", e
        // repetir o mesmo texto duas vezes na linha só ocupa espaço.
        cell: ({ row }) => (
          // justify-center porque flex não herda o text-center da célula: sem
          // isso o número encosta na esquerda e desalinha do cabeçalho.
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <span className="codigo-doc">
              {rotuloParcela(
                row.original.lancamentoNumero,
                row.original.numeroParcela,
                row.original.totalParcelas,
              )}
            </span>
            {row.original.semNota ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help">
                    <StatusBadge status="pendente_aprovacao" rotulo="Sem nota" />
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  A ordem de compra de origem ainda não tem nota fiscal
                  registrada. Não impede aprovar: é aviso para a decisão ser
                  consciente.
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        ),
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
            <span className="text-muted-foreground">Manual</span>
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
        // Descrição e categoria juntas: quem aprova precisa ler o que está sendo
        // pago e em que custo isso cai sem abrir o painel nem ligar duas colunas.
        // Id novo de propósito: a coluna "Descrição" solta nascia escondida, e
        // quem já tinha preferência salva continuaria sem ver a descrição.
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
        cell: ({ row }) => <CelulaCentroCusto parcela={row.original} />,
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
        size: 150,
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
        accessorKey: "dataProgramada",
        header: "Data programada",
        size: 160,
        meta: { rotulo: "Data programada", naoTruncar: true },
        cell: ({ row }) =>
          row.original.dataProgramada ? (
            <span className="tabular-nums">
              {formatarData(row.original.dataProgramada)}
            </span>
          ) : (
            <span className="text-legenda text-muted-foreground">
              na aprovação
            </span>
          ),
      },
      {
        accessorKey: "formaPagamentoNome",
        header: "Forma de pagamento",
        size: 170,
        meta: { rotulo: "Forma de pagamento", ocultaPorPadrao: true },
        cell: ({ row }) => (
          <span>{row.original.formaPagamentoNome ?? "-"}</span>
        ),
      },
      {
        // Escondida por padrão: a conta vem do lançamento e é igual para quase
        // toda a fila. Quem confere de onde o dinheiro sai liga no menu "Colunas".
        accessorKey: "contaBancariaNome",
        header: "Conta bancária",
        size: 180,
        meta: { rotulo: "Conta bancária", ocultaPorPadrao: true },
        cell: ({ row }) => (
          <span>{row.original.contaBancariaNome ?? "-"}</span>
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
        id: "status",
        header: "Status",
        size: 150,
        enableSorting: false,
        meta: { rotulo: "Status", ocultaPorPadrao: true, naoTruncar: true },
        cell: () => (
          <StatusBadge status="pendente_aprovacao" rotulo="Na fila" />
        ),
      },
      {
        accessorKey: "valor",
        header: "Valor",
        size: 140,
        meta: { rotulo: "Valor", alinharDireita: true },
        cell: ({ row }) => <MoneyText valor={row.original.valor} />,
      },
    );

    if (podeAprovar || podeRevisar) {
      base.push({
        id: "acoes",
        header: "Ações",
        enableSorting: false,
        // Aprovar + Revisar com ícone passam de 190px e o conteúdo transbordava
        // para a esquerda, cobrindo o valor. Valor escondido atrás de botão numa
        // tela de aprovação de dinheiro não serve.
        size: 240,
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
            {podeAprovar ? (
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  setAlvoAprovacao({ tipo: "linha", parcela: row.original })
                }
              >
                <Check />
                Aprovar
              </Button>
            ) : null}
            {podeRevisar ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setAlvoRevisao({ tipo: "linha", parcela: row.original })
                }
              >
                <PenLine />
                Revisar
              </Button>
            ) : null}
          </div>
        ),
      });
    }

    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podeAprovar, podeRevisar, selecionadas, todasSelecionadas]);

  // As opções saem da própria fila, não do cadastro: filtro que oferece conta
  // ou categoria sem nenhuma parcela só devolve lista vazia.
  const opcoesConta = React.useMemo(() => {
    const porId = new Map<string, string>();
    for (const parcela of parcelas) {
      if (parcela.contaBancariaId) {
        porId.set(
          parcela.contaBancariaId,
          parcela.contaBancariaNome ?? "Conta sem nome",
        );
      }
    }
    return [...porId]
      .map(([valor, rotulo]) => ({ valor, rotulo }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  }, [parcelas]);

  const opcoesCategoria = React.useMemo(
    () => opcoesDeNomes(parcelas.map((parcela) => parcela.categoriaNome)),
    [parcelas],
  );

  const opcoesFornecedor = React.useMemo(
    () => opcoesDeNomes(parcelas.map((parcela) => parcela.fornecedorNome)),
    [parcelas],
  );

  const opcoesForma = React.useMemo(
    () => opcoesDeNomes(parcelas.map((parcela) => parcela.formaPagamentoNome)),
    [parcelas],
  );

  // Um lançamento rateado aparece em vários centros: a opção sai de todos os
  // rateios da fila, não de um centro por parcela.
  const opcoesCentroCusto = React.useMemo(
    () =>
      opcoesDeNomes(
        parcelas.flatMap((parcela) =>
          parcela.rateios.map((rateio) => rateio.nome),
        ),
      ),
    [parcelas],
  );

  // Filtro com uma única opção não filtra nada: fica fora da barra.
  // Conta e categoria seguem visíveis (já eram); o resto nasce escondido, no
  // menu "Filtros", para a barra não virar uma parede de doze campos.
  const filtros: FiltroConfiguravel[] = [
    {
      id: "busca",
      rotulo: "Busca",
      fixo: true,
      elemento: (
        <FiltroBusca
          valor={filtroBusca}
          onValorChange={(valor) => aoTrocarFiltro(() => setFiltroBusca(valor))}
          placeholder="Buscar por lançamento, descrição, fornecedor ou OC"
        />
      ),
    },
  ];
  if (opcoesConta.length > 1) {
    filtros.push({
      id: "conta",
      rotulo: "Conta bancária",
      temValor: filtroConta !== "",
      onLimpar: () => trocarFiltroConta(""),
      elemento: (
        <FiltroSelect
          valor={filtroConta}
          onValorChange={trocarFiltroConta}
          opcoes={opcoesConta}
          todosRotulo="Todas as contas"
          className="max-w-56"
        />
      ),
    });
  }
  if (opcoesCategoria.length > 1) {
    filtros.push({
      id: "categoria",
      rotulo: "Categoria do custo",
      temValor: filtroCategoria !== "",
      onLimpar: () => trocarFiltroCategoria(""),
      elemento: (
        <FiltroSelect
          valor={filtroCategoria}
          onValorChange={trocarFiltroCategoria}
          opcoes={opcoesCategoria}
          todosRotulo="Todas as categorias"
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
  if (opcoesForma.length > 1) {
    filtros.push({
      id: "forma",
      rotulo: "Forma de pagamento",
      ocultoPorPadrao: true,
      temValor: filtroForma !== "",
      onLimpar: () => aoTrocarFiltro(() => setFiltroForma("")),
      elemento: (
        <FiltroSelect
          valor={filtroForma}
          onValorChange={(valor) => aoTrocarFiltro(() => setFiltroForma(valor))}
          opcoes={opcoesForma}
          placeholder="Forma de pagamento"
          todosRotulo="Todas as formas"
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
    {
      id: "origem",
      rotulo: "Origem",
      ocultoPorPadrao: true,
      temValor: filtroOrigem !== "",
      onLimpar: () => aoTrocarFiltro(() => setFiltroOrigem("")),
      elemento: (
        <FiltroSelect
          valor={filtroOrigem}
          onValorChange={(valor) => aoTrocarFiltro(() => setFiltroOrigem(valor))}
          opcoes={OPCOES_ORIGEM}
          placeholder="Origem"
          todosRotulo="Todas as origens"
        />
      ),
    },
  );

  /**
   * A parcela do modal quando a aprovação é de uma só, seja pela linha, seja por
   * um lote de uma. Lote com uma selecionada aparece no modal como parcela
   * única, então vencimento e conta atual têm que vir dela.
   */
  const parcelaDaAprovacao =
    alvoAprovacao?.tipo === "linha"
      ? alvoAprovacao.parcela
      : selecionadasNaFila.length === 1
        ? selecionadasNaFila[0]
        : null;

  const quantidadeRevisao =
    alvoRevisao?.tipo === "linha" ? 1 : selecionadas.size;
  const valorRevisao =
    alvoRevisao?.tipo === "linha"
      ? alvoRevisao.parcela.valor
      : totalSelecionado;

  return (
    // Um provider para a tela inteira: o Tooltip do projeto é o Radix cru, sem
    // provider embutido, e sem ancestral ele lança no cliente na hora em que a
    // primeira linha com tooltip monta ("Sem nota" ou centro de custo rateado).
    // Com a fila vazia nada disso renderiza, então a falta passa despercebida.
    <TooltipProvider>
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <KPICard
            titulo="Total a aprovar"
            valor={formatarBRL(totalAprovar)}
            detalhe={
              filtrando
                ? `${visiveis.length} de ${parcelas.length} pagamento(s) da fila`
                : `${parcelas.length} pagamento(s) na fila`
            }
          />
          <KPICard
            titulo="Em revisão"
            valor={formatarBRL(emRevisao.valor)}
            detalhe={`${emRevisao.parcelas} devolvido(s) para ajuste`}
          />
          <KPICard
            titulo="Aprovado aguardando data"
            valor={formatarBRL(aguardandoData.valor)}
            detalhe={`${aguardandoData.parcelas} com data autorizada à frente`}
          />
        </div>

        {algumaSelecionada ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface px-4 py-2.5">
            <p className="text-detalhe text-foreground">
              {selecionadas.size} selecionado(s)
              <span className="text-muted-foreground">
                {" "}
                · {formatarBRL(totalSelecionado)}
              </span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {podeRevisar ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAlvoRevisao({ tipo: "lote" })}
                >
                  <PenLine />
                  Enviar selecionados para revisão
                </Button>
              ) : null}
              {podeAprovar ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setAlvoAprovacao({ tipo: "lote" })}
                >
                  <CheckCheck />
                  Aprovar selecionados
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
          onRowClick={setEmConferencia}
          idTabela="financeiro.aprovacao-pagamentos"
          idUsuario={idUsuario}
          cabecalhoFixo
          emptyState={
            // Fila cheia e nada na tela é filtro, não fila vazia: dizer
            // "nenhum pagamento aguardando aprovação" aqui seria mentira.
            filtrando && parcelas.length > 0 ? (
              <EmptyState
                icone={Filter}
                titulo="Nenhum pagamento com esses filtros"
                descricao="A fila tem pagamentos, mas nenhum bate com os filtros escolhidos. Limpe os filtros para ver tudo."
                className="border-none bg-transparent"
              />
            ) : (
              <EmptyState
                icone={Inbox}
                titulo="Nenhum pagamento aguardando aprovação"
                descricao={descricaoVazia(incompletas)}
                className="border-none bg-transparent"
              />
            )
          }
        />

        <PainelConferencia
          parcela={emConferencia}
          onFechar={() => setEmConferencia(null)}
          posicao={
            indiceConferencia >= 0
              ? { atual: indiceConferencia + 1, total: visiveis.length }
              : null
          }
          onAnterior={
            indiceConferencia > 0
              ? () => setEmConferencia(visiveis[indiceConferencia - 1])
              : null
          }
          onProximo={
            indiceConferencia >= 0 && indiceConferencia < visiveis.length - 1
              ? () => setEmConferencia(visiveis[indiceConferencia + 1])
              : null
          }
          podeAprovar={podeAprovar}
          podeRevisar={podeRevisar}
          podeEditarLancamento={podeEditarLancamento}
          onAprovar={(parcela) => setAlvoAprovacao({ tipo: "linha", parcela })}
          onRevisar={(parcela) => setAlvoRevisao({ tipo: "linha", parcela })}
        />

        <AprovarDialog
          aberto={alvoAprovacao !== null}
          onAbertoChange={(aberto) => {
            if (!aberto) setAlvoAprovacao(null);
          }}
          quantidade={alvoAprovacao?.tipo === "linha" ? 1 : selecionadas.size}
          valorTotal={
            alvoAprovacao?.tipo === "linha"
              ? alvoAprovacao.parcela.valor
              : totalSelecionado
          }
          vencimento={parcelaDaAprovacao?.dataVencimento ?? null}
          contas={contas}
          contaAtualId={parcelaDaAprovacao?.contaBancariaId ?? null}
          contaAtualNome={parcelaDaAprovacao?.contaBancariaNome ?? null}
          onConfirmar={confirmarAprovacao}
        />

        <ConfirmDialog
          aberto={alvoRevisao !== null}
          onAbertoChange={(aberto) => {
            if (!aberto) setAlvoRevisao(null);
          }}
          titulo={
            quantidadeRevisao > 1
              ? `Enviar ${quantidadeRevisao} pagamentos para revisão`
              : "Enviar para revisão"
          }
          descricao={`${formatarBRL(valorRevisao)}${
            quantidadeRevisao > 1 ? ` em ${quantidadeRevisao} parcelas` : ""
          }. ${
            quantidadeRevisao > 1 ? "As parcelas saem" : "A parcela sai"
          } da fila e ${
            quantidadeRevisao > 1 ? "voltam" : "volta"
          } para quem lançou ajustar. Nada é cancelado: o lançamento continua valendo e continua na previsão de caixa. O motivo vale para ${
            quantidadeRevisao > 1 ? "todas" : "a parcela"
          } (ex.: valor divergente da NF, falta anexo, centro de custo errado).`}
          textoConfirmar="Enviar para revisão"
          exigeMotivo
          onConfirmar={confirmarRevisao}
        />
      </div>
    </TooltipProvider>
  );
}
