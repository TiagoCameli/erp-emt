"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Clock, MoreHorizontal, Plus } from "lucide-react";

import {
  CelulaVazia,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroPeriodo,
  FiltroSelect,
  FiltroValor,
  StatusBadge,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatarData, formatarQuantidade } from "@/lib/formatadores";
import type { MovimentoLista } from "@/modules/rh/banco-horas/queries";
import {
  ROTULO_TIPO_MOVIMENTO,
  TIPOS_MOVIMENTO,
} from "@/modules/rh/banco-horas/schemas";
import { naFaixa, noPeriodo } from "@/modules/rh/_shared/filtros";
import type { ColaboradorOpcao } from "@/modules/rh/_shared/queries";
import { MovimentoFormDrawer } from "./movimento-form-drawer";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";

export interface MovimentosTabelaProps {
  movimentos: MovimentoLista[];
  colaboradores: ColaboradorOpcao[];
  podeCriar: boolean;
  podeEditar: boolean;
}

/**
 * Listagem de movimentos do banco de horas: busca por colaborador, filtro por
 * tipo, criação e edição no drawer. Não há exclusão neste recurso.
 */
export function MovimentosTabela({
  movimentos,
  colaboradores,
  podeCriar,
  podeEditar,
}: MovimentosTabelaProps) {
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [tipo, setTipo] = useFiltroSessao("tipo", "");
  const [colaboradorId, setColaboradorId] = useFiltroSessao("colaboradorId", "");
  const [dataDe, setDataDe] = useFiltroSessao("dataDe", "");
  const [dataAte, setDataAte] = useFiltroSessao("dataAte", "");
  const [horasDe, setHorasDe] = useFiltroSessao("horasDe", "");
  const [horasAte, setHorasAte] = useFiltroSessao("horasAte", "");

  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<MovimentoLista | null>(null);

  function abrirNovo() {
    setEmEdicao(null);
    setDrawerAberto(true);
  }

  function abrirEdicao(movimento: MovimentoLista) {
    setEmEdicao(movimento);
    setDrawerAberto(true);
  }

  const opcoesTipo = React.useMemo(
    () =>
      TIPOS_MOVIMENTO.map((t) => ({
        valor: t,
        rotulo: ROTULO_TIPO_MOVIMENTO[t],
      })),
    [],
  );

  // Filtro em memória: a tela carrega todos os movimentos (sem paginação
  // server-side), então o total exibido continua sendo o total real.
  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return movimentos.filter((item) => {
      if (tipo && item.tipo !== tipo) return false;
      if (colaboradorId && item.colaboradorId !== colaboradorId) return false;
      if (!noPeriodo(item.data, dataDe, dataAte)) return false;
      if (!naFaixa(item.horas, horasDe, horasAte)) return false;
      if (termo && !item.colaboradorNome.toLowerCase().includes(termo)) {
        return false;
      }
      return true;
    });
  }, [
    movimentos,
    busca,
    tipo,
    colaboradorId,
    dataDe,
    dataAte,
    horasDe,
    horasAte,
  ]);

  const colunas = React.useMemo<ColumnDef<MovimentoLista, unknown>[]>(() => {
    const base: ColumnDef<MovimentoLista, unknown>[] = [
      {
        accessorKey: "colaboradorNome",
        header: "Colaborador",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.colaboradorNome}</span>
        ),
      },
      {
        accessorKey: "data",
        header: "Data",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarData(row.original.data)}
          </span>
        ),
      },
      {
        accessorKey: "tipo",
        header: "Tipo",
        cell: ({ row }) =>
          row.original.tipo === "credito" ? (
            <StatusBadge status="aprovado" rotulo="Crédito" />
          ) : (
            <StatusBadge status="pendente_aprovacao" rotulo="Débito" />
          ),
      },
      {
        accessorKey: "horas",
        header: "Horas",
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarQuantidade(row.original.horas)} h
          </span>
        ),
      },
      {
        accessorKey: "motivo",
        header: "Motivo",
        cell: ({ row }) => row.original.motivo ?? <CelulaVazia />,
      },
    ];

    if (!podeEditar) return base;

    base.push({
      id: "acoes",
      header: "",
      meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
      cell: ({ row }) => {
        const movimento = row.original;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Ações do movimento de ${movimento.colaboradorNome}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => abrirEdicao(movimento)}>
                Editar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    });

    return base;
  }, [podeEditar]);

  return (
    <>
      <DataTable
        idTabela="rh.banco-horas.movimentos"
        columns={colunas}
        data={dados}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca por colaborador",
            fixo: true,
            elemento: (
              <FiltroBusca
                valor={busca}
                onValorChange={setBusca}
                placeholder="Buscar por colaborador"
              />
            ),
          },
          {
            id: "tipo",
            rotulo: "Tipo",
            temValor: tipo !== "",
            onLimpar: () => setTipo(""),
            elemento: (
              <FiltroSelect
                valor={tipo}
                onValorChange={setTipo}
                opcoes={opcoesTipo}
                placeholder="Tipo"
                todosRotulo="Todos os tipos"
              />
            ),
          },
          {
            id: "colaborador",
            rotulo: "Colaborador",
            ocultoPorPadrao: true,
            temValor: colaboradorId !== "",
            onLimpar: () => setColaboradorId(""),
            elemento: (
              <FiltroSelect
                valor={colaboradorId}
                onValorChange={setColaboradorId}
                opcoes={colaboradores.map((colaborador) => ({
                  valor: colaborador.id,
                  rotulo: colaborador.nome,
                }))}
                placeholder="Colaborador"
                todosRotulo="Todos os colaboradores"
                className="max-w-56"
              />
            ),
          },
          {
            id: "periodo",
            rotulo: "Período do movimento",
            ocultoPorPadrao: true,
            temValor: dataDe !== "" || dataAte !== "",
            onLimpar: () => {
              setDataDe("");
              setDataAte("");
            },
            elemento: (
              <FiltroPeriodo
                de={dataDe}
                ate={dataAte}
                rotulo="Data"
                onPeriodoChange={(de, ate) => {
                  setDataDe(de);
                  setDataAte(ate);
                }}
              />
            ),
          },
          {
            id: "horas",
            rotulo: "Horas",
            ocultoPorPadrao: true,
            temValor: horasDe !== "" || horasAte !== "",
            onLimpar: () => {
              setHorasDe("");
              setHorasAte("");
            },
            elemento: (
              <FiltroValor
                de={horasDe}
                ate={horasAte}
                rotulo="Horas"
                onValorChange={(de, ate) => {
                  setHorasDe(de);
                  setHorasAte(ate);
                }}
              />
            ),
          },
        ]}
        emptyState={
          <EmptyState
            icone={Clock}
            titulo="Nenhum movimento encontrado"
            descricao="Registre créditos e débitos de horas por colaborador. O saldo é calculado no painel acima."
            acao={
              podeCriar ? (
                <Button type="button" size="sm" onClick={abrirNovo}>
                  <Plus />
                  Novo movimento
                </Button>
              ) : undefined
            }
          />
        }
      />

      {podeEditar || podeCriar ? (
        <MovimentoFormDrawer
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          colaboradores={colaboradores}
          movimento={emEdicao}
        />
      ) : null}
    </>
  );
}
