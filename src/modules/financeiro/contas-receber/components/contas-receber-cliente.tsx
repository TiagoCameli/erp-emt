"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { HandCoins, Plus } from "lucide-react";

import {
  CelulaDescricaoCategoria,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroSelect,
  KPICard,
  MoneyText,
  PageHeader,
  StatusBadge,
  useFiltrosUrl,
  type FiltroConfiguravel,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarBRL, formatarData } from "@/lib/formatadores";
import { STATUS_PARCELA } from "@/modules/financeiro/_shared/formato";
import type {
  CategoriaOpcao,
  ContaBancariaOpcao,
  ContaReceberLinha,
} from "@/modules/financeiro/contas-receber/queries";
import { TAMANHO_PAGINA_PADRAO } from "@/modules/financeiro/contas-receber/schemas";
import { BaixaRecebimentoDialog } from "./baixa-recebimento-dialog";
import { ReceberFormDrawer } from "./receber-form-drawer";

const OPCOES_STATUS = Object.entries(STATUS_PARCELA).map(([valor, info]) => ({
  valor,
  rotulo: info.rotulo,
}));

export interface ContasReceberClienteProps {
  linhas: ContaReceberLinha[];
  total: number;
  totalEmAberto: number;
  pagina: number;
  tamanho: number;
  statusFiltro: string;
  contas: ContaBancariaOpcao[];
  categorias: CategoriaOpcao[];
  podeCriar: boolean;
  podeBaixar: boolean;
}

/**
 * Tela de contas a receber: KPI do total em aberto, filtro por status,
 * tabela paginada das parcelas a receber e as ações de novo recebível e baixa
 * de recebimento. Paginação e filtro de status moram na URL (server-side); a
 * busca por texto filtra a página atual no client.
 */
export function ContasReceberCliente({
  linhas,
  total,
  totalEmAberto,
  pagina,
  tamanho,
  statusFiltro,
  contas,
  categorias,
  podeCriar,
  podeBaixar,
}: ContasReceberClienteProps) {
  const router = useRouter();
  const { setMuitos } = useFiltrosUrl();

  const [busca, setBusca] = React.useState("");
  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [parcelaEmBaixa, setParcelaEmBaixa] =
    React.useState<ContaReceberLinha | null>(null);

  function recarregar() {
    router.refresh();
  }

  function aoMudarStatus(novoStatus: string) {
    setMuitos({ status: novoStatus || null, pagina: null });
  }

  function aoMudarPaginacao(paginacao: PaginationState) {
    setMuitos({
      pagina:
        paginacao.pageIndex === 0 ? null : String(paginacao.pageIndex + 1),
      tamanho:
        paginacao.pageSize === TAMANHO_PAGINA_PADRAO
          ? null
          : String(paginacao.pageSize),
    });
  }

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return linhas;
    return linhas.filter((linha) => {
      const alvo =
        `${linha.lancamentoNumero ?? ""} ${linha.descricao}`.toLowerCase();
      return alvo.includes(termo);
    });
  }, [linhas, busca]);

  const colunas = React.useMemo<ColumnDef<ContaReceberLinha, unknown>[]>(
    () => [
      {
        accessorKey: "lancamentoNumero",
        header: "Lançamento",
        cell: ({ row }) =>
          row.original.lancamentoNumero ? (
            <span className="codigo-doc">{row.original.lancamentoNumero}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
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
            complemento={
              total > 0 && row.original.numeroParcela > 1 ? (
                <span className="tabular-nums">
                  ({row.original.numeroParcela}ª)
                </span>
              ) : null
            }
          />
        ),
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
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const info = STATUS_PARCELA[row.original.status];
          return <StatusBadge status={info.badge} rotulo={info.rotulo} />;
        },
      },
      {
        id: "acoes",
        header: "",
        meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
        cell: ({ row }) => {
          const parcela = row.original;
          const podeRegistrar =
            podeBaixar &&
            (parcela.status === "pendente" || parcela.status === "aprovado");
          if (!podeRegistrar) return null;
          return (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setParcelaEmBaixa(parcela)}
            >
              <HandCoins />
              Registrar recebimento
            </Button>
          );
        },
      },
    ],
    [podeBaixar, total],
  );

  // Filtros declarados na DataTable (e não numa FilterBar solta) para entrarem
  // no menu "Filtros": cada usuário escolhe quais quer ver, e a escolha fica
  // salva com as colunas dele.
  const filtros: FiltroConfiguravel[] = [
    {
      id: "busca",
      rotulo: "Busca",
      fixo: true,
      elemento: (
        <FiltroBusca
          valor={busca}
          onValorChange={setBusca}
          placeholder="Buscar por lançamento ou descrição"
        />
      ),
    },
    {
      id: "status",
      rotulo: "Status",
      temValor: statusFiltro !== "",
      onLimpar: () => aoMudarStatus(""),
      elemento: (
        <FiltroSelect
          valor={statusFiltro}
          onValorChange={aoMudarStatus}
          opcoes={OPCOES_STATUS}
          placeholder="Status"
          todosRotulo="Todos os status"
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        titulo="Contas a receber"
        descricao="Recebíveis e suas parcelas por cliente"
        acoes={
          podeCriar ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setDrawerAberto(true)}
            >
              <Plus />
              Novo a receber
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KPICard
          titulo="Total a receber"
          valor={formatarBRL(totalEmAberto)}
          detalhe="Parcelas pendentes e aprovadas em aberto"
        />
      </div>

      <div className="flex flex-col gap-2">
        <DataTable
          idTabela="financeiro.contas-receber"
          columns={colunas}
          data={dados}
          filtros={filtros}
          total={total}
          pageIndex={pagina}
          pageSize={tamanho}
          onPaginationChange={aoMudarPaginacao}
          emptyState={
            <EmptyState
              icone={HandCoins}
              titulo="Nenhuma conta a receber"
              descricao="Crie o primeiro recebível deste cliente para começar"
              className="border-none bg-transparent"
              acao={
                podeCriar ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setDrawerAberto(true)}
                  >
                    <Plus />
                    Novo a receber
                  </Button>
                ) : undefined
              }
            />
          }
        />
      </div>

      {podeCriar ? (
        <ReceberFormDrawer
          key={drawerAberto ? "aberto" : "fechado"}
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          categorias={categorias}
          onCriado={recarregar}
        />
      ) : null}

      {podeBaixar ? (
        <BaixaRecebimentoDialog
          parcela={parcelaEmBaixa}
          onFechar={() => setParcelaEmBaixa(null)}
          contas={contas}
          onBaixado={recarregar}
        />
      ) : null}
    </>
  );
}
