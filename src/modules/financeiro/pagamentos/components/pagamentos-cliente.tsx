"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { CheckCircle2, Wallet } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  CelulaDescricaoCategoria,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroPeriodo,
  FiltroSelect,
  FiltroValor,
  GradeKpis,
  KPICard,
  MoneyText,
  StatusBadge,
  useBuscaUrl,
  useFaixaUrl,
  useFiltrosUrl,
  type FiltroConfiguravel,
  type OpcaoFiltro,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatarBRL, formatarData } from "@/lib/formatadores";
import {
  ROTULO_BANCO,
  STATUS_PARCELA,
  type BancoConta,
} from "@/modules/financeiro/_shared/formato";
import { programacaoVencida } from "@/modules/financeiro/_shared/janela-pagamento";
import type { FornecedorOpcao } from "@/modules/financeiro/lancamentos/queries";
import {
  buscarParcelasPagas,
  estornarPagamento,
} from "@/modules/financeiro/pagamentos/actions";
import type {
  ContaBancariaOpcao,
  FiltrosParcelasPagas,
  ParcelaAprovada,
  ParcelaPaga,
} from "@/modules/financeiro/pagamentos/queries";
import { PagarParcelaDrawer } from "./pagar-parcela-drawer";

const TAMANHO_PAGINA = 25;

/** Largura máxima do seletor de nome comprido (fornecedor, conta bancária). */
const LARGURA_NOME = "max-w-[15rem]";

/** Valores dos filtros da aba "A pagar", como vivem na URL. */
export interface ValoresFiltrosAPagar {
  busca: string;
  fornecedor: string;
  conta: string;
  valorDe: string;
  valorAte: string;
  vencDe: string;
  vencAte: string;
  /** Período da data programada (data autorizada do pagamento). */
  progDe: string;
  progAte: string;
}

/** Valores dos filtros da aba "Pagas", como vivem na URL (prefixo h_). */
export interface ValoresFiltrosPagas extends ValoresFiltrosAPagar {
  pagoDe: string;
  pagoAte: string;
}

export interface PagamentosClienteProps {
  aprovadas: ParcelaAprovada[];
  pagas: ParcelaPaga[];
  totalPagas: number;
  contas: ContaBancariaOpcao[];
  /** Fornecedores ativos, para o seletor de fornecedor das duas abas. */
  fornecedores: FornecedorOpcao[];
  podePagar: boolean;
  podeEstornar: boolean;
  /** Hoje em "YYYY-MM-DD" (America/Rio_Branco), calculado no server component. */
  hoje: string;
  /** Anexos por parcela, para o drawer de pagamento mostrar o comprovante. */
  anexosPorParcela?: Record<string, AnexoDoDocumento[]>;
  valoresAPagar: ValoresFiltrosAPagar;
  valoresPagas: ValoresFiltrosPagas;
  /**
   * Os mesmos filtros da aba "Pagas" já validados na página, para acompanhar a
   * action que busca as próximas páginas do histórico.
   */
  filtrosPagas: FiltrosParcelasPagas;
}

/**
 * Data (YYYY-MM-DD, comparável como texto) dentro do período. Ponta vazia é
 * sem limite naquele lado. Parcela sem a data fica fora de qualquer período:
 * ela não tem data para comparar, e tratá-la como "dentro" mostraria linha que
 * o filtro não pediu.
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
 * Célula do valor na tabela de pagamentos pagas. Mostra o valor da parcela e,
 * quando houve ajuste (desconto e/ou juros), exibe a composição da linha líquida:
 *
 * - Se há desconto mas sem juros: "desconto X, líquido Y"
 * - Se há juros mas sem desconto: "juros X, líquido Y"
 * - Se há ambos: "desconto X, juros Z, líquido Y"
 *
 * Desconto e juros vivem como linha extra DENTRO da célula de valor (não como
 * coluna própria) porque quase nenhum pagamento tem ambos, e uma coluna própria
 * apareceria vazia na maioria das linhas, mexendo no conjunto de colunas salvo
 * nas preferências do usuário. Juros entra aqui pelo mesmo motivo que desconto:
 * sem ele, as três parcelas do cálculo (valor, desconto/juros, líquido) não
 * reconciliam na tela, e a conta fica fisicamente errada no papel.
 */
export function CelulaValorPaga({ parcela }: { parcela: ParcelaPaga }) {
  const temDesconto = parcela.desconto > 0;
  const temJuros = parcela.juros > 0;

  if (!temDesconto && !temJuros) {
    return <MoneyText valor={parcela.valor} />;
  }

  // Monta a linha de ajustes dinamicamente. Começa vazia, acumula cada item.
  const partes: React.ReactNode[] = [];

  if (temDesconto) {
    partes.push(
      <React.Fragment key="desconto">
        desconto{" "}
        <MoneyText valor={parcela.desconto} className="inline" />
      </React.Fragment>,
    );
  }

  if (temJuros) {
    partes.push(
      <React.Fragment key="juros">
        juros <MoneyText valor={parcela.juros} className="inline" />
      </React.Fragment>,
    );
  }

  // Sempre termina com o líquido.
  partes.push(
    <React.Fragment key="liquido">
      líquido{" "}
      <MoneyText valor={parcela.valorLiquido} className="inline" />
    </React.Fragment>,
  );

  return (
    <>
      <MoneyText valor={parcela.valor} />
      <span className="block text-legenda text-muted-foreground">
        {partes.map((parte, index) => [
          index > 0 && ", ",
          parte,
        ])}
      </span>
    </>
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
  fornecedores,
  podePagar,
  podeEstornar,
  hoje,
  anexosPorParcela = {},
  valoresAPagar,
  valoresPagas,
  filtrosPagas,
}: PagamentosClienteProps) {
  const router = useRouter();
  const { setMuitos, limparTodos } = useFiltrosUrl();
  // Faixa de valor é digitada dígito a dígito: vai pela URL com espera, senão
  // cada tecla viraria uma navegação e o campo perderia caracteres. Uma por aba,
  // porque cada aba tem as suas chaves (o histórico usa o prefixo h_).
  const faixaAPagar = useFaixaUrl("valor_de", "valor_ate");
  const faixaPagas = useFaixaUrl("h_valor_de", "h_valor_ate");

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

  const opcoesFornecedor = React.useMemo<OpcaoFiltro[]>(
    () =>
      fornecedores.map((fornecedor) => ({
        valor: fornecedor.id,
        rotulo: fornecedor.nome,
      })),
    [fornecedores],
  );

  const opcoesConta = React.useMemo<OpcaoFiltro[]>(
    () =>
      contas.map((conta) => ({
        valor: conta.id,
        rotulo: `${conta.nome} - ${ROTULO_BANCO[conta.banco as BancoConta] ?? conta.banco}`,
      })),
    [contas],
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
    /** Nome no menu "Filtros" (ex. "Período de vencimento"). */
    rotulo: string;
    /** Nome curto ao lado dos campos na barra (ex. "Vencimento"). */
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

  // A fila de aprovadas vem inteira do servidor (sem paginação), então os
  // filtros dela valem em memória: aqui não existe página escondida para
  // filtrar errado. O KPI continua somando a fila toda: ele é o total a pagar
  // da empresa, não o total do que está na tela.
  const { busca: buscaAprovadas, setBusca: setBuscaAprovadas } = useBuscaUrl(
    valoresAPagar.busca,
  );
  const aprovadasFiltradas = React.useMemo(() => {
    const termo = buscaAprovadas.trim().toLowerCase();
    const valorDe =
      valoresAPagar.valorDe === "" ? null : Number(valoresAPagar.valorDe);
    const valorAte =
      valoresAPagar.valorAte === "" ? null : Number(valoresAPagar.valorAte);

    return aprovadas.filter((parcela) => {
      if (
        termo !== "" &&
        !`${parcela.lancamentoNumero ?? ""} ${parcela.descricao} ${parcela.fornecedorNome}`
          .toLowerCase()
          .includes(termo)
      ) {
        return false;
      }
      if (
        valoresAPagar.fornecedor !== "" &&
        parcela.fornecedorId !== valoresAPagar.fornecedor
      ) {
        return false;
      }
      if (
        valoresAPagar.conta !== "" &&
        parcela.contaBancariaId !== valoresAPagar.conta
      ) {
        return false;
      }
      if (valorDe !== null && parcela.valor < valorDe) return false;
      if (valorAte !== null && parcela.valor > valorAte) return false;
      if (
        !dentroDoPeriodo(
          parcela.dataVencimento,
          valoresAPagar.vencDe,
          valoresAPagar.vencAte,
        )
      ) {
        return false;
      }
      if (
        !dentroDoPeriodo(
          parcela.dataProgramada,
          valoresAPagar.progDe,
          valoresAPagar.progAte,
        )
      ) {
        return false;
      }
      return true;
    });
  }, [aprovadas, buscaAprovadas, valoresAPagar]);

  const filtrosAprovadas: FiltroConfiguravel[] = [
    {
      id: "busca",
      rotulo: "Busca",
      fixo: true,
      // Entra no "Limpar filtros": sem isto o botão limpa os seletores e
      // deixa o texto da busca filtrando a lista.
      temValor: buscaAprovadas !== "",
      onLimpar: () => setBuscaAprovadas(""),
      elemento: (
        <FiltroBusca
          valor={buscaAprovadas}
          onValorChange={setBuscaAprovadas}
          placeholder="Buscar por lançamento, descrição ou fornecedor"
        />
      ),
    },
    selecao({
      id: "fornecedor",
      chave: "fornecedor",
      rotulo: "Fornecedor",
      valor: valoresAPagar.fornecedor,
      opcoes: opcoesFornecedor,
      todosRotulo: "Todos os fornecedores",
      largura: LARGURA_NOME,
    }),
    selecao({
      id: "conta",
      chave: "conta",
      rotulo: "Conta bancária",
      valor: valoresAPagar.conta,
      opcoes: opcoesConta,
      todosRotulo: "Todas as contas",
      largura: LARGURA_NOME,
    }),
    faixaValor("valor", faixaAPagar),
    periodo({
      id: "vencimento",
      rotulo: "Período de vencimento",
      campo: "Vencimento",
      chaveDe: "venc_de",
      chaveAte: "venc_ate",
      de: valoresAPagar.vencDe,
      ate: valoresAPagar.vencAte,
    }),
    periodo({
      id: "programada",
      rotulo: "Período de autorização",
      campo: "Data autorizada",
      chaveDe: "prog_de",
      chaveAte: "prog_ate",
      de: valoresAPagar.progDe,
      ate: valoresAPagar.progAte,
    }),
  ];

  // Aba "Pagas": paginação no servidor, então todo filtro daqui vai ao banco
  // junto com a página (ver buscarParcelasPagas). Trocar um filtro reescreve a
  // URL, o server component devolve a primeira página já filtrada e a tabela
  // volta para a página 1 (ver o ajuste de `pagasAnterior` mais abaixo).
  const { busca: buscaPagas, setBusca: setBuscaPagas } = useBuscaUrl(
    valoresPagas.busca,
    "h_busca",
  );

  const filtrosPagasBarra: FiltroConfiguravel[] = [
    {
      id: "busca",
      rotulo: "Busca",
      fixo: true,
      // Entra no "Limpar filtros": sem isto o botão limpa os seletores e
      // deixa o texto da busca filtrando a lista.
      temValor: buscaPagas !== "",
      onLimpar: () => setBuscaPagas(""),
      elemento: (
        <FiltroBusca
          valor={buscaPagas}
          onValorChange={setBuscaPagas}
          placeholder="Buscar por lançamento, descrição ou fornecedor"
        />
      ),
    },
    selecao({
      id: "fornecedor",
      chave: "h_fornecedor",
      rotulo: "Fornecedor",
      valor: valoresPagas.fornecedor,
      opcoes: opcoesFornecedor,
      todosRotulo: "Todos os fornecedores",
      largura: LARGURA_NOME,
    }),
    selecao({
      id: "conta",
      chave: "h_conta",
      rotulo: "Conta bancária",
      valor: valoresPagas.conta,
      opcoes: opcoesConta,
      todosRotulo: "Todas as contas",
      largura: LARGURA_NOME,
    }),
    faixaValor("valor", faixaPagas),
    periodo({
      id: "vencimento",
      rotulo: "Período de vencimento",
      campo: "Vencimento",
      chaveDe: "h_venc_de",
      chaveAte: "h_venc_ate",
      de: valoresPagas.vencDe,
      ate: valoresPagas.vencAte,
    }),
    periodo({
      id: "programada",
      rotulo: "Período de autorização",
      campo: "Data autorizada",
      chaveDe: "h_prog_de",
      chaveAte: "h_prog_ate",
      de: valoresPagas.progDe,
      ate: valoresPagas.progAte,
    }),
    periodo({
      id: "pagamento",
      rotulo: "Período do pagamento",
      campo: "Pagamento",
      chaveDe: "h_pago_de",
      chaveAte: "h_pago_ate",
      de: valoresPagas.pagoDe,
      ate: valoresPagas.pagoAte,
    }),
  ];

  function abrirPagamento(parcela: ParcelaAprovada) {
    setParcelaAlvo(parcela);
    setDrawerAberto(true);
  }

  const semConta = contas.length === 0;

  // As larguras são declaradas coluna a coluna porque o padrão de 150px em
  // todas somava mais que a área útil da tela: a tabela ganhava rolagem
  // horizontal e, com a fila vazia, o estado vazio (que ocupa a linha inteira)
  // nascia centralizado fora da tela, com o texto da regra cortado à direita.
  const colunasAprovadas = React.useMemo<ColumnDef<ParcelaAprovada, unknown>[]>(
    () => [
      {
        accessorKey: "lancamentoNumero",
        header: "Lançamento",
        size: 120,
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
      {
        accessorKey: "fornecedorNome",
        header: "Fornecedor",
        size: 170,
      },
      {
        accessorKey: "dataVencimento",
        header: "Vencimento",
        size: 120,
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
        // Cabe a data mais o badge "Vencida"/"Aguarda" na mesma linha.
        size: 180,
        meta: { naoTruncar: true },
        cell: ({ row }) => {
          const autorizada = row.original.dataProgramada;
          if (!autorizada) {
            return <span className="text-muted-foreground">-</span>;
          }
          const vencida = programacaoVencida(autorizada, hoje);
          const aindaNao = autorizada > hoje;
          return (
            <span className="inline-flex items-center gap-1.5">
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
        size: 130,
        meta: { alinharDireita: true },
        cell: ({ row }) => <MoneyText valor={row.original.valor} />,
      },
      {
        id: "status",
        header: "Status",
        size: 110,
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
              size: 100,
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

  // Mesma régua de largura da aba "A pagar": a soma cabe na tela, então a
  // tabela não ganha rolagem horizontal nem empurra o estado vazio para fora.
  const colunasPagas = React.useMemo<ColumnDef<ParcelaPaga, unknown>[]>(
    () => [
      {
        accessorKey: "lancamentoNumero",
        header: "Lançamento",
        size: 120,
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
      {
        accessorKey: "fornecedorNome",
        header: "Fornecedor",
        size: 170,
      },
      {
        accessorKey: "contaNome",
        header: "Conta",
        size: 160,
      },
      {
        accessorKey: "dataPagamento",
        header: "Pagamento",
        size: 120,
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
        size: 130,
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <CelulaValorPaga parcela={row.original} />
        ),
      },
      ...(podeEstornar
        ? [
            {
              id: "acoes",
              header: "",
              size: 120,
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
      // Os filtros vão junto: sem eles, a segunda página do histórico voltaria
      // sem filtro nenhum e a barra continuaria dizendo que está filtrando.
      const resultado = await buscarParcelasPagas(
        nova.pageIndex,
        nova.pageSize,
        filtrosPagas,
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
      <GradeKpis>
        <KPICard
          titulo="Total a pagar aprovado"
          valor={formatarBRL(totalAPagar)}
          detalhe={`${aprovadas.length} ${aprovadas.length === 1 ? "parcela aprovada" : "parcelas aprovadas"}`}
        />
      </GradeKpis>

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
            onLimparFiltros={limparTodos}
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
            filtros={filtrosPagasBarra}
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
        descricao={
          parcelaEstorno && parcelaEstorno.desconto > 0
            ? `O líquido de ${formatarBRL(parcelaEstorno.valorLiquido)} volta para o saldo da conta bancária, o desconto de ${formatarBRL(parcelaEstorno.desconto)} é apagado e a parcela volta a valer ${formatarBRL(parcelaEstorno.valor)} em aberto.`
            : "O valor volta para o saldo da conta bancária e a parcela retorna ao estado anterior ao pagamento."
        }
        textoConfirmar="Estornar"
        variante="destrutivo"
        onConfirmar={confirmarEstorno}
      />
    </div>
  );
}
