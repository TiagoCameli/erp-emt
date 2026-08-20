"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";

import {
  CelulaDescricaoCategoria,
  CelulaVazia,
  colunaDinheiro,
  DataTable,
  EmptyState,
  GradeKpis,
  KPICard,
  MoneyText,
  FiltroBusca,
  FiltroMes,
  FiltroPeriodo,
  FiltroSelect,
  FiltroValor,
  StatusBadge,
  type FiltroConfiguravel,
} from "@/components/canonicos";
import { formatarData, formatarMesAno } from "@/lib/formatadores";
import {
  dentroDaFaixaValor,
  dentroDoPeriodo,
  mesmoMesReferencia,
  usePaginacaoCliente,
} from "@/modules/_shared/filtros-cliente";
import {
  STATUS_LANCAMENTO,
  type StatusLancamento,
} from "@/modules/financeiro/_shared/formato";
import { somarAberto } from "@/modules/financeiro/_shared/prazo";
import { seloDoLancamento } from "@/modules/financeiro/_shared/selo-lancamento";
import type { ExtratoLancamento } from "../queries";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";

interface ExtratoFornecedorTabelaProps {
  lancamentos: ExtratoLancamento[];
  /** Sem permissão de ver lançamentos, a linha não clica (levaria a um 404). */
  podeVerLancamentos: boolean;
  /** Nomes dos fornecedores escolhidos, para o cartão dizer de quem é o extrato. */
  fornecedoresEscolhidos: string[];
}

function formatoStatus(status: string): {
  badge: StatusLancamento | string;
  rotulo: string;
} {
  const formato = STATUS_LANCAMENTO[status as StatusLancamento];
  return formato
    ? { badge: formato.badge, rotulo: formato.rotulo }
    : { badge: status, rotulo: status };
}

/**
 * Extrato de lançamentos a pagar do fornecedor: número, descrição com a
 * categoria, status, competência, vencimento e valor. Ordenável e com busca por
 * número ou descrição. O fornecedor em si é escolhido no controle da seção, que
 * recarrega o relatório pela URL.
 */
export function ExtratoFornecedorTabela({
  lancamentos,
  podeVerLancamentos,
  fornecedoresEscolhidos,
}: ExtratoFornecedorTabelaProps) {
  const router = useRouter();
  const colunas = React.useMemo<ColumnDef<ExtratoLancamento, unknown>[]>(
    () => [
      {
        accessorKey: "numero",
        header: "Número",
        size: 120,
        cell: ({ row }) =>
          row.original.numero ? (
            <span className="codigo-doc">{row.original.numero}</span>
          ) : (
            <CelulaVazia />
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
        accessorKey: "status",
        header: "Status",
        size: 140,
        cell: ({ row }) => {
          // Selo pela DÍVIDA, não pela etapa: aprovado com saldo lê "A pagar",
          // com a aprovação num selo menor ao lado. Mesma regra das outras
          // quatro telas, em `_shared/selo-lancamento`.
          const selo = seloDoLancamento(
            row.original.status as StatusLancamento,
            "a_pagar",
            row.original.aberto.total,
          );
          return (
            <div className="flex flex-wrap items-center justify-center gap-1">
              <StatusBadge status={selo.badge} rotulo={selo.rotulo} />
              {selo.etapa ? (
                <StatusBadge status="aprovado" rotulo={selo.etapa} discreto />
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: "mesCompetencia",
        header: "Mês de referência",
        // O rótulo é mais largo que o conteúdo (mm/aaaa): com 150 saía cortado.
        size: 176,
        cell: ({ row }) => formatarMesAno(row.original.mesCompetencia),
      },
      {
        accessorKey: "dataVencimento",
        header: "Vencimento",
        size: 130,
        cell: ({ row }) => formatarData(row.original.dataVencimento),
      },
      colunaDinheiro<ExtratoLancamento>("valor", "Valor"),
    ],
    [],
  );

  // O extrato vem inteiro do servidor, então todos os filtros rodam em memória.
  // Estão declarados em `filtros` (não no `searchKey` da tabela) para aparecerem
  // no menu "Filtros", com a escolha salva junto das colunas do usuário. O
  // fornecedor em si continua no seletor da seção, que recarrega o relatório.
  const { paginacao, setPaginacao, zerarPagina } = usePaginacaoCliente();
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [status, setStatus] = useFiltroSessao("status", "");
  const [mes, setMes] = useFiltroSessao("mes", "");
  const [valorDe, setValorDe] = useFiltroSessao("valorDe", "");
  const [valorAte, setValorAte] = useFiltroSessao("valorAte", "");
  const [vencimentoDe, setVencimentoDe] = useFiltroSessao("vencimentoDe", "");
  const [vencimentoAte, setVencimentoAte] = useFiltroSessao(
    "vencimentoAte",
    "",
  );

  // Trocar filtro volta para a primeira página, senão a pessoa filtra e cai
  // numa página vazia.
  function mudarBusca(valor: string) {
    setBusca(valor);
    zerarPagina();
  }
  function mudarStatus(valor: string) {
    setStatus(valor);
    zerarPagina();
  }
  function mudarMes(valor: string) {
    setMes(valor);
    zerarPagina();
  }
  function mudarValor(de: string, ate: string) {
    setValorDe(de);
    setValorAte(ate);
    zerarPagina();
  }
  function mudarVencimento(de: string, ate: string) {
    setVencimentoDe(de);
    setVencimentoAte(ate);
    zerarPagina();
  }

  // As opções de status saem do próprio extrato: oferecer "Pago" num extrato
  // sem nada pago só devolve tabela vazia.
  const opcoesStatus = React.useMemo(() => {
    const presentes = new Set(
      lancamentos.map((lancamento) => lancamento.status),
    );
    return [...presentes]
      .map((valor) => ({ valor, rotulo: formatoStatus(valor).rotulo }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  }, [lancamentos]);

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return lancamentos.filter((lancamento) => {
      // "A pagar" é situação do dinheiro, não status exato do documento: traz
      // tudo que ainda tem saldo, incluindo o que já foi aprovado. Mesma regra
      // da listagem de Lançamentos (ver `comSaldoAberto` em filtros.ts), senão o
      // mesmo filtro traria conjuntos diferentes nas duas telas.
      if (status === "a_pagar") {
        if (lancamento.aberto.total <= 0) return false;
      } else if (status !== "" && lancamento.status !== status) {
        return false;
      }
      if (!mesmoMesReferencia(lancamento.mesCompetencia, mes)) return false;
      if (!dentroDaFaixaValor(lancamento.valor, valorDe, valorAte))
        return false;
      if (
        !dentroDoPeriodo(lancamento.dataVencimento, vencimentoDe, vencimentoAte)
      ) {
        return false;
      }
      if (
        termo !== "" &&
        !`${lancamento.numero ?? ""} ${lancamento.descricao}`
          .toLowerCase()
          .includes(termo)
      ) {
        return false;
      }
      return true;
    });
  }, [
    lancamentos,
    busca,
    status,
    mes,
    valorDe,
    valorAte,
    vencimentoDe,
    vencimentoAte,
  ]);

  const filtros: FiltroConfiguravel[] = [
    {
      id: "busca",
      rotulo: "Busca",
      fixo: true,
      // Entra no "Limpar filtros": sem isto o botão limpa os seletores e
      // deixa o texto da busca filtrando a lista.
      temValor: busca !== "",
      onLimpar: () => mudarBusca(""),
      elemento: (
        <FiltroBusca
          valor={busca}
          onValorChange={mudarBusca}
          placeholder="Buscar por número ou descrição"
        />
      ),
    },
    {
      id: "status",
      rotulo: "Status",
      ocultoPorPadrao: true,
      temValor: status !== "",
      onLimpar: () => mudarStatus(""),
      elemento: (
        <FiltroSelect
          valor={status}
          onValorChange={mudarStatus}
          opcoes={opcoesStatus}
          placeholder="Status"
          todosRotulo="Todos os status"
        />
      ),
    },
    {
      id: "mes",
      rotulo: "Mês de referência",
      ocultoPorPadrao: true,
      temValor: mes !== "",
      onLimpar: () => mudarMes(""),
      elemento: <FiltroMes valor={mes} onValorChange={mudarMes} />,
    },
    {
      id: "vencimento",
      rotulo: "Período de vencimento",
      ocultoPorPadrao: true,
      temValor: vencimentoDe !== "" || vencimentoAte !== "",
      onLimpar: () => mudarVencimento("", ""),
      elemento: (
        <FiltroPeriodo
          de={vencimentoDe}
          ate={vencimentoAte}
          onPeriodoChange={mudarVencimento}
          rotulo="Vencimento"
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

  const filtrando =
    busca.trim() !== "" ||
    status !== "" ||
    mes !== "" ||
    valorDe !== "" ||
    valorAte !== "" ||
    vencimentoDe !== "" ||
    vencimentoAte !== "";

  /**
   * Resumo dos cartões, somado sobre `dados`: as linhas que SOBRARAM do filtro.
   *
   * Somar aqui, e não no servidor, é o que faz os cartões obedecerem aos filtros
   * da tabela (busca, status, competência, vencimento, faixa de valor), que são
   * client-side. Antes os cartões vinham do servidor com o fornecedor e mais nada,
   * então mudar filtro na tela não mexia neles.
   *
   * E o dinheiro vem do `aberto` de cada linha, que é contado nas PARCELAS: o
   * cartão antigo somava o `valor` do documento com os pagos dentro e chamava de
   * "Total a pagar" (no extrato da EMAM, R$ 2,32 mi contra R$ 271 mil de aberto
   * real, com 12 dos 16 lançamentos pagos).
   */
  const resumo = React.useMemo(
    () => somarAberto(dados.map((lancamento) => lancamento.aberto)),
    [dados],
  );

  const totalPago = React.useMemo(
    () =>
      dados.reduce(
        (soma, lancamento) => soma + Math.round(lancamento.pago * 100),
        0,
      ) / 100,
    [dados],
  );

  const totalDocumentos = React.useMemo(
    () =>
      dados.reduce(
        (soma, lancamento) => soma + Math.round(lancamento.valor * 100),
        0,
      ) / 100,
    [dados],
  );

  const comSaldo = React.useMemo(
    () => dados.filter((lancamento) => lancamento.aberto.total > 0).length,
    [dados],
  );

  return (
    <div className="flex flex-col gap-4">
      <GradeKpis>
        <KPICard
          titulo="Fornecedores"
          valor={
            fornecedoresEscolhidos.length === 0
              ? "Todos"
              : fornecedoresEscolhidos.length
          }
          // Com um ou dois o nome cabe e informa mais que a contagem; daí para
          // cima vira lista longa e o cartão perde a leitura rápida.
          detalhe={
            fornecedoresEscolhidos.length === 0
              ? "Nenhum filtro de fornecedor"
              : fornecedoresEscolhidos.length <= 2
                ? fornecedoresEscolhidos.join(" · ")
                : `${fornecedoresEscolhidos[0]} e mais ${fornecedoresEscolhidos.length - 1}`
          }
        />
        <KPICard
          titulo="A pagar"
          valor={<MoneyText valor={resumo.total} />}
          detalhe={
            comSaldo === 0
              ? "Nada em aberto"
              : `${comSaldo} de ${dados.length} lançamento(s) com saldo`
          }
        />
        <KPICard
          titulo="Pago"
          valor={<MoneyText valor={totalPago} />}
          detalhe="Já saiu da conta, com desconto abatido"
        />
        <KPICard
          titulo="Vencido"
          valor={<MoneyText valor={resumo.vencido} />}
          detalhe={resumo.vencido > 0 ? "Já passou do prazo" : "Nada atrasado"}
        />
        <KPICard
          titulo="Vence em até 7 dias"
          valor={<MoneyText valor={resumo.ate7} />}
          detalhe="Contando de hoje"
        />
        <KPICard
          titulo="Vence em 8 a 30 dias"
          valor={<MoneyText valor={resumo.de8a30} />}
          detalhe="Próximo mês de caixa"
        />
        <KPICard
          titulo="Vence em mais de 30 dias"
          valor={<MoneyText valor={resumo.mais30} />}
          detalhe="Depois dos 30 dias"
        />
        <KPICard
          titulo="Lançamentos"
          valor={dados.length}
          // O total dos documentos (com os pagos dentro) continua à mão, porque é
          // o tamanho da relação com o fornecedor. Só não se chama "a pagar".
          detalhe={
            <>
              <MoneyText valor={totalDocumentos} /> no extrato, pagos incluídos
            </>
          }
        />
      </GradeKpis>

      <DataTable
        idTabela="financeiro.relatorios.extrato-fornecedor"
        columns={colunas}
        data={dados}
        /*
          O extrato é o único relatório que já lista lançamentos em vez de
          agregados, então a interatividade dele não é "abrir a lista": é abrir o
          LANÇAMENTO. Aqui a linha inteira clica (é o gesto da listagem de
          Lançamentos), e na mesma aba, porque não há relatório atrás para
          preservar — a lista já é o detalhe.
        */
        onRowClick={
          podeVerLancamentos
            ? (lancamento) =>
                router.push(`/financeiro/lancamentos/${lancamento.id}`)
            : undefined
        }
        filtros={filtros}
        pageIndex={paginacao.pageIndex}
        pageSize={paginacao.pageSize}
        onPaginationChange={setPaginacao}
      // Soma do que está FILTRADO, no pé da tabela. Mapa por id de coluna para o
      // total ficar embaixo de "Valor" mesmo se o usuário reordenar as colunas.
      rodape={{
        numero: `Total de ${dados.length} lançamento(s)`,
        valor: <MoneyText valor={totalDocumentos} />,
      }}
        emptyState={
          filtrando && lancamentos.length > 0 ? (
            <EmptyState
              titulo="Nenhum lançamento com esses filtros"
              descricao="O extrato tem lançamentos, mas nenhum bate com os filtros escolhidos."
            />
          ) : (
            <EmptyState
              titulo="Sem lançamentos"
              descricao="Nenhum lançamento a pagar para este fornecedor."
            />
          )
        }
      />
    </div>
  );
}
