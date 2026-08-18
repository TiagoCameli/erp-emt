"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { Filter, HandCoins, Plus } from "lucide-react";

import {
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
  PageHeader,
  StatusBadge,
  useBuscaUrl,
  useFaixaUrl,
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
  /** Filtros vindos da URL: todos são aplicados no banco (paginação server-side). */
  buscaFiltro: string;
  categoriaFiltro: string;
  mesFiltro: string;
  contaFiltro: string;
  valorDeFiltro: string;
  valorAteFiltro: string;
  vencimentoDeFiltro: string;
  vencimentoAteFiltro: string;
  recebimentoDeFiltro: string;
  recebimentoAteFiltro: string;
  contas: ContaBancariaOpcao[];
  categorias: CategoriaOpcao[];
  podeCriar: boolean;
  podeBaixar: boolean;
}

/**
 * Tela de contas a receber: KPI do total em aberto, tabela paginada das
 * parcelas a receber e as ações de novo recebível e baixa de recebimento.
 *
 * Paginação e TODOS os filtros moram na URL e são aplicados no banco. Filtrar
 * só a página carregada seria mentira numa listagem paginada server-side: a
 * pessoa filtra, vê três linhas e conclui que só existem três.
 */
export function ContasReceberCliente({
  linhas,
  total,
  totalEmAberto,
  pagina,
  tamanho,
  statusFiltro,
  buscaFiltro,
  categoriaFiltro,
  mesFiltro,
  contaFiltro,
  valorDeFiltro,
  valorAteFiltro,
  vencimentoDeFiltro,
  vencimentoAteFiltro,
  recebimentoDeFiltro,
  recebimentoAteFiltro,
  contas,
  categorias,
  podeCriar,
  podeBaixar,
}: ContasReceberClienteProps) {
  const router = useRouter();
  const { setMuitos, limparTodos } = useFiltrosUrl();

  // Busca com debounce na URL: escrever o termo zera a página sozinho.
  const { busca, setBusca } = useBuscaUrl(buscaFiltro);
  // Faixa de valor é digitada dígito a dígito: vai pela URL com espera, senão
  // cada tecla viraria uma consulta e o campo perderia caracteres.
  const {
    faixa: faixaValor,
    setFaixa: setFaixaValor,
    limpar: limparFaixaValor,
  } = useFaixaUrl("valorDe", "valorAte");
  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [parcelaEmBaixa, setParcelaEmBaixa] =
    React.useState<ContaReceberLinha | null>(null);

  function recarregar() {
    router.refresh();
  }

  /**
   * Escreve o filtro na URL e volta para a primeira página. Sem zerar a página,
   * quem está na página 3 filtra e cai numa página vazia.
   */
  function aplicarFiltro(mudancas: Record<string, string | null>) {
    setMuitos({ ...mudancas, pagina: null });
  }

  function aoMudarStatus(novoStatus: string) {
    aplicarFiltro({ status: novoStatus || null });
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

  const opcoesCategoria = React.useMemo(
    () =>
      categorias.map((categoria) => ({
        valor: categoria.id,
        rotulo: categoria.nome,
      })),
    [categorias],
  );

  const opcoesConta = React.useMemo(
    () => contas.map((conta) => ({ valor: conta.id, rotulo: conta.nome })),
    [contas],
  );

  // Sem filtro em memória: a lista já chega filtrada do banco.
  const dados = linhas;

  const filtrando =
    buscaFiltro !== "" ||
    statusFiltro !== "" ||
    categoriaFiltro !== "" ||
    contaFiltro !== "" ||
    mesFiltro !== "" ||
    valorDeFiltro !== "" ||
    valorAteFiltro !== "" ||
    vencimentoDeFiltro !== "" ||
    vencimentoAteFiltro !== "" ||
    recebimentoDeFiltro !== "" ||
    recebimentoAteFiltro !== "";

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
  // salva com as colunas dele. Busca e status nascem visíveis; o resto a pessoa
  // liga no menu, senão a barra vira uma parede de dez campos.
  const filtros: FiltroConfiguravel[] = [
    {
      id: "busca",
      rotulo: "Busca",
      fixo: true,
      // Entra no "Limpar filtros": sem isto o botão limpa os seletores e
      // deixa o texto da busca filtrando a lista.
      temValor: busca !== "",
      onLimpar: () => setBusca(""),
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
    {
      id: "categoria",
      rotulo: "Categoria",
      ocultoPorPadrao: true,
      temValor: categoriaFiltro !== "",
      onLimpar: () => aplicarFiltro({ categoria: null }),
      elemento: (
        <FiltroSelect
          valor={categoriaFiltro}
          onValorChange={(valor) => aplicarFiltro({ categoria: valor || null })}
          opcoes={opcoesCategoria}
          placeholder="Categoria"
          todosRotulo="Todas as categorias"
          className="max-w-56"
        />
      ),
    },
    {
      id: "conta",
      rotulo: "Conta bancária",
      ocultoPorPadrao: true,
      temValor: contaFiltro !== "",
      onLimpar: () => aplicarFiltro({ conta: null }),
      elemento: (
        <FiltroSelect
          valor={contaFiltro}
          onValorChange={(valor) => aplicarFiltro({ conta: valor || null })}
          opcoes={opcoesConta}
          placeholder="Conta do recebimento"
          todosRotulo="Todas as contas"
          className="max-w-56"
        />
      ),
    },
    {
      id: "mes",
      rotulo: "Mês de referência",
      ocultoPorPadrao: true,
      temValor: mesFiltro !== "",
      onLimpar: () => aplicarFiltro({ mes: null }),
      elemento: (
        <FiltroMes
          valor={mesFiltro}
          onValorChange={(valor) => aplicarFiltro({ mes: valor || null })}
        />
      ),
    },
    {
      id: "valor",
      rotulo: "Faixa de valor",
      ocultoPorPadrao: true,
      temValor: faixaValor.de !== "" || faixaValor.ate !== "",
      onLimpar: limparFaixaValor,
      elemento: (
        <FiltroValor
          de={faixaValor.de}
          ate={faixaValor.ate}
          onValorChange={(de, ate) => setFaixaValor({ de, ate })}
        />
      ),
    },
    {
      id: "vencimento",
      rotulo: "Período de vencimento",
      ocultoPorPadrao: true,
      temValor: vencimentoDeFiltro !== "" || vencimentoAteFiltro !== "",
      onLimpar: () => aplicarFiltro({ vencDe: null, vencAte: null }),
      elemento: (
        <FiltroPeriodo
          de={vencimentoDeFiltro}
          ate={vencimentoAteFiltro}
          onPeriodoChange={(de, ate) =>
            aplicarFiltro({ vencDe: de || null, vencAte: ate || null })
          }
          rotulo="Vencimento"
        />
      ),
    },
    {
      id: "recebimento",
      rotulo: "Período de recebimento",
      ocultoPorPadrao: true,
      temValor: recebimentoDeFiltro !== "" || recebimentoAteFiltro !== "",
      onLimpar: () => aplicarFiltro({ recDe: null, recAte: null }),
      elemento: (
        <FiltroPeriodo
          de={recebimentoDeFiltro}
          ate={recebimentoAteFiltro}
          onPeriodoChange={(de, ate) =>
            aplicarFiltro({ recDe: de || null, recAte: ate || null })
          }
          rotulo="Recebimento"
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        modulo="Financeiro"
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

      <GradeKpis className="mb-4">
        <KPICard
          titulo="Total a receber"
          valor={formatarBRL(totalEmAberto)}
          detalhe="Parcelas pendentes e aprovadas em aberto"
        />
      </GradeKpis>

      <div className="flex flex-col gap-2">
        <DataTable
          onLimparFiltros={limparTodos}
          idTabela="financeiro.contas-receber"
          columns={colunas}
          data={dados}
          filtros={filtros}
          total={total}
          pageIndex={pagina}
          pageSize={tamanho}
          onPaginationChange={aoMudarPaginacao}
          emptyState={
            // Com filtro aplicado, "nenhuma conta a receber" seria mentira: pode
            // ter muita coisa fora do filtro.
            filtrando ? (
              <EmptyState
                icone={Filter}
                titulo="Nenhuma conta a receber com esses filtros"
                descricao="Ajuste ou limpe os filtros para ver o restante dos recebíveis."
                className="border-none bg-transparent"
              />
            ) : (
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
            )
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
