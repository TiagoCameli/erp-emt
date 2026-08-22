"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { HandCoins, Plus, Wallet } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  BarraSelecao,
  CelulaDescricaoCategoria,
  DataTable,
  EmptyState,
  FiltroBusca,
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
  type OpcaoFiltro,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatarBRL, formatarData } from "@/lib/formatadores";
import {
  ROTULO_BANCO,
  STATUS_PARCELA,
  type BancoConta,
} from "@/modules/financeiro/_shared/formato";
import { DetalheParcelaDrawer } from "@/modules/financeiro/pagamentos/components/detalhe-parcela-drawer";
import { LancamentoFormDrawer } from "@/modules/financeiro/lancamentos/components/lancamento-form-drawer";
import type {
  CategoriaOpcao,
  CentroCustoOpcao,
  ClienteOpcao,
  CondicaoPagamentoOpcao,
  FormaPagamentoOpcao,
  FornecedorOpcao,
} from "@/modules/financeiro/lancamentos/queries";
import type { ContaBancariaOpcao } from "@/modules/financeiro/pagamentos/queries";
import { buscarParcelasRecebidas } from "@/modules/financeiro/recebimentos/actions";
import type {
  CategoriaReceitaOpcao,
  FiltrosRecebidas,
  ParcelaAReceber,
  ParcelaRecebida,
} from "@/modules/financeiro/recebimentos/queries";
import {
  contagemRecebimentos,
  somarParaResumoAReceber,
} from "@/modules/financeiro/recebimentos/resumo";
import { DarComoRecebidoDialog } from "./dar-como-recebido-dialog";

const TAMANHO_PAGINA = 25;

/** Largura máxima do seletor de nome comprido (cliente, conta bancária). */
const LARGURA_NOME = "max-w-[15rem]";

/** Valores dos filtros da aba "A receber", como vivem na URL. */
export interface ValoresFiltrosAReceber {
  busca: string;
  cliente: string;
  conta: string;
  valorDe: string;
  valorAte: string;
  vencDe: string;
  vencAte: string;
}

/** Valores dos filtros da aba "Recebidos", como vivem na URL (prefixo h_). */
export interface ValoresFiltrosRecebidos extends ValoresFiltrosAReceber {
  categoria: string;
  recDe: string;
  recAte: string;
}

/**
 * A coluna de centro de custo, igual nas duas abas de Recebimentos.
 *
 * A regra do texto (nome quando é um, contagem quando são vários) mora em
 * `_shared/centro-de-custo.ts` e é a mesma de Pagamentos e Lançamentos: as três
 * telas descrevem o mesmo lançamento e não podem discordar.
 */
function colunaCentroCusto<
  T extends { centroCustoRotulo?: string | null; centroCustoNomes?: string },
>(): ColumnDef<T, unknown> {
  return {
    id: "centroCusto",
    header: "Centro de custo",
    size: 180,
    enableSorting: false,
    meta: { rotulo: "Centro de custo" },
    cell: ({ row }) =>
      row.original.centroCustoRotulo ? (
        <span title={row.original.centroCustoNomes}>
          {row.original.centroCustoRotulo}
        </span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  };
}

export interface RecebimentosClienteProps {
  aReceber: ParcelaAReceber[];
  recebidas: ParcelaRecebida[];
  totalRecebidas: number;
  /** Quanto ENTROU no mês corrente, pelo líquido. Somado no servidor. */
  recebidoNoMes: number;
  /** Rótulo do mês do card (ex. "agosto de 2026"). */
  rotuloMes: string;
  contas: ContaBancariaOpcao[];
  clientes: ClienteOpcao[];
  categoriasReceita: CategoriaReceitaOpcao[];
  /** Hoje em "YYYY-MM-DD" (America/Rio_Branco), calculado no servidor. */
  hoje: string;
  podeCriar: boolean;
  podeReceber: boolean;
  valoresAReceber: ValoresFiltrosAReceber;
  valoresRecebidos: ValoresFiltrosRecebidos;
  /** Os filtros da aba "Recebidos" já validados, para a action paginar. */
  filtrosRecebidas: FiltrosRecebidas;
  /** Catálogos do formulário de lançamento, que é o mesmo das duas telas. */
  categorias: CategoriaOpcao[];
  fornecedores: FornecedorOpcao[];
  centrosCusto: CentroCustoOpcao[];
  formasPagamento: FormaPagamentoOpcao[];
  condicoesPagamento: CondicaoPagamentoOpcao[];
}

/**
 * Data (YYYY-MM-DD, comparável como texto) dentro do período. Ponta vazia é sem
 * limite naquele lado. Parcela sem a data fica fora de qualquer período: ela não
 * tem data para comparar, e tratá-la como "dentro" mostraria linha que o filtro
 * não pediu.
 */
function dentroDoPeriodo(
  data: string | null,
  de: string,
  ate: string,
): boolean {
  if (de === "" && ate === "") return true;
  if (!data) return false;
  if (de !== "" && data < de) return false;
  if (ate !== "" && data > ate) return false;
  return true;
}

/** Número do lançamento + parcela para exibição (ex: LAN-2026-0001 / 2). */
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
 * Célula do valor recebido. Mostra o valor da parcela e, quando houve ajuste,
 * a composição até o líquido: sem isso a tela exibiria dois números que não
 * somam, mentindo sobre quanto entrou de fato na conta.
 */
function CelulaValorRecebida({ parcela }: { parcela: ParcelaRecebida }) {
  const houveAjuste = parcela.desconto > 0 || parcela.juros > 0;
  if (!houveAjuste) return <MoneyText valor={parcela.valor} />;

  return (
    <div className="flex flex-col items-end">
      <MoneyText valor={parcela.valorLiquido} />
      <span className="text-legenda text-muted-foreground tabular-nums">
        {formatarBRL(parcela.valor)}
        {parcela.desconto > 0 ? ` − ${formatarBRL(parcela.desconto)}` : ""}
        {parcela.juros > 0 ? ` + ${formatarBRL(parcela.juros)}` : ""}
      </span>
    </div>
  );
}

/**
 * Tela de Recebimentos: cards do que a empresa tem a receber, aba "A receber"
 * com a ação de dar como recebido e aba "Recebidos" com o histórico.
 *
 * Espelha a tela de Pagamentos de propósito — quem trabalha nas duas lê a mesma
 * informação no mesmo lugar. A diferença de fundo é que aqui não existe fila de
 * aprovação: recebimento revisado já pode ser dado como recebido, e no momento em
 * que é, o saldo da conta SOBE (a conta é feita por `fn_pagar_parcela`, a mesma do
 * pagamento, que soma quando o tipo é a_receber).
 *
 * A aba "A receber" vem inteira do servidor, então os filtros dela valem em
 * memória. A aba "Recebidos" é paginada no banco, e por isso os filtros dela vão
 * ao banco: filtrar só a página carregada faria a tela mentir sobre quantos
 * recebimentos existem.
 */
export function RecebimentosCliente({
  aReceber,
  recebidas,
  totalRecebidas,
  recebidoNoMes,
  rotuloMes,
  contas,
  clientes,
  categoriasReceita,
  hoje,
  podeCriar,
  podeReceber,
  valoresAReceber,
  valoresRecebidos,
  filtrosRecebidas,
  categorias,
  fornecedores,
  centrosCusto,
  formasPagamento,
  condicoesPagamento,
}: RecebimentosClienteProps) {
  const router = useRouter();
  /**
   * Painel de detalhe do recebimento, aberto ao clicar na linha.
   *
   * Guarda só o ID e carrega sob demanda: a listagem traz centenas de linhas e
   * puxar rateio, anexo e trilha de todas para exibir uma seria pagar o custo
   * inteiro pelo caso raro. Mesmo desenho de Pagamentos — é o MESMO painel
   * canônico, que passou a servir os dois lados.
   */
  const [detalheId, setDetalheId] = React.useState<string | null>(null);
  const [detalheAberto, setDetalheAberto] = React.useState(false);

  function abrirDetalhe(id: string) {
    setDetalheId(id);
    setDetalheAberto(true);
  }

  const { setMuitos, limparTodos } = useFiltrosUrl();

  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [parcelaEmBaixa, setParcelaEmBaixa] =
    React.useState<ParcelaAReceber | null>(null);
  const [selecionadosAReceber, setSelecionadosAReceber] = React.useState<
    string[]
  >([]);

  const opcoesCliente = React.useMemo<OpcaoFiltro[]>(
    () =>
      clientes.map((cliente) => ({
        valor: cliente.id,
        rotulo: cliente.nome,
      })),
    [clientes],
  );

  const opcoesConta = React.useMemo<OpcaoFiltro[]>(
    () =>
      contas.map((conta) => ({
        valor: conta.id,
        rotulo: `${conta.nome} - ${ROTULO_BANCO[conta.banco as BancoConta] ?? conta.banco}`,
      })),
    [contas],
  );

  const opcoesCategoria = React.useMemo<OpcaoFiltro[]>(
    () =>
      categoriasReceita.map((categoria) => ({
        valor: categoria.id,
        rotulo: categoria.nome,
      })),
    [categoriasReceita],
  );

  /**
   * Seletor de valor único preso a um parâmetro da URL. Trocar o filtro zera a
   * página: filtrar e cair numa página vazia parece lista sem resultado.
   */
  function selecao(config: {
    id: string;
    chave: string;
    rotulo: string;
    valor: string;
    opcoes: OpcaoFiltro[];
    todosRotulo: string;
    largura?: string;
  }): FiltroConfiguravel {
    return {
      id: config.id,
      rotulo: config.rotulo,
      ocultoPorPadrao: true,
      temValor: config.valor !== "",
      onLimpar: () => setMuitos({ [config.chave]: null, pagina: "1" }),
      elemento: (
        <FiltroSelect
          valor={config.valor}
          onValorChange={(valor) =>
            setMuitos({
              [config.chave]: valor === "" ? null : valor,
              pagina: "1",
            })
          }
          opcoes={config.opcoes}
          placeholder={config.rotulo}
          todosRotulo={config.todosRotulo}
          className={config.largura}
        />
      ),
    };
  }

  /** Período (de/até) em duas chaves da URL, gravadas numa navegação só. */
  function periodo(config: {
    id: string;
    rotulo: string;
    campo: string;
    chaveDe: string;
    chaveAte: string;
    de: string;
    ate: string;
  }): FiltroConfiguravel {
    return {
      id: config.id,
      rotulo: config.rotulo,
      ocultoPorPadrao: true,
      temValor: config.de !== "" || config.ate !== "",
      onLimpar: () =>
        setMuitos({
          [config.chaveDe]: null,
          [config.chaveAte]: null,
          pagina: "1",
        }),
      elemento: (
        <FiltroPeriodo
          rotulo={config.campo}
          de={config.de}
          ate={config.ate}
          onPeriodoChange={(de, ate) =>
            setMuitos({
              [config.chaveDe]: de === "" ? null : de,
              [config.chaveAte]: ate === "" ? null : ate,
              pagina: "1",
            })
          }
        />
      ),
    };
  }

  /** Faixa de valor (de/até) da aba, presa às chaves de URL dela. */
  function faixaValor(
    id: string,
    controle: ReturnType<typeof useFaixaUrl>,
  ): FiltroConfiguravel {
    return {
      id,
      rotulo: "Faixa de valor",
      ocultoPorPadrao: true,
      temValor: controle.faixa.de !== "" || controle.faixa.ate !== "",
      onLimpar: controle.limpar,
      elemento: (
        <FiltroValor
          de={controle.faixa.de}
          ate={controle.faixa.ate}
          onValorChange={(de, ate) => controle.setFaixa({ de, ate })}
        />
      ),
    };
  }

  // ---------------------------------------------------------------------
  // Aba "A receber": lista inteira do servidor, filtros em memória
  // ---------------------------------------------------------------------

  const { busca: buscaAReceber, setBusca: setBuscaAReceber } = useBuscaUrl(
    valoresAReceber.busca,
  );
  const faixaAReceber = useFaixaUrl("valor_de", "valor_ate");

  const aReceberFiltradas = React.useMemo(() => {
    const termo = buscaAReceber.trim().toLowerCase();
    const valorDe =
      valoresAReceber.valorDe === "" ? null : Number(valoresAReceber.valorDe);
    const valorAte =
      valoresAReceber.valorAte === "" ? null : Number(valoresAReceber.valorAte);

    return aReceber.filter((parcela) => {
      if (
        termo !== "" &&
        !`${parcela.lancamentoNumero ?? ""} ${parcela.numeroDocumento ?? ""} ${parcela.descricao} ${parcela.clienteNome}`
          .toLowerCase()
          .includes(termo)
      ) {
        return false;
      }
      if (
        valoresAReceber.cliente !== "" &&
        parcela.clienteId !== valoresAReceber.cliente
      ) {
        return false;
      }
      if (
        valoresAReceber.conta !== "" &&
        parcela.contaBancariaId !== valoresAReceber.conta
      ) {
        return false;
      }
      if (valorDe !== null && parcela.valor < valorDe) return false;
      if (valorAte !== null && parcela.valor > valorAte) return false;
      if (
        !dentroDoPeriodo(
          parcela.dataVencimento,
          valoresAReceber.vencDe,
          valoresAReceber.vencAte,
        )
      ) {
        return false;
      }
      return true;
    });
  }, [aReceber, buscaAReceber, valoresAReceber]);

  /**
   * O que os cards somam: a seleção quando existe, senão a lista filtrada.
   *
   * Mesma escolha da tela de Pagamentos: marcar linhas transforma os cards numa
   * calculadora do que está marcado, que é a pergunta de quem está conferindo um
   * repasse. Sem seleção eles voltam a responder "quanto a empresa tem a
   * receber".
   */
  const resumidas = React.useMemo(() => {
    if (selecionadosAReceber.length === 0) return aReceberFiltradas;
    const marcados = new Set(selecionadosAReceber);
    return aReceberFiltradas.filter((parcela) => marcados.has(parcela.id));
  }, [aReceberFiltradas, selecionadosAReceber]);

  const resumo = React.useMemo(
    () => somarParaResumoAReceber(resumidas, hoje),
    [resumidas, hoje],
  );
  const temSelecao = selecionadosAReceber.length > 0;

  const filtrosAReceber: FiltroConfiguravel[] = [
    {
      id: "busca",
      rotulo: "Busca",
      fixo: true,
      temValor: buscaAReceber !== "",
      onLimpar: () => setBuscaAReceber(""),
      elemento: (
        <FiltroBusca
          valor={buscaAReceber}
          onValorChange={setBuscaAReceber}
          placeholder="Buscar por documento, descrição ou quem paga"
        />
      ),
    },
    selecao({
      id: "cliente",
      chave: "cliente",
      rotulo: "Quem paga",
      valor: valoresAReceber.cliente,
      opcoes: opcoesCliente,
      todosRotulo: "Todos os pagadores",
      largura: LARGURA_NOME,
    }),
    selecao({
      id: "conta",
      chave: "conta",
      rotulo: "Conta de destino",
      valor: valoresAReceber.conta,
      opcoes: opcoesConta,
      todosRotulo: "Todas as contas",
      largura: LARGURA_NOME,
    }),
    faixaValor("valor", faixaAReceber),
    periodo({
      id: "vencimento",
      rotulo: "Período de vencimento",
      campo: "Vencimento",
      chaveDe: "venc_de",
      chaveAte: "venc_ate",
      de: valoresAReceber.vencDe,
      ate: valoresAReceber.vencAte,
    }),
  ];

  const colunasAReceber = React.useMemo<
    ColumnDef<ParcelaAReceber, unknown>[]
  >(
    () => [
      {
        accessorKey: "numeroDocumento",
        header: "Documento",
        size: 140,
        cell: ({ row }) =>
          row.original.numeroDocumento ? (
            <span className="codigo-doc">{row.original.numeroDocumento}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        accessorKey: "lancamentoNumero",
        header: "Lançamento",
        size: 150,
        cell: ({ row }) =>
          rotuloParcela(
            row.original.lancamentoNumero,
            row.original.numeroParcela,
          ),
      },
      {
        accessorKey: "descricao",
        header: "Descrição e categoria",
        size: 240,
        meta: { rotulo: "Descrição e categoria", naoTruncar: true },
        cell: ({ row }) => (
          <CelulaDescricaoCategoria
            descricao={row.original.descricao}
            categoriaNome={row.original.categoriaNome}
          />
        ),
      },
      { accessorKey: "clienteNome", header: "Quem paga", size: 170 },
      colunaCentroCusto(),
      {
        accessorKey: "contaBancariaNome",
        header: "Entra na conta",
        size: 170,
      },
      {
        accessorKey: "dataVencimento",
        header: "Vencimento",
        size: 120,
        cell: ({ row }) => {
          const data = row.original.dataVencimento;
          const vencida = data !== null && data < hoje;
          return (
            <span
              className={
                vencida
                  ? "text-status-rejeitado tabular-nums"
                  : "tabular-nums"
              }
            >
              {data ? formatarData(data) : "-"}
            </span>
          );
        },
      },
      {
        accessorKey: "valor",
        header: "Valor",
        size: 130,
        meta: { alinharDireita: true },
        cell: ({ row }) => <MoneyText valor={row.original.valor} />,
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 120,
        cell: ({ row }) => {
          const info = STATUS_PARCELA[row.original.status];
          return <StatusBadge status={info.badge} rotulo={info.rotulo} />;
        },
      },
      ...(podeReceber
        ? [
            {
              id: "acoes",
              header: "",
              size: 170,
              meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
              cell: ({ row }) => {
                /**
                 * Botão só nos status que `fn_pagar_parcela` aceita no a receber
                 * (pendente e aprovado). `em_revisao` também é "em aberto" e
                 * entra na lista, mas o banco recusa: oferecer o botão ali seria
                 * um clique que só produz toast de erro.
                 */
                const podeAgora =
                  row.original.status === "pendente" ||
                  row.original.status === "aprovado";
                if (!podeAgora) return null;
                return (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setParcelaEmBaixa(row.original)}
                  >
                    <HandCoins />
                    Dar como recebido
                  </Button>
                );
              },
            } satisfies ColumnDef<ParcelaAReceber, unknown>,
          ]
        : []),
    ],
    [podeReceber, hoje],
  );

  // ---------------------------------------------------------------------
  // Aba "Recebidos": paginada no servidor
  // ---------------------------------------------------------------------

  const { busca: buscaRecebidos, setBusca: setBuscaRecebidos } = useBuscaUrl(
    valoresRecebidos.busca,
    "h_busca",
  );
  const faixaRecebidos = useFaixaUrl("h_valor_de", "h_valor_ate");

  const [linhasRecebidas, setLinhasRecebidas] = React.useState(recebidas);
  const [totalRegistros, setTotalRegistros] = React.useState(totalRecebidas);
  const [paginacao, setPaginacao] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: TAMANHO_PAGINA,
  });
  const [carregando, setCarregando] = React.useState(false);

  // Quando o servidor reenvia a primeira página (após um recebimento e
  // router.refresh), volta a listar a partir dela. Ajuste de estado durante o
  // render quando a prop muda (padrão React), sem efeito nem render em cascata.
  const [recebidasAnterior, setRecebidasAnterior] = React.useState(recebidas);
  if (recebidas !== recebidasAnterior) {
    setRecebidasAnterior(recebidas);
    setLinhasRecebidas(recebidas);
    setTotalRegistros(totalRecebidas);
    setPaginacao((atual) => ({ ...atual, pageIndex: 0 }));
  }

  async function aoMudarPaginacao(nova: PaginationState) {
    setPaginacao(nova);
    setCarregando(true);
    try {
      // Os filtros vão junto: sem eles, a segunda página voltaria sem filtro
      // nenhum e a barra continuaria dizendo que está filtrando.
      const resultado = await buscarParcelasRecebidas(
        nova.pageIndex,
        nova.pageSize,
        filtrosRecebidas,
      );
      setLinhasRecebidas(resultado.itens);
      setTotalRegistros(resultado.total);
    } catch {
      toast.error("Não foi possível carregar o histórico de recebimentos");
    } finally {
      setCarregando(false);
    }
  }

  const filtrosRecebidosBarra: FiltroConfiguravel[] = [
    {
      id: "h_busca",
      rotulo: "Busca",
      fixo: true,
      temValor: buscaRecebidos !== "",
      onLimpar: () => setBuscaRecebidos(""),
      elemento: (
        <FiltroBusca
          valor={buscaRecebidos}
          onValorChange={setBuscaRecebidos}
          placeholder="Buscar por documento, descrição ou quem pagou"
        />
      ),
    },
    selecao({
      id: "h_cliente",
      chave: "h_cliente",
      rotulo: "Quem pagou",
      valor: valoresRecebidos.cliente,
      opcoes: opcoesCliente,
      todosRotulo: "Todos os pagadores",
      largura: LARGURA_NOME,
    }),
    selecao({
      id: "h_conta",
      chave: "h_conta",
      rotulo: "Conta que recebeu",
      valor: valoresRecebidos.conta,
      opcoes: opcoesConta,
      todosRotulo: "Todas as contas",
      largura: LARGURA_NOME,
    }),
    selecao({
      id: "h_categoria",
      chave: "h_categoria",
      rotulo: "Categoria",
      valor: valoresRecebidos.categoria,
      opcoes: opcoesCategoria,
      todosRotulo: "Todas as categorias",
      largura: LARGURA_NOME,
    }),
    faixaValor("h_valor", faixaRecebidos),
    periodo({
      id: "h_vencimento",
      rotulo: "Período de vencimento",
      campo: "Vencimento",
      chaveDe: "h_venc_de",
      chaveAte: "h_venc_ate",
      de: valoresRecebidos.vencDe,
      ate: valoresRecebidos.vencAte,
    }),
    periodo({
      id: "h_recebimento",
      rotulo: "Período de recebimento",
      campo: "Recebimento",
      chaveDe: "h_rec_de",
      chaveAte: "h_rec_ate",
      de: valoresRecebidos.recDe,
      ate: valoresRecebidos.recAte,
    }),
  ];

  const colunasRecebidas = React.useMemo<
    ColumnDef<ParcelaRecebida, unknown>[]
  >(
    () => [
      {
        accessorKey: "numeroDocumento",
        header: "Documento",
        size: 140,
        cell: ({ row }) =>
          row.original.numeroDocumento ? (
            <span className="codigo-doc">{row.original.numeroDocumento}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        accessorKey: "lancamentoNumero",
        header: "Lançamento",
        size: 150,
        cell: ({ row }) =>
          rotuloParcela(
            row.original.lancamentoNumero,
            row.original.numeroParcela,
          ),
      },
      {
        accessorKey: "descricao",
        header: "Descrição e categoria",
        size: 240,
        meta: { rotulo: "Descrição e categoria", naoTruncar: true },
        cell: ({ row }) => (
          <CelulaDescricaoCategoria
            descricao={row.original.descricao}
            categoriaNome={row.original.categoriaNome}
          />
        ),
      },
      { accessorKey: "clienteNome", header: "Quem pagou", size: 170 },
      colunaCentroCusto(),
      {
        accessorKey: "contaBancariaNome",
        header: "Entrou na conta",
        size: 170,
      },
      {
        accessorKey: "dataRecebimento",
        header: "Recebimento",
        size: 120,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.dataRecebimento
              ? formatarData(row.original.dataRecebimento)
              : "-"}
          </span>
        ),
      },
      {
        accessorKey: "valor",
        header: "Valor",
        size: 130,
        meta: { alinharDireita: true },
        cell: ({ row }) => <CelulaValorRecebida parcela={row.original} />,
      },
    ],
    [],
  );

  const semConta = contas.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {/*
        O cabeçalho mora aqui, e não na página, porque a ação primária abre um
        drawer e precisa de estado de cliente. A ação de página vai no cabeçalho,
        ao lado do título, nunca na barra da tabela.
      */}
      <PageHeader
        modulo="Financeiro"
        titulo="Recebimentos"
        descricao="O que a empresa tem a receber e o que já entrou nas contas"
        acoes={
          podeCriar ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setDrawerAberto(true)}
            >
              <Plus />
              Novo recebimento
            </Button>
          ) : undefined
        }
      />

      <GradeKpis>
        <KPICard
          titulo={temSelecao ? "Selecionado" : "Total a receber"}
          valor={formatarBRL(resumo.total)}
          detalhe={contagemRecebimentos(resumo.parcelas)}
        />
        <KPICard
          titulo="A vencer"
          valor={formatarBRL(resumo.aVencer)}
          detalhe={contagemRecebimentos(resumo.aVencerParcelas)}
        />
        <KPICard
          titulo="Vencido"
          valor={formatarBRL(resumo.vencido)}
          detalhe={contagemRecebimentos(resumo.vencidas)}
        />
        {/* Este não reage à seleção: ele é o que JÁ entrou no mês, e é a única
            resposta da tela que não depende do que está marcado. */}
        <KPICard
          titulo="Recebido no mês"
          valor={formatarBRL(recebidoNoMes)}
          detalhe={rotuloMes}
        />
      </GradeKpis>

      {podeReceber && semConta ? (
        <p className="rounded-md border border-border bg-surface px-3 py-2 text-detalhe text-muted-foreground">
          Cadastre uma conta bancária ativa antes de lançar recebimentos.
        </p>
      ) : null}

      <Tabs
        defaultValue="a-receber"
        // Troca de aba limpa a seleção: seleção sobrevivendo à troca faria os
        // cards somarem linha que a pessoa não está mais vendo.
        onValueChange={() => setSelecionadosAReceber([])}
      >
        <TabsList>
          <TabsTrigger value="a-receber">A receber</TabsTrigger>
          <TabsTrigger value="recebidos">Recebidos</TabsTrigger>
        </TabsList>

        <TabsContent value="a-receber">
          <div className="flex flex-col gap-2">
            {/* Sem ação em lote: a seleção existe para os cards do topo somarem
                o que está marcado, e a barra é o que diz quantas linhas são e
                devolve o caminho de volta. */}
            <BarraSelecao
              quantidade={selecionadosAReceber.length}
              onLimpar={() => setSelecionadosAReceber([])}
              resumo={formatarBRL(resumo.total)}
            />
            <DataTable
              onLimparFiltros={limparTodos}
              idTabela="financeiro.recebimentos.a-receber"
              columns={colunasAReceber}
              data={aReceberFiltradas}
              onRowClick={(parcela) => abrirDetalhe(parcela.id)}
              filtros={filtrosAReceber}
              selecao={{
                idDaLinha: (parcela: ParcelaAReceber) => parcela.id,
                selecionados: selecionadosAReceber,
                onSelecionadosChange: setSelecionadosAReceber,
              }}
              emptyState={
                <EmptyState
                  icone={Wallet}
                  titulo="Nenhum recebimento em aberto"
                  descricao="O que a empresa tem a receber aparece aqui, com a conta em que o dinheiro vai entrar. Dar como recebido sobe o saldo dessa conta."
                  className="border-none bg-transparent"
                  acao={
                    podeCriar ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setDrawerAberto(true)}
                      >
                        <Plus />
                        Novo recebimento
                      </Button>
                    ) : undefined
                  }
                />
              }
            />
          </div>
        </TabsContent>

        <TabsContent value="recebidos">
          <DataTable
            idTabela="financeiro.recebimentos.recebidos"
            columns={colunasRecebidas}
            data={linhasRecebidas}
            onRowClick={(parcela) => abrirDetalhe(parcela.id)}
            filtros={filtrosRecebidosBarra}
            total={totalRegistros}
            pageIndex={paginacao.pageIndex}
            pageSize={paginacao.pageSize}
            onPaginationChange={aoMudarPaginacao}
            isLoading={carregando}
            emptyState={
              <EmptyState
                icone={HandCoins}
                titulo="Nenhum recebimento registrado"
                descricao="O dinheiro que já entrou aparece aqui, com a conta e a data"
                className="border-none bg-transparent"
              />
            }
          />
        </TabsContent>
      </Tabs>

      {podeReceber ? (
        <DarComoRecebidoDialog
          parcela={parcelaEmBaixa}
          onFechar={() => setParcelaEmBaixa(null)}
          contas={contas}
          hoje={hoje}
          onRecebido={() => router.refresh()}
        />
      ) : null}

      {/*
        O MESMO formulário de Lançamentos, com o tipo travado em "A receber".
        Não é um segundo formulário para a mesma tabela: era assim antes (havia
        um "Novo a receber" simplificado aqui) e os dois divergiram — o daqui
        nunca mandou número de documento nem conta de destino, e por isso nenhum
        recebível chegou a ser criado.
      */}
      {podeCriar ? (
        <LancamentoFormDrawer
          key={drawerAberto ? "aberto" : "fechado"}
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          lancamento={null}
          tipoFixo="a_receber"
          categorias={categorias}
          fornecedores={fornecedores}
          clientes={clientes}
          contas={contas}
          centrosCusto={centrosCusto}
          formasPagamento={formasPagamento}
          condicoesPagamento={condicoesPagamento}
          onSalvo={() => router.refresh()}
        />
      ) : null}

      {/*
        O MESMO painel de Pagamentos. Ele lê o tipo do lançamento e se ajusta:
        "Entrou na conta" no lugar de "Saiu da conta", "Quem paga" no lugar de
        "Fornecedor", e nada de pagar nem de devolver para aprovação, que são
        ações do fluxo de pagamento. Duplicar um painel de recebimento seria
        criar um segundo lugar para o rateio, a trilha e os anexos divergirem.
      */}
      <DetalheParcelaDrawer
        aberto={detalheAberto}
        onAbertoChange={setDetalheAberto}
        parcelaId={detalheId}
        podeAnexar={podeReceber}
        podePagar={false}
        onMudou={() => router.refresh()}
      />
    </div>
  );
}
