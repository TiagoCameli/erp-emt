"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowDownLeft, ArrowUpRight, Filter, Landmark } from "lucide-react";

import {
  CelulaDescricaoCategoria,
  CelulaVazia,
  colunaData,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroPeriodo,
  FiltroSelect,
  FiltroValor,
  GradeKpis,
  KPICard,
  MoneyText,
  useFiltrosUrl,
  type FiltroConfiguravel,
} from "@/components/canonicos";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";
import { formatarBRL, formatarData } from "@/lib/formatadores";
import {
  dentroDaFaixaValor,
  dentroDoPeriodo,
  usePaginacaoCliente,
} from "@/modules/_shared/filtros-cliente";
import {
  somarMovimentos,
  type MovimentoExtrato,
} from "@/modules/financeiro/contas-bancarias/extrato";
import {
  ESCOPO_TUDO,
  PARAM_ESCOPO,
  type EscopoExtrato,
} from "@/modules/financeiro/contas-bancarias/extrato-escopo";
import type { ContaLista } from "@/modules/financeiro/contas-bancarias/queries";

/** Rótulo do tipo de movimento, embaixo de Entrada/Saída. */
const ROTULO_TIPO: Record<MovimentoExtrato["tipo"], string | null> = {
  // Parcela é o caso comum e o documento já aparece na coluna ao lado: repetir
  // "Pagamento" em 5.939 linhas é ruído.
  parcela: null,
  transferencia: "Transferência",
  tarifa: "Tarifa",
};

const OPCOES_SENTIDO = [
  { valor: "entrada", rotulo: "Entradas" },
  { valor: "saida", rotulo: "Saídas" },
];

/**
 * Explicação do saldo vazio na linha anterior ao corte.
 *
 * Vai no `title` da célula porque a alternativa é pior das duas maneiras: sem
 * explicação nenhuma, o traço parece defeito da tela; escrito em cada linha,
 * viram 5.573 repetições da mesma frase.
 */
function motivoSemSaldo(conta: ContaLista): string {
  return (
    `Movimento anterior a ${formatarData(conta.saldoInicialData)}, a data do ` +
    "extrato de onde o saldo inicial desta conta foi lido. Ele já está dentro " +
    "desse saldo de abertura, então não tem saldo acumulado próprio: somá-lo " +
    "de novo contaria o mesmo dinheiro duas vezes."
  );
}

export interface ExtratoContaTabelaProps {
  conta: ContaLista;
  movimentos: MovimentoExtrato[];
  /** Escopo em vigor, lido da URL pelo Server Component. */
  escopo: EscopoExtrato;
  /** Sem permissão de ver lançamentos, a linha não clica (levaria a um 404). */
  podeVerLancamentos: boolean;
}

/**
 * Extrato de uma conta bancária: uma linha por movimento, entrada e saída, com o
 * saldo acumulado.
 *
 * O SALDO ACUMULADO VEM PRONTO DO SERVIDOR e não é recalculado aqui. É o que
 * mantém a coluna correta debaixo de qualquer filtro e de qualquer ordenação:
 * recalculando sobre as linhas visíveis, clicar em "ordenar por valor" faria a
 * coluna somar numa ordem que não é a do dinheiro e mostrar saldo que nunca
 * existiu, sem erro nenhum aparecer. Ver `montarExtrato` em ../extrato.ts.
 *
 * Os cartões, ao contrário, somam as linhas que SOBRARAM dos filtros: cartão que
 * ignora o filtro da tabela embaixo dele responde a uma pergunta que ninguém fez.
 * A exceção é "Saldo atual", que é da conta e não do recorte.
 *
 * O escopo (movimento dentro do saldo x histórico inteiro) é o único filtro que
 * mora na URL, porque é o único que muda o que o SERVIDOR busca. Os outros rodam
 * em memória sobre o que já chegou.
 */
export function ExtratoContaTabela({
  conta,
  movimentos,
  escopo,
  podeVerLancamentos,
}: ExtratoContaTabelaProps) {
  const router = useRouter();
  const { set } = useFiltrosUrl();
  const { paginacao, setPaginacao, zerarPagina } = usePaginacaoCliente();
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [sentido, setSentido] = useFiltroSessao("sentido", "");
  const [dataDe, setDataDe] = useFiltroSessao("dataDe", "");
  const [dataAte, setDataAte] = useFiltroSessao("dataAte", "");
  const [valorDe, setValorDe] = useFiltroSessao("valorDe", "");
  const [valorAte, setValorAte] = useFiltroSessao("valorAte", "");

  /**
   * Escopo local, à frente da URL.
   *
   * Gravar na URL é assíncrono (ida ao servidor), então sem estado local o
   * seletor continuaria mostrando a opção antiga até a volta chegar, e um segundo
   * clique partiria do valor velho. Mesmo padrão do seletor de fornecedor do
   * extrato por fornecedor, e pelo mesmo motivo medido lá.
   *
   * Quando a volta do servidor chega diferente do que temos (link colado, botão
   * voltar, outra aba), o local se rende a ela.
   */
  const [escopoLocal, setEscopoLocal] = React.useState<EscopoExtrato>(escopo);
  const [escopoAnterior, setEscopoAnterior] =
    React.useState<EscopoExtrato>(escopo);
  if (escopoAnterior !== escopo) {
    setEscopoAnterior(escopo);
    setEscopoLocal(escopo);
  }

  // Trocar filtro volta para a primeira página: filtrar e cair numa página vazia
  // faz a pessoa concluir que não existe movimento com aquele critério.
  function mudarBusca(valor: string) {
    setBusca(valor);
    zerarPagina();
  }
  function mudarSentido(valor: string) {
    setSentido(valor);
    zerarPagina();
  }
  function mudarData(de: string, ate: string) {
    setDataDe(de);
    setDataAte(ate);
    zerarPagina();
  }
  function mudarValor(de: string, ate: string) {
    setValorDe(de);
    setValorAte(ate);
    zerarPagina();
  }
  function mudarEscopo(valor: string) {
    const novo: EscopoExtrato = valor === ESCOPO_TUDO ? ESCOPO_TUDO : "saldo";
    // Local primeiro (o seletor troca na hora), URL depois. `escopoAnterior` NÃO
    // é tocada aqui de propósito: ela rastreia o que o SERVIDOR mandou por
    // último, e atualizá-la no clique desfaria a troca otimista na hora.
    setEscopoLocal(novo);
    zerarPagina();
    set(PARAM_ESCOPO, novo === ESCOPO_TUDO ? ESCOPO_TUDO : null);
  }

  const colunas = React.useMemo<ColumnDef<MovimentoExtrato, unknown>[]>(
    () => [
      colunaData<MovimentoExtrato>("data", "Data", formatarData),
      {
        accessorKey: "entrada",
        header: "Movimento",
        size: 140,
        meta: { naoTruncar: true },
        cell: ({ row }) => {
          const { entrada, tipo } = row.original;
          const rotuloTipo = ROTULO_TIPO[tipo];
          return (
            <div className="flex flex-col gap-0.5">
              <span
                className={
                  entrada
                    ? "inline-flex items-center gap-1 font-medium text-status-aprovado"
                    : "inline-flex items-center gap-1 font-medium text-foreground"
                }
              >
                {entrada ? (
                  <ArrowDownLeft className="size-3.5 shrink-0" />
                ) : (
                  <ArrowUpRight className="size-3.5 shrink-0" />
                )}
                {entrada ? "Entrada" : "Saída"}
              </span>
              {rotuloTipo ? (
                <span className="text-legenda text-muted-foreground">
                  {rotuloTipo}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "documento",
        header: "Documento",
        size: 170,
        cell: ({ row }) => {
          const { numero, numeroDocumento, parcela } = row.original;
          if (!numero && !numeroDocumento) return <CelulaVazia />;
          return (
            <div className="flex flex-col gap-0.5">
              {numero ? (
                <span className="codigo-doc">
                  {numero}
                  {parcela ? (
                    <span className="text-muted-foreground"> ({parcela})</span>
                  ) : null}
                </span>
              ) : null}
              {/* Número do documento do fornecedor (nota, boleto, recibo). É por
                  ele que se procura o movimento com o papel na mão. */}
              {numeroDocumento ? (
                <span className="text-legenda text-muted-foreground">
                  NF/doc {numeroDocumento}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: "descricao",
        header: "Descrição e categoria",
        size: 300,
        meta: { rotulo: "Descrição e categoria", naoTruncar: true },
        cell: ({ row }) => (
          <CelulaDescricaoCategoria
            descricao={row.original.descricao}
            categoriaNome={row.original.categoriaNome}
          />
        ),
      },
      {
        accessorKey: "contraparte",
        header: "Quem",
        size: 240,
        meta: { rotulo: "Quem (fornecedor, cliente ou conta)" },
        cell: ({ row }) =>
          row.original.contraparte ?? <CelulaVazia />,
      },
      {
        accessorKey: "valorComSinal",
        header: "Valor",
        size: 150,
        // Ordena pelo valor COM SINAL: pelo absoluto, uma saída de R$ 100 mil
        // ficaria colada numa entrada de R$ 100 mil como se fossem a mesma coisa.
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => (
          <MoneyText
            valor={row.original.valorComSinal}
            className={
              row.original.entrada
                ? "font-medium text-status-aprovado"
                : "font-medium"
            }
          />
        ),
      },
      {
        accessorKey: "saldoAcumulado",
        header: "Saldo",
        size: 160,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => {
          const saldo = row.original.saldoAcumulado;
          if (saldo === null) {
            return (
              <span
                className="text-muted-foreground"
                title={motivoSemSaldo(conta)}
              >
                —
              </span>
            );
          }
          return <MoneyText valor={saldo} />;
        },
      },
    ],
    [conta],
  );

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return movimentos.filter((movimento) => {
      if (sentido === "entrada" && !movimento.entrada) return false;
      if (sentido === "saida" && movimento.entrada) return false;
      if (!dentroDoPeriodo(movimento.data, dataDe, dataAte)) return false;
      // A faixa de valor compara o ABSOLUTO: quem digita "de 1.000" quer
      // movimento de mil reais, entrando ou saindo, não só entrada.
      if (!dentroDaFaixaValor(movimento.valor, valorDe, valorAte)) return false;
      if (
        termo !== "" &&
        !`${movimento.numero ?? ""} ${movimento.numeroDocumento ?? ""} ${
          movimento.descricao ?? ""
        } ${movimento.contraparte ?? ""} ${movimento.categoriaNome ?? ""}`
          .toLowerCase()
          .includes(termo)
      ) {
        return false;
      }
      return true;
    });
  }, [movimentos, busca, sentido, dataDe, dataAte, valorDe, valorAte]);

  const soma = React.useMemo(() => somarMovimentos(dados), [dados]);

  const filtrando =
    busca.trim() !== "" ||
    sentido !== "" ||
    dataDe !== "" ||
    dataAte !== "" ||
    valorDe !== "" ||
    valorAte !== "";

  /**
   * Quantos movimentos o escopo "dentro do saldo" deixa de fora, para o seletor
   * poder dizer o tamanho do que está escondido em vez de só oferecer a opção.
   *
   * Vem de `movimentoAnteriorAoCorte`, que é contado no banco e conta as PARCELAS
   * anteriores ao corte. É a mesma contagem que a listagem de contas mostra no
   * `title` da data.
   */
  const anteriores = conta.movimentoAnteriorAoCorte?.parcelas ?? 0;
  const opcoesEscopo = [
    { valor: "saldo", rotulo: "Dentro do saldo atual" },
    {
      valor: ESCOPO_TUDO,
      rotulo:
        anteriores > 0
          ? `Todo o histórico (${anteriores} pagamentos a mais)`
          : "Todo o histórico",
    },
  ];

  const filtros: FiltroConfiguravel[] = [
    {
      id: "busca",
      rotulo: "Busca",
      fixo: true,
      // Entra no "Limpar filtros": sem isto o botão limpa os seletores e deixa o
      // texto da busca filtrando a lista.
      temValor: busca !== "",
      onLimpar: () => mudarBusca(""),
      elemento: (
        <FiltroBusca
          valor={busca}
          onValorChange={mudarBusca}
          placeholder="Buscar por documento, descrição ou quem"
        />
      ),
    },
    {
      id: "escopo",
      rotulo: "Movimento",
      fixo: conta.saldoInicialData !== null,
      // Sem data de corte não existe movimento de fora: o seletor não tem o que
      // oferecer e nasce escondido para não sugerir que há histórico a mais.
      ocultoPorPadrao: conta.saldoInicialData === null,
      temValor: escopoLocal === ESCOPO_TUDO,
      onLimpar: () => mudarEscopo("saldo"),
      elemento: (
        <FiltroSelect
          valor={escopoLocal}
          onValorChange={mudarEscopo}
          opcoes={opcoesEscopo}
          obrigatorio
          className="w-[13rem]"
        />
      ),
    },
    {
      id: "sentido",
      rotulo: "Entrada ou saída",
      temValor: sentido !== "",
      onLimpar: () => mudarSentido(""),
      elemento: (
        <FiltroSelect
          valor={sentido}
          onValorChange={mudarSentido}
          opcoes={OPCOES_SENTIDO}
          placeholder="Entrada ou saída"
          todosRotulo="Entradas e saídas"
        />
      ),
    },
    {
      id: "data",
      rotulo: "Período",
      ocultoPorPadrao: true,
      temValor: dataDe !== "" || dataAte !== "",
      onLimpar: () => mudarData("", ""),
      elemento: (
        <FiltroPeriodo
          de={dataDe}
          ate={dataAte}
          onPeriodoChange={mudarData}
          rotulo="Data"
        />
      ),
    },
    {
      id: "valor",
      rotulo: "Faixa de valor",
      ocultoPorPadrao: true,
      temValor: valorDe !== "" || valorAte !== "",
      onLimpar: () => mudarValor("", ""),
      elemento: (
        <FiltroValor de={valorDe} ate={valorAte} onValorChange={mudarValor} />
      ),
    },
  ];

  /**
   * "Limpar filtros" numa escrita só.
   *
   * Obrigatório porque o escopo vive na URL: o laço por filtro do DataTable faria
   * uma escrita de URL por filtro, e cada uma parte do `searchParams` desta
   * renderização, então a segunda desfaria a primeira. Os de sessão são setState
   * independentes e o React agrupa no mesmo render.
   */
  function limparTodos() {
    setBusca("");
    setSentido("");
    setDataDe("");
    setDataAte("");
    setValorDe("");
    setValorAte("");
    zerarPagina();
    setEscopoLocal("saldo");
    set(PARAM_ESCOPO, null);
  }

  return (
    <div className="flex flex-col gap-4">
      <GradeKpis>
        <KPICard
          titulo="Saldo atual"
          valor={<MoneyText valor={conta.saldoAtual} />}
          // Este cartão é o único que NÃO obedece aos filtros: o saldo é da
          // conta, não do recorte. É o mesmo número da coluna "Saldo atual" da
          // listagem de contas, pela mesma função do banco.
          detalhe={
            conta.saldoInicialData
              ? `Extrato de ${formatarData(conta.saldoInicialData)} (${formatarBRL(conta.saldoInicial)}) mais o movimento posterior`
              : "Saldo inicial mais todo o movimento registrado"
          }
        />
        <KPICard
          titulo="Entradas"
          valor={<MoneyText valor={soma.entradas} />}
          detalhe={
            filtrando
              ? "Somadas as linhas filtradas"
              : "Recebimentos e transferências recebidas"
          }
        />
        <KPICard
          titulo="Saídas"
          valor={<MoneyText valor={soma.saidas} />}
          detalhe={
            filtrando
              ? "Somadas as linhas filtradas"
              : "Pagamentos, transferências enviadas e tarifas"
          }
        />
        <KPICard
          titulo="Movimentações"
          valor={dados.length}
          detalhe={
            <>
              Líquido de <MoneyText valor={soma.liquido} /> no período listado
            </>
          }
        />
      </GradeKpis>

      <DataTable
        idTabela="financeiro.contas-bancarias.extrato"
        columns={colunas}
        data={dados}
        filtros={filtros}
        onLimparFiltros={limparTodos}
        pageIndex={paginacao.pageIndex}
        pageSize={paginacao.pageSize}
        onPaginationChange={setPaginacao}
        /*
          Sem `cabecalhoFixo`, igual ao extrato por fornecedor e pelo mesmo
          motivo: a altura padrão da área de rolagem é `calc(100vh - 20rem)`, que
          pressupõe pouca coisa acima da tabela. Aqui há o cabeçalho da conta, a
          frase da data de corte e quatro cartões, então a área rolável passaria
          da viewport e a tela ganharia duas barras de rolagem concorrentes.
        */
        /*
          Clique na linha abre o LANÇAMENTO que gerou o movimento, na mesma aba: o
          extrato já é o detalhe, não há relatório atrás para preservar. Mesmo
          gesto do extrato por fornecedor.

          Transferência e tarifa não têm página de detalhe (a de transferências é
          uma listagem com drawer), então `lancamentoId` é null e a linha não
          clica — melhor não reagir do que levar para uma tela que não é a do
          movimento clicado.
        */
        onRowClick={
          podeVerLancamentos
            ? (movimento) => {
                if (!movimento.lancamentoId) return;
                router.push(`/financeiro/lancamentos/${movimento.lancamentoId}`);
              }
            : undefined
        }
        // Soma do que está FILTRADO, no pé da tabela. Mapa por id de coluna para
        // o total ficar embaixo de "Valor" mesmo se o usuário reordenar as
        // colunas. A coluna "Saldo" fica de fora de propósito: saldo não se soma,
        // e o último acumulado visível não é o saldo da conta quando há filtro.
        rodape={{
          data: `${dados.length} movimento(s)`,
          valorComSinal: <MoneyText valor={soma.liquido} />,
        }}
        emptyState={
          filtrando && movimentos.length > 0 ? (
            <EmptyState
              icone={Filter}
              titulo="Nenhum movimento com esses filtros"
              descricao="Esta conta tem movimento, mas nenhum bate com os filtros escolhidos."
              className="border-none bg-transparent"
            />
          ) : (
            <EmptyState
              icone={Landmark}
              titulo="Nenhum movimento nesta conta"
              descricao={
                conta.saldoInicialData
                  ? `Nada foi pago, recebido ou transferido nesta conta depois de ${formatarData(conta.saldoInicialData)}, a data do extrato de onde o saldo inicial foi lido.`
                  : "Nenhum pagamento, recebimento ou transferência foi registrado nesta conta."
              }
              className="border-none bg-transparent"
            />
          )
        }
      />
    </div>
  );
}
