"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { CheckCircle2, Wallet } from "lucide-react";
import { toast } from "sonner";

import {
  DataTable,
  EmptyState,
  KPICard,
  MoneyText,
  StatusBadge,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatarBRL, formatarData } from "@/lib/formatadores";
import { STATUS_PARCELA } from "@/modules/financeiro/_shared/formato";
import { buscarParcelasPagas } from "@/modules/financeiro/pagamentos/actions";
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
}

/** Número do lançamento + parcela para exibição (ex: LAN-0001 / 2). */
function rotuloParcela(numero: string | null, numeroParcela: number): React.ReactNode {
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
}: PagamentosClienteProps) {
  const router = useRouter();

  const [parcelaAlvo, setParcelaAlvo] = React.useState<ParcelaAprovada | null>(
    null,
  );
  const [drawerAberto, setDrawerAberto] = React.useState(false);

  const totalAPagar = React.useMemo(
    () => aprovadas.reduce((soma, parcela) => soma + parcela.valor, 0),
    [aprovadas],
  );

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
          rotuloParcela(row.original.lancamentoNumero, row.original.numeroParcela),
      },
      {
        accessorKey: "descricao",
        header: "Descrição",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.descricao}</span>
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
              meta: { alinharDireita: true },
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
          rotuloParcela(row.original.lancamentoNumero, row.original.numeroParcela),
      },
      {
        accessorKey: "descricao",
        header: "Descrição",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.descricao}</span>
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
    ],
    [],
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
      const resultado = await buscarParcelasPagas(nova.pageIndex, nova.pageSize);
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
            columns={colunasAprovadas}
            data={aprovadas}
            emptyState={
              <EmptyState
                icone={Wallet}
                titulo="Nenhuma parcela aprovada"
                descricao="Parcelas a pagar aprovadas aparecem aqui, prontas para pagamento"
                className="border-none bg-transparent"
              />
            }
          />
        </TabsContent>

        <TabsContent value="pagas">
          <DataTable
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
        onPago={() => router.refresh()}
      />
    </div>
  );
}
