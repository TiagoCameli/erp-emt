"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { CheckCircle2, Wallet } from "lucide-react";
import { toast } from "sonner";

import {
  CelulaDescricaoCategoria,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FiltroBusca,
  KPICard,
  MoneyText,
  StatusBadge,
  type FiltroConfiguravel,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatarBRL, formatarData } from "@/lib/formatadores";
import { STATUS_PARCELA } from "@/modules/financeiro/_shared/formato";
import { programacaoVencida } from "@/modules/financeiro/_shared/janela-pagamento";
import {
  buscarParcelasPagas,
  estornarPagamento,
} from "@/modules/financeiro/pagamentos/actions";
import type {
  ContaBancariaOpcao,
  ParcelaAprovada,
  ParcelaPaga,
} from "@/modules/financeiro/pagamentos/queries";
import { PagarParcelaDrawer } from "./pagar-parcela-drawer";

const TAMANHO_PAGINA = 25;

export interface PagamentosClienteProps {
  aprovadas: ParcelaAprovada[];
  pagas: ParcelaPaga[];
  totalPagas: number;
  contas: ContaBancariaOpcao[];
  podePagar: boolean;
  podeEstornar: boolean;
  /** Hoje em "YYYY-MM-DD" (America/Rio_Branco), calculado no server component. */
  hoje: string;
  /** Anexos por parcela, para o drawer de pagamento mostrar o comprovante. */
  anexosPorParcela?: Record<string, AnexoDoDocumento[]>;
}

/** Número do lançamento + parcela para exibição (ex: LAN-0001 / 2). */
function rotuloParcela(
  numero: string | null,
  numeroParcela: number,
): React.ReactNode {
  if (!numero) {
    return (
      <span className="text-muted-foreground tabular-nums">
        Parcela {numeroParcela}
      </span>
    );
  }
  return (
    <span className="tabular-nums">
      <span className="codigo-doc">{numero}</span>
      <span className="text-muted-foreground"> / {numeroParcela}</span>
    </span>
  );
}

/**
 * Tela de pagamentos: KPI do total a pagar aprovado, aba "A pagar" com as
 * parcelas aprovadas e o botão de pagar, e aba "Pagas" com o histórico
 * paginado no servidor.
 */
export function PagamentosCliente({
  aprovadas,
  pagas,
  totalPagas,
  contas,
  podePagar,
  podeEstornar,
  hoje,
  anexosPorParcela = {},
}: PagamentosClienteProps) {
  const router = useRouter();

  const [parcelaAlvo, setParcelaAlvo] = React.useState<ParcelaAprovada | null>(
    null,
  );
  const [drawerAberto, setDrawerAberto] = React.useState(false);

  const [parcelaEstorno, setParcelaEstorno] =
    React.useState<ParcelaPaga | null>(null);
  const [estornoAberto, setEstornoAberto] = React.useState(false);

  function abrirEstorno(parcela: ParcelaPaga) {
    setParcelaEstorno(parcela);
    setEstornoAberto(true);
  }

  async function confirmarEstorno() {
    if (!parcelaEstorno) return;
    const resultado = await estornarPagamento(parcelaEstorno.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Pagamento estornado");
    router.refresh();
  }

  const totalAPagar = React.useMemo(
    () => aprovadas.reduce((soma, parcela) => soma + parcela.valor, 0),
    [aprovadas],
  );

  // A fila de aprovadas vem inteira do servidor, então a busca filtra no client
  // sem paginação para atrapalhar. O KPI continua somando a fila toda: ele é o
  // total a pagar da empresa, não o total do que está na tela.
  const [buscaAprovadas, setBuscaAprovadas] = React.useState("");
  const aprovadasFiltradas = React.useMemo(() => {
    const termo = buscaAprovadas.trim().toLowerCase();
    if (termo === "") return aprovadas;
    return aprovadas.filter((parcela) =>
      `${parcela.lancamentoNumero ?? ""} ${parcela.descricao} ${parcela.fornecedorNome}`
        .toLowerCase()
        .includes(termo),
    );
  }, [aprovadas, buscaAprovadas]);

  const filtrosAprovadas: FiltroConfiguravel[] = [
    {
      id: "busca",
      rotulo: "Busca",
      fixo: true,
      elemento: (
        <FiltroBusca
          valor={buscaAprovadas}
          onValorChange={setBuscaAprovadas}
          placeholder="Buscar por lançamento, descrição ou fornecedor"
        />
      ),
    },
  ];

  function abrirPagamento(parcela: ParcelaAprovada) {
    setParcelaAlvo(parcela);
    setDrawerAberto(true);
  }

  const semConta = contas.length === 0;

  const colunasAprovadas = React.useMemo<ColumnDef<ParcelaAprovada, unknown>[]>(
    () => [
      {
        accessorKey: "lancamentoNumero",
        header: "Lançamento",
        cell: ({ row }) =>
          rotuloParcela(
            row.original.lancamentoNumero,
            row.original.numeroParcela,
          ),
      },
      {
        accessorKey: "descricao",
        header: "Descrição e categoria",
        size: 280,
        meta: { rotulo: "Descrição e categoria", naoTruncar: true },
        cell: ({ row }) => (
          <CelulaDescricaoCategoria
            descricao={row.original.descricao}
            categoriaNome={row.original.categoriaNome}
          />
        ),
      },
      {
        accessorKey: "fornecedorNome",
        header: "Fornecedor",
      },
      {
        accessorKey: "dataVencimento",
        header: "Vencimento",
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.dataVencimento
              ? formatarData(row.original.dataVencimento)
              : "-"}
          </span>
        ),
      },
      {
        // A data que a trava do banco usa. Sem ela na tela, quem paga clica em
        // Pagar e leva um bloqueio que não tinha como prever.
        accessorKey: "dataProgramada",
        header: "Data autorizada",
        meta: { alinharDireita: true, naoTruncar: true },
        cell: ({ row }) => {
          const autorizada = row.original.dataProgramada;
          if (!autorizada) {
            return <span className="text-muted-foreground">-</span>;
          }
          const vencida = programacaoVencida(autorizada, hoje);
          const aindaNao = autorizada > hoje;
          return (
            <span className="inline-flex items-center justify-end gap-1.5">
              <span className="tabular-nums">{formatarData(autorizada)}</span>
              {vencida ? (
                <StatusBadge status="rejeitado" rotulo="Vencida" />
              ) : aindaNao ? (
                <StatusBadge status="pendente_aprovacao" rotulo="Aguarda" />
              ) : null}
            </span>
          );
        },
      },
      {
        accessorKey: "valor",
        header: "Valor",
        meta: { alinharDireita: true },
        cell: ({ row }) => <MoneyText valor={row.original.valor} />,
      },
      {
        id: "status",
        header: "Status",
        cell: () => (
          <StatusBadge
            status={STATUS_PARCELA.aprovado.badge}
            rotulo={STATUS_PARCELA.aprovado.rotulo}
          />
        ),
      },
      ...(podePagar
        ? [
            {
              id: "acoes",
              header: "",
              meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
              cell: ({ row }) => (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => abrirPagamento(row.original)}
                >
                  Pagar
                </Button>
              ),
            } satisfies ColumnDef<ParcelaAprovada, unknown>,
          ]
        : []),
    ],
    [podePagar],
  );

  const colunasPagas = React.useMemo<ColumnDef<ParcelaPaga, unknown>[]>(
    () => [
      {
        accessorKey: "lancamentoNumero",
        header: "Lançamento",
        cell: ({ row }) =>
          rotuloParcela(
            row.original.lancamentoNumero,
            row.original.numeroParcela,
          ),
      },
      {
        accessorKey: "descricao",
        header: "Descrição e categoria",
        size: 280,
        meta: { rotulo: "Descrição e categoria", naoTruncar: true },
        cell: ({ row }) => (
          <CelulaDescricaoCategoria
            descricao={row.original.descricao}
            categoriaNome={row.original.categoriaNome}
          />
        ),
      },
      {
        accessorKey: "fornecedorNome",
        header: "Fornecedor",
      },
      {
        accessorKey: "contaNome",
        header: "Conta",
      },
      {
        accessorKey: "dataPagamento",
        header: "Pagamento",
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.dataPagamento
              ? formatarData(row.original.dataPagamento)
              : "-"}
          </span>
        ),
      },
      {
        accessorKey: "valor",
        header: "Valor",
        meta: { alinharDireita: true },
        cell: ({ row }) => <MoneyText valor={row.original.valor} />,
      },
      ...(podeEstornar
        ? [
            {
              id: "acoes",
              header: "",
              meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
              cell: ({ row }) => (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => abrirEstorno(row.original)}
                >
                  Estornar
                </Button>
              ),
            } satisfies ColumnDef<ParcelaPaga, unknown>,
          ]
        : []),
    ],
    [podeEstornar],
  );

  // Histórico paginado no servidor: a primeira página vem do server component,
  // as próximas são buscadas via action conforme a paginação muda.
  const [linhasPagas, setLinhasPagas] = React.useState(pagas);
  const [totalRegistros, setTotalRegistros] = React.useState(totalPagas);
  const [paginacao, setPaginacao] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: TAMANHO_PAGINA,
  });
  const [carregandoPagas, setCarregandoPagas] = React.useState(false);

  // Quando o server component reenvia a primeira página (após um pagamento e
  // router.refresh), volta a listar a partir dela. Ajuste de estado durante o
  // render quando a prop muda (padrão React), sem efeito nem render em cascata.
  const [pagasAnterior, setPagasAnterior] = React.useState(pagas);
  if (pagas !== pagasAnterior) {
    setPagasAnterior(pagas);
    setLinhasPagas(pagas);
    setTotalRegistros(totalPagas);
    setPaginacao((atual) => ({ ...atual, pageIndex: 0 }));
  }

  async function aoMudarPaginacao(nova: PaginationState) {
    setPaginacao(nova);
    setCarregandoPagas(true);
    try {
      const resultado = await buscarParcelasPagas(
        nova.pageIndex,
        nova.pageSize,
      );
      setLinhasPagas(resultado.itens);
      setTotalRegistros(resultado.total);
    } catch {
      toast.error("Não foi possível carregar o histórico de pagamentos");
    } finally {
      setCarregandoPagas(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KPICard
          titulo="Total a pagar aprovado"
          valor={formatarBRL(totalAPagar)}
          detalhe={`${aprovadas.length} ${aprovadas.length === 1 ? "parcela aprovada" : "parcelas aprovadas"}`}
        />
      </div>

      {podePagar && semConta ? (
        <p className="rounded-md border border-border bg-surface px-3 py-2 text-detalhe text-muted-foreground">
          Cadastre uma conta bancária ativa antes de registrar pagamentos.
        </p>
      ) : null}

      <Tabs defaultValue="a-pagar">
        <TabsList>
          <TabsTrigger value="a-pagar">A pagar</TabsTrigger>
          <TabsTrigger value="pagas">Pagas</TabsTrigger>
        </TabsList>

        <TabsContent value="a-pagar">
          <DataTable
            idTabela="financeiro.pagamentos.a-pagar"
            columns={colunasAprovadas}
            data={aprovadasFiltradas}
            filtros={filtrosAprovadas}
            emptyState={
              <EmptyState
                icone={Wallet}
                titulo="Nenhuma parcela aprovada"
                descricao="Parcelas aprovadas aparecem aqui, prontas para pagamento. Compra em dinheiro entra direto, sem passar pela aprovação; compra no cartão de crédito já nasce quitada e não aparece aqui."
                className="border-none bg-transparent"
              />
            }
          />
        </TabsContent>

        <TabsContent value="pagas">
          <DataTable
            idTabela="financeiro.pagamentos.pagas"
            columns={colunasPagas}
            data={linhasPagas}
            total={totalRegistros}
            pageIndex={paginacao.pageIndex}
            pageSize={paginacao.pageSize}
            onPaginationChange={aoMudarPaginacao}
            isLoading={carregandoPagas}
            emptyState={
              <EmptyState
                icone={CheckCircle2}
                titulo="Nenhum pagamento registrado"
                descricao="Os pagamentos confirmados aparecem aqui"
                className="border-none bg-transparent"
              />
            }
          />
        </TabsContent>
      </Tabs>

      <PagarParcelaDrawer
        aberto={drawerAberto}
        onAbertoChange={setDrawerAberto}
        parcela={parcelaAlvo}
        contas={contas}
        anexos={parcelaAlvo ? (anexosPorParcela[parcelaAlvo.id] ?? []) : []}
        podeAnexar={podePagar}
        onPago={() => router.refresh()}
      />

      <ConfirmDialog
        aberto={estornoAberto}
        onAbertoChange={setEstornoAberto}
        titulo="Estornar este pagamento?"
        descricao="O valor volta para o saldo da conta bancária e a parcela retorna ao estado anterior ao pagamento."
        textoConfirmar="Estornar"
        variante="destrutivo"
        onConfirmar={confirmarEstorno}
      />
    </div>
  );
}
