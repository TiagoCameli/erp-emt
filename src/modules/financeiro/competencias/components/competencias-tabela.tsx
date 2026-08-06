"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarCheck, Filter, Lock, LockOpen } from "lucide-react";
import { toast } from "sonner";

import {
  colunaDinheiro,
  colunaNumero,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FiltroMes,
  FiltroSelect,
  FiltroValor,
  StatusBadge,
  type FiltroConfiguravel,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarBRL, formatarData, formatarMesAno } from "@/lib/formatadores";
import {
  dentroDaFaixaValor,
  mesmoMesReferencia,
  usePaginacaoCliente,
} from "@/modules/financeiro/_shared/filtros-cliente";
import {
  fecharCompetencia,
  reabrirCompetencia,
} from "@/modules/financeiro/competencias/actions";
import type { CompetenciaMes } from "@/modules/financeiro/competencias/queries";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";

export interface CompetenciasTabelaProps {
  competencias: CompetenciaMes[];
  podeFechar: boolean;
  podeReabrir: boolean;
}

const OPCOES_SITUACAO = [
  { valor: "aberta", rotulo: "Abertas" },
  { valor: "fechada", rotulo: "Fechadas" },
];

/** Lançamento incompleto: custo do mês que ainda vai mudar. */
const OPCOES_INCOMPLETOS = [
  { valor: "com", rotulo: "Com incompletos" },
  { valor: "sem", rotulo: "Sem incompletos" },
];

/** Mês fechado que recebeu lançamento depois, ou que foi reaberto. */
const OPCOES_EXCECOES = [
  { valor: "com", rotulo: "Com exceção ou reabertura" },
  { valor: "sem", rotulo: "Sem exceção nem reabertura" },
];

/**
 * Fechamento de competência: um mês por linha, com o custo que está sendo
 * congelado e quantos lançamentos ainda estão incompletos (custo que vai mudar
 * depois). Fechar pede confirmação mostrando o valor; reabrir exige motivo,
 * porque muda número que alguém já olhou.
 */
export function CompetenciasTabela({
  competencias,
  podeFechar,
  podeReabrir,
}: CompetenciasTabelaProps) {
  const router = useRouter();
  const [fechando, setFechando] = React.useState<CompetenciaMes | null>(null);
  const [reabrindo, setReabrindo] = React.useState<CompetenciaMes | null>(null);

  // A lista de meses vem inteira do servidor, então os filtros rodam em memória.
  const { paginacao, setPaginacao, zerarPagina } = usePaginacaoCliente();
  const [mes, setMes] = useFiltroSessao("mes", "");
  const [situacao, setSituacao] = useFiltroSessao("situacao", "");
  const [incompletos, setIncompletos] = useFiltroSessao("incompletos", "");
  const [excecoes, setExcecoes] = useFiltroSessao("excecoes", "");
  const [custoDe, setCustoDe] = useFiltroSessao("custoDe", "");
  const [custoAte, setCustoAte] = useFiltroSessao("custoAte", "");

  // Trocar filtro volta para a primeira página, senão a pessoa filtra e cai
  // numa página vazia.
  function mudarMes(valor: string) {
    setMes(valor);
    zerarPagina();
  }
  function mudarSituacao(valor: string) {
    setSituacao(valor);
    zerarPagina();
  }
  function mudarIncompletos(valor: string) {
    setIncompletos(valor);
    zerarPagina();
  }
  function mudarExcecoes(valor: string) {
    setExcecoes(valor);
    zerarPagina();
  }
  function mudarCusto(de: string, ate: string) {
    setCustoDe(de);
    setCustoAte(ate);
    zerarPagina();
  }

  const dados = React.useMemo(
    () =>
      competencias.filter((competencia) => {
        if (!mesmoMesReferencia(competencia.mes, mes)) return false;
        if (situacao === "aberta" && competencia.fechada) return false;
        if (situacao === "fechada" && !competencia.fechada) return false;
        if (incompletos === "com" && competencia.incompletos === 0) return false;
        if (incompletos === "sem" && competencia.incompletos > 0) return false;
        const temExcecao =
          competencia.excecoes > 0 || competencia.reaberturas > 0;
        if (excecoes === "com" && !temExcecao) return false;
        if (excecoes === "sem" && temExcecao) return false;
        if (!dentroDaFaixaValor(competencia.custo, custoDe, custoAte)) {
          return false;
        }
        return true;
      }),
    [competencias, mes, situacao, incompletos, excecoes, custoDe, custoAte],
  );

  const filtrando =
    mes !== "" ||
    situacao !== "" ||
    incompletos !== "" ||
    excecoes !== "" ||
    custoDe !== "" ||
    custoAte !== "";

  // Filtros declarados na DataTable para entrarem no menu "Filtros", com a
  // escolha salva junto das colunas do usuário. Mês e situação nascem visíveis
  // (são as duas perguntas do fechamento); o resto a pessoa liga no menu.
  const filtros: FiltroConfiguravel[] = [
    {
      id: "mes",
      rotulo: "Mês de referência",
      temValor: mes !== "",
      onLimpar: () => mudarMes(""),
      elemento: <FiltroMes valor={mes} onValorChange={mudarMes} />,
    },
    {
      id: "situacao",
      rotulo: "Situação",
      temValor: situacao !== "",
      onLimpar: () => mudarSituacao(""),
      elemento: (
        <FiltroSelect
          valor={situacao}
          onValorChange={mudarSituacao}
          opcoes={OPCOES_SITUACAO}
          placeholder="Situação"
          todosRotulo="Abertas e fechadas"
        />
      ),
    },
    {
      id: "incompletos",
      rotulo: "Lançamentos incompletos",
      ocultoPorPadrao: true,
      temValor: incompletos !== "",
      onLimpar: () => mudarIncompletos(""),
      elemento: (
        <FiltroSelect
          valor={incompletos}
          onValorChange={mudarIncompletos}
          opcoes={OPCOES_INCOMPLETOS}
          placeholder="Incompletos"
          todosRotulo="Com e sem incompletos"
        />
      ),
    },
    {
      id: "excecoes",
      rotulo: "Exceções e reaberturas",
      ocultoPorPadrao: true,
      temValor: excecoes !== "",
      onLimpar: () => mudarExcecoes(""),
      elemento: (
        <FiltroSelect
          valor={excecoes}
          onValorChange={mudarExcecoes}
          opcoes={OPCOES_EXCECOES}
          placeholder="Exceções"
          todosRotulo="Com e sem exceção"
          className="max-w-56"
        />
      ),
    },
    {
      id: "custo",
      rotulo: "Faixa de custo",
      ocultoPorPadrao: true,
      temValor: custoDe !== "" || custoAte !== "",
      onLimpar: () => mudarCusto("", ""),
      elemento: (
        <FiltroValor
          de={custoDe}
          ate={custoAte}
          onValorChange={mudarCusto}
          rotulo="Custo"
        />
      ),
    },
  ];

  async function aoFechar(mes: CompetenciaMes) {
    const resultado = await fecharCompetencia(mes.mes);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(`Competência ${formatarMesAno(mes.mes)} fechada`);
    router.refresh();
  }

  async function aoReabrir(mes: CompetenciaMes, motivo: string) {
    const resultado = await reabrirCompetencia(mes.mes, motivo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(`Competência ${formatarMesAno(mes.mes)} reaberta`);
    router.refresh();
  }

  const colunas = React.useMemo<ColumnDef<CompetenciaMes, unknown>[]>(() => {
    const base: ColumnDef<CompetenciaMes, unknown>[] = [
      {
        accessorKey: "mes",
        header: "Mês de referência",
        // O rótulo é mais largo que o conteúdo (mm/aaaa): com 150 saía cortado.
        size: 176,
        cell: ({ row }) => (
          <span className="font-medium tabular-nums">
            {formatarMesAno(row.original.mes)}
          </span>
        ),
      },
      {
        accessorKey: "fechada",
        header: "Situação",
        size: 130,
        cell: ({ row }) =>
          row.original.fechada ? (
            <StatusBadge status="aprovado" rotulo="Fechada" />
          ) : (
            <StatusBadge status="rascunho" rotulo="Aberta" />
          ),
      },
      // Dinheiro e contagem pelos helpers canônicos: o alinhamento à direita
      // com tabular-nums vem de lá e não se perde numa edição futura.
      colunaDinheiro<CompetenciaMes>("custo", "Custo do mês", { size: 150 }),
      // 140 e não os 120 de antes: em 120 o próprio cabeçalho "Lançamentos"
      // truncava, porque o rótulo é mais largo que a contagem que ele nomeia.
      colunaNumero<CompetenciaMes>("lancamentos", "Lançamentos", { size: 140 }),
      {
        accessorKey: "incompletos",
        header: "Incompletos",
        size: 140,
        meta: { alinharDireita: true, naoTruncar: true },
        cell: ({ row }) =>
          row.original.incompletos > 0 ? (
            <StatusBadge
              status="rejeitado"
              rotulo={`${row.original.incompletos} incompleto${
                row.original.incompletos > 1 ? "s" : ""
              }`}
            />
          ) : (
            <span className="tabular-nums text-muted-foreground">0</span>
          ),
      },
      {
        id: "excecoes",
        header: "Exceções",
        size: 150,
        meta: { alinharDireita: true, naoTruncar: true },
        cell: ({ row }) =>
          row.original.excecoes > 0 || row.original.reaberturas > 0 ? (
            // Mês fechado que recebeu lançamento ou foi reaberto: o custo dele
            // mudou depois do fechamento, e isso não pode ficar escondido.
            <StatusBadge
              status="pendente_aprovacao"
              rotulo={[
                row.original.excecoes > 0
                  ? `${row.original.excecoes} exceção${row.original.excecoes > 1 ? "es" : ""}`
                  : null,
                row.original.reaberturas > 0
                  ? `${row.original.reaberturas} reabertura${row.original.reaberturas > 1 ? "s" : ""}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "fechamento",
        header: "Fechada por",
        size: 220,
        cell: ({ row }) =>
          row.original.fechada ? (
            <span className="text-legenda text-muted-foreground">
              {row.original.fechadoPorNome ?? "-"}
              {row.original.fechadoEm
                ? ` · ${formatarData(row.original.fechadoEm)}`
                : ""}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
    ];

    if (!podeFechar && !podeReabrir) return base;

    base.push({
      id: "acoes",
      header: "",
      size: 130,
      meta: { alinharDireita: true, fixa: true, rotulo: "Ações", naoTruncar: true },
      cell: ({ row }) => {
        const mes = row.original;
        if (mes.fechada) {
          return podeReabrir ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setReabrindo(mes)}
            >
              <LockOpen />
              Reabrir
            </Button>
          ) : null;
        }
        return podeFechar ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFechando(mes)}
          >
            <Lock />
            Fechar
          </Button>
        ) : null;
      },
    });

    return base;
  }, [podeFechar, podeReabrir]);

  return (
    <>
      <DataTable
        idTabela="financeiro.competencias"
        columns={colunas}
        data={dados}
        filtros={filtros}
        pageIndex={paginacao.pageIndex}
        pageSize={paginacao.pageSize}
        onPaginationChange={setPaginacao}
        emptyState={
          filtrando && competencias.length > 0 ? (
            <EmptyState
              icone={Filter}
              titulo="Nenhum mês com esses filtros"
              descricao="Existem meses na lista, mas nenhum bate com os filtros escolhidos."
              className="border-none bg-transparent"
            />
          ) : (
            <EmptyState
              icone={CalendarCheck}
              titulo="Nenhum mês para mostrar"
              descricao="Os meses aparecem aqui conforme houver lançamentos."
              className="border-none bg-transparent"
            />
          )
        }
      />

      <ConfirmDialog
        aberto={fechando !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setFechando(null);
        }}
        titulo={`Fechar ${fechando ? formatarMesAno(fechando.mes) : ""}`}
        descricao={
          fechando
            ? `Vai congelar ${formatarBRL(fechando.custo)} de custo em ${
                fechando.lancamentos
              } lançamento(s).${
                fechando.incompletos > 0
                  ? ` Atenção: ${fechando.incompletos} lançamento(s) deste mês ainda estão incompletos, e o custo deles vai entrar depois pela exceção.`
                  : ""
              } Depois de fechar, lançar neste mês exige reabrir a competência.`
            : ""
        }
        textoConfirmar="Fechar competência"
        onConfirmar={async () => {
          if (fechando) await aoFechar(fechando);
          setFechando(null);
        }}
      />

      <ConfirmDialog
        aberto={reabrindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setReabrindo(null);
        }}
        titulo={`Reabrir ${reabrindo ? formatarMesAno(reabrindo.mes) : ""}`}
        descricao="Reabrir permite lançar de novo neste mês, o que muda o custo já apurado. Informe o motivo: ele fica registrado na auditoria."
        textoConfirmar="Reabrir competência"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={async (motivo) => {
          if (reabrindo) await aoReabrir(reabrindo, motivo ?? "");
          setReabrindo(null);
        }}
      />
    </>
  );
}
