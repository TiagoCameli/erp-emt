"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarClock, Filter } from "lucide-react";

import {
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
  StatusBadge,
  type FiltroConfiguravel,
  type StatusPadrao,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarData } from "@/lib/formatadores";
import {
  dentroDaFaixaValor,
  dentroDoPeriodo,
  opcoesDeNomes,
  usePaginacaoCliente,
} from "@/modules/financeiro/_shared/filtros-cliente";
import { PagarParcelaDrawer } from "@/modules/financeiro/pagamentos/components/pagar-parcela-drawer";
import type {
  ContaBancariaOpcao,
  ParcelaAprovada,
} from "@/modules/financeiro/pagamentos/queries";
import {
  bucketProgramacao,
  type BucketProgramacao,
  type ResumoProgramados,
} from "@/modules/financeiro/programados/calculo";
import type { ParcelaProgramada } from "@/modules/financeiro/programados/queries";
import { ProgramarDialog } from "./programar-dialog";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";

/** Rótulo + cor (StatusPadrao canônico) de cada bucket da fila. */
const BUCKET_BADGE: Record<
  BucketProgramacao,
  { rotulo: string; status: StatusPadrao }
> = {
  atrasada: { rotulo: "Atrasada", status: "rejeitado" },
  hoje: { rotulo: "Hoje", status: "pendente_aprovacao" },
  proxima: { rotulo: "Próxima", status: "rascunho" },
};

/** Opções do filtro de janela, na mesma regra do badge da coluna Situação. */
const OPCOES_JANELA = [
  { valor: "atrasada", rotulo: "Atrasadas" },
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "proxima", rotulo: "Próximas" },
];

export interface ProgramadosTabelaProps {
  /** Parcelas da fila, já ordenadas pela data efetiva (calculo.ts/queries.ts). */
  parcelas: ParcelaProgramada[];
  resumo: ResumoProgramados;
  /** Hoje em "YYYY-MM-DD" (America/Rio_Branco), calculado no server component. */
  hoje: string;
  contas: ContaBancariaOpcao[];
  /** Permissão de editar em financeiro.programados (programar/reprogramar). */
  podeEditar: boolean;
  /** Permissão de criar em financeiro.pagamentos (o Pagar reusa esse fluxo). */
  podePagar: boolean;
}

/** Converte a parcela programada para o formato que o drawer de pagamento espera. */
function paraParcelaAprovada(parcela: ParcelaProgramada): ParcelaAprovada {
  return {
    id: parcela.id,
    lancamentoId: parcela.lancamentoId,
    lancamentoNumero: parcela.lancamentoNumero,
    numeroParcela: parcela.numeroParcela,
    descricao: parcela.lancamentoDescricao,
    categoriaNome: parcela.categoriaNome,
    fornecedorNome: parcela.fornecedorNome,
    dataVencimento: parcela.dataVencimento,
    dataProgramada: parcela.dataProgramada,
    dataProgramadaOrigem: null,
    valor: parcela.valor,
    aprovadoEm: null,
  };
}

/**
 * Aba Programados: KPIs de atrasado/hoje/próximos 7 dias no topo e a fila de
 * parcelas aprovadas ordenada pela data efetiva, com ação de Pagar (reusa o
 * `PagarParcelaDrawer` de pagamentos/) e Programar/Reprogramar (dialog
 * próprio, um campo de data).
 */
export function ProgramadosTabela({
  parcelas,
  resumo,
  hoje,
  contas,
  podeEditar,
  podePagar,
}: ProgramadosTabelaProps) {
  const router = useRouter();

  const [parcelaPagamento, setParcelaPagamento] =
    React.useState<ParcelaAprovada | null>(null);
  const [drawerPagarAberto, setDrawerPagarAberto] = React.useState(false);

  const [parcelaProgramacao, setParcelaProgramacao] =
    React.useState<ParcelaProgramada | null>(null);
  const [dialogProgramarAberto, setDialogProgramarAberto] =
    React.useState(false);

  function abrirPagamento(parcela: ParcelaProgramada) {
    setParcelaPagamento(paraParcelaAprovada(parcela));
    setDrawerPagarAberto(true);
  }

  function abrirProgramacao(parcela: ParcelaProgramada) {
    setParcelaProgramacao(parcela);
    setDialogProgramarAberto(true);
  }

  const semConta = contas.length === 0;

  // A fila inteira vem do servidor (sem paginação), então todos os filtros
  // rodam em memória. Os KPIs continuam somando a fila toda, não o que sobrou
  // dos filtros: eles respondem "quanto tem para pagar", não "quanto sobrou na
  // tela".
  const { paginacao, setPaginacao, zerarPagina } = usePaginacaoCliente();
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [janela, setJanela] = useFiltroSessao("janela", "");
  const [fornecedor, setFornecedor] = useFiltroSessao("fornecedor", "");
  const [categoria, setCategoria] = useFiltroSessao("categoria", "");
  const [contaId, setContaId] = useFiltroSessao("contaId", "");
  const [valorDe, setValorDe] = useFiltroSessao("valorDe", "");
  const [valorAte, setValorAte] = useFiltroSessao("valorAte", "");
  const [programadaDe, setProgramadaDe] = useFiltroSessao("programadaDe", "");
  const [programadaAte, setProgramadaAte] = useFiltroSessao("programadaAte", "");
  const [vencimentoDe, setVencimentoDe] = useFiltroSessao("vencimentoDe", "");
  const [vencimentoAte, setVencimentoAte] = useFiltroSessao("vencimentoAte", "");

  // Trocar filtro volta para a primeira página, senão a pessoa filtra e cai
  // numa página vazia.
  function mudarBusca(valor: string) {
    setBusca(valor);
    zerarPagina();
  }
  function mudarJanela(valor: string) {
    setJanela(valor);
    zerarPagina();
  }
  function mudarFornecedor(valor: string) {
    setFornecedor(valor);
    zerarPagina();
  }
  function mudarCategoria(valor: string) {
    setCategoria(valor);
    zerarPagina();
  }
  function mudarConta(valor: string) {
    setContaId(valor);
    zerarPagina();
  }
  function mudarValor(de: string, ate: string) {
    setValorDe(de);
    setValorAte(ate);
    zerarPagina();
  }
  function mudarProgramada(de: string, ate: string) {
    setProgramadaDe(de);
    setProgramadaAte(ate);
    zerarPagina();
  }
  function mudarVencimento(de: string, ate: string) {
    setVencimentoDe(de);
    setVencimentoAte(ate);
    zerarPagina();
  }

  // As opções saem da própria fila, não do cadastro: filtro que oferece
  // fornecedor ou conta sem nenhuma parcela só devolve lista vazia.
  const opcoesFornecedor = React.useMemo(
    () => opcoesDeNomes(parcelas.map((parcela) => parcela.fornecedorNome)),
    [parcelas],
  );
  const opcoesCategoria = React.useMemo(
    () => opcoesDeNomes(parcelas.map((parcela) => parcela.categoriaNome)),
    [parcelas],
  );
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

  const filtrando =
    busca.trim() !== "" ||
    janela !== "" ||
    fornecedor !== "" ||
    categoria !== "" ||
    contaId !== "" ||
    valorDe !== "" ||
    valorAte !== "" ||
    programadaDe !== "" ||
    programadaAte !== "" ||
    vencimentoDe !== "" ||
    vencimentoAte !== "";

  const parcelasFiltradas = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return parcelas.filter((parcela) => {
      if (
        termo !== "" &&
        !`${parcela.lancamentoNumero ?? ""} ${parcela.lancamentoDescricao} ${parcela.fornecedorNome}`
          .toLowerCase()
          .includes(termo)
      ) {
        return false;
      }
      if (janela !== "") {
        if (!parcela.dataEfetiva) return false;
        if (bucketProgramacao(parcela.dataEfetiva, hoje) !== janela) {
          return false;
        }
      }
      if (fornecedor !== "" && parcela.fornecedorNome !== fornecedor) {
        return false;
      }
      if (categoria !== "" && (parcela.categoriaNome ?? "") !== categoria) {
        return false;
      }
      if (contaId !== "" && parcela.contaBancariaId !== contaId) return false;
      if (!dentroDaFaixaValor(parcela.valor, valorDe, valorAte)) return false;
      if (!dentroDoPeriodo(parcela.dataEfetiva, programadaDe, programadaAte)) {
        return false;
      }
      if (
        !dentroDoPeriodo(parcela.dataVencimento, vencimentoDe, vencimentoAte)
      ) {
        return false;
      }
      return true;
    });
  }, [
    parcelas,
    busca,
    janela,
    fornecedor,
    categoria,
    contaId,
    valorDe,
    valorAte,
    programadaDe,
    programadaAte,
    vencimentoDe,
    vencimentoAte,
    hoje,
  ]);

  // Declarados em `filtros` (e não numa FilterBar solta) para o menu "Filtros"
  // da tabela aparecer, com a escolha salva junto das colunas do usuário. Só a
  // busca nasce visível: o resto a pessoa liga no menu quando precisa.
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
          placeholder="Buscar por lançamento, descrição ou fornecedor"
        />
      ),
    },
    {
      id: "janela",
      rotulo: "Situação",
      ocultoPorPadrao: true,
      temValor: janela !== "",
      onLimpar: () => mudarJanela(""),
      elemento: (
        <FiltroSelect
          valor={janela}
          onValorChange={mudarJanela}
          opcoes={OPCOES_JANELA}
          placeholder="Situação"
          todosRotulo="Todas as situações"
        />
      ),
    },
    {
      id: "fornecedor",
      rotulo: "Fornecedor",
      ocultoPorPadrao: true,
      temValor: fornecedor !== "",
      onLimpar: () => mudarFornecedor(""),
      elemento: (
        <FiltroSelect
          valor={fornecedor}
          onValorChange={mudarFornecedor}
          opcoes={opcoesFornecedor}
          placeholder="Fornecedor"
          todosRotulo="Todos os fornecedores"
          className="max-w-56"
        />
      ),
    },
    {
      id: "categoria",
      rotulo: "Categoria",
      ocultoPorPadrao: true,
      temValor: categoria !== "",
      onLimpar: () => mudarCategoria(""),
      elemento: (
        <FiltroSelect
          valor={categoria}
          onValorChange={mudarCategoria}
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
      temValor: contaId !== "",
      onLimpar: () => mudarConta(""),
      elemento: (
        <FiltroSelect
          valor={contaId}
          onValorChange={mudarConta}
          opcoes={opcoesConta}
          placeholder="Conta bancária"
          todosRotulo="Todas as contas"
          className="max-w-56"
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
        <FiltroValor
          de={valorDe}
          ate={valorAte}
          onValorChange={mudarValor}
          rotulo="Valor"
        />
      ),
    },
    {
      id: "programada",
      rotulo: "Período programado",
      ocultoPorPadrao: true,
      temValor: programadaDe !== "" || programadaAte !== "",
      onLimpar: () => mudarProgramada("", ""),
      elemento: (
        <FiltroPeriodo
          de={programadaDe}
          ate={programadaAte}
          onPeriodoChange={mudarProgramada}
          rotulo="Programada"
        />
      ),
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
  ];

  const colunas = React.useMemo<ColumnDef<ParcelaProgramada, unknown>[]>(
    () => [
      {
        accessorKey: "fornecedorNome",
        header: "Fornecedor",
      },
      {
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
        accessorKey: "valor",
        header: "Valor",
        meta: { alinharDireita: true },
        cell: ({ row }) => <MoneyText valor={row.original.valor} />,
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
        accessorKey: "dataEfetiva",
        header: "Data programada",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.dataEfetiva
              ? formatarData(row.original.dataEfetiva)
              : "-"}
          </span>
        ),
      },
      {
        id: "bucket",
        header: "Situação",
        cell: ({ row }) => {
          const { dataEfetiva } = row.original;
          if (!dataEfetiva) return null;
          const bucket = BUCKET_BADGE[bucketProgramacao(dataEfetiva, hoje)];
          return <StatusBadge status={bucket.status} rotulo={bucket.rotulo} />;
        },
      },
      {
        id: "acoes",
        header: "",
        meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            {podeEditar ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => abrirProgramacao(row.original)}
              >
                Reprogramar
              </Button>
            ) : null}
            {podePagar ? (
              <Button
                type="button"
                size="sm"
                disabled={semConta}
                onClick={() => abrirPagamento(row.original)}
              >
                Pagar
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [hoje, podeEditar, podePagar, semConta],
  );

  return (
    <div className="flex flex-col gap-4">
      <GradeKpis>
        <KPICard
          titulo="Atrasado"
          valor={<MoneyText valor={resumo.atrasado} />}
          detalhe={`${resumo.quantidade.atrasado} ${resumo.quantidade.atrasado === 1 ? "parcela" : "parcelas"}`}
        />
        <KPICard
          titulo="Hoje"
          valor={<MoneyText valor={resumo.hoje} />}
          detalhe={`${resumo.quantidade.hoje} ${resumo.quantidade.hoje === 1 ? "parcela" : "parcelas"}`}
        />
        <KPICard
          titulo="Próximos 7 dias"
          valor={<MoneyText valor={resumo.proximos7} />}
          detalhe={`${resumo.quantidade.proximos7} ${resumo.quantidade.proximos7 === 1 ? "parcela" : "parcelas"}`}
        />
      </GradeKpis>

      {podePagar && semConta ? (
        <p className="rounded-md border border-border bg-surface px-3 py-2 text-detalhe text-muted-foreground">
          Cadastre uma conta bancária ativa antes de registrar pagamentos.
        </p>
      ) : null}

      <DataTable
        idTabela="financeiro.programados"
        columns={colunas}
        data={parcelasFiltradas}
        filtros={filtros}
        pageIndex={paginacao.pageIndex}
        pageSize={paginacao.pageSize}
        onPaginationChange={setPaginacao}
        emptyState={
          // Fila cheia e nada na tela é filtro, não fila vazia: dizer
          // "nenhum pagamento na fila" aqui seria mentira.
          filtrando && parcelas.length > 0 ? (
            <EmptyState
              icone={Filter}
              titulo="Nenhum pagamento com esses filtros"
              descricao="A fila tem pagamentos, mas nenhum bate com os filtros escolhidos. Limpe os filtros para ver tudo."
              className="border-none bg-transparent"
            />
          ) : (
            <EmptyState
              icone={CalendarClock}
              titulo="Nenhum pagamento na fila"
              descricao="Parcelas aprovadas aparecem aqui, ordenadas pela data programada"
              className="border-none bg-transparent"
            />
          )
        }
      />

      <PagarParcelaDrawer
        aberto={drawerPagarAberto}
        onAbertoChange={setDrawerPagarAberto}
        parcela={parcelaPagamento}
        contas={contas}
        onPago={() => router.refresh()}
      />

      <ProgramarDialog
        aberto={dialogProgramarAberto}
        onAbertoChange={setDialogProgramarAberto}
        parcela={parcelaProgramacao}
        onProgramado={() => router.refresh()}
      />
    </div>
  );
}
