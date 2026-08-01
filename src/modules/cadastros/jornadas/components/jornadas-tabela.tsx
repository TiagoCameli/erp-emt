"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Clock4, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  FiltroBusca,
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
import {
  horasSemanais,
  resumoHoras,
} from "@/modules/cadastros/jornadas/formato";
import { removerJornada } from "@/modules/cadastros/jornadas/actions";
import type { JornadaLista } from "@/modules/cadastros/jornadas/queries";

type FiltroStatus = "ativos" | "inativos" | "todos";

/** Opções explícitas do filtro; "todos" é o valor vazio do FiltroSelect. */
const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
];

/** "Trabalha nesse dia?" é hora maior que zero no dia. */
const OPCOES_SIM_NAO = [
  { valor: "sim", rotulo: "Sim" },
  { valor: "nao", rotulo: "Não" },
];

/** Casa a resposta "sim"/"nao" do filtro com as horas do dia. */
function casaDiaTrabalhado(escolha: string, horas: number): boolean {
  if (escolha === "") return true;
  return escolha === "sim" ? horas > 0 : horas === 0;
}

export interface JornadasTabelaProps {
  jornadas: JornadaLista[];
  podeEditar: boolean;
  podeExcluir: boolean;
  /** Abre o drawer de edição com a jornada da linha. */
  onEditar: (jornada: JornadaLista) => void;
}

/**
 * Listagem de jornadas com busca por nome, filtros de status, carga semanal e
 * trabalho em sábado e domingo, e ações por linha: editar e excluir (com
 * motivo, via lixeira).
 *
 * A página carrega o catálogo inteiro, então filtrar em memória está correto.
 */
export function JornadasTabela({
  jornadas,
  podeEditar,
  podeExcluir,
  onEditar,
}: JornadasTabelaProps) {
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState<FiltroStatus>("ativos");
  const [horasDe, setHorasDe] = React.useState("");
  const [horasAte, setHorasAte] = React.useState("");
  const [sabado, setSabado] = React.useState("");
  const [domingo, setDomingo] = React.useState("");
  const [excluindo, setExcluindo] = React.useState<JornadaLista | null>(null);

  const filtradas = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const minimo = horasDe === "" ? null : Number(horasDe);
    const maximo = horasAte === "" ? null : Number(horasAte);
    return jornadas.filter((jornada) => {
      if (status === "ativos" && !jornada.ativo) return false;
      if (status === "inativos" && jornada.ativo) return false;
      if (!casaDiaTrabalhado(sabado, jornada.horasSabado)) return false;
      if (!casaDiaTrabalhado(domingo, jornada.horasDomingo)) return false;
      if (minimo !== null || maximo !== null) {
        const semana = horasSemanais(jornada);
        if (minimo !== null && Number.isFinite(minimo) && semana < minimo) {
          return false;
        }
        if (maximo !== null && Number.isFinite(maximo) && semana > maximo) {
          return false;
        }
      }
      if (termo && !jornada.nome.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [jornadas, busca, status, horasDe, horasAte, sabado, domingo]);

  async function aoConfirmarExclusao(motivo?: string) {
    if (!excluindo) return;
    const resultado = await removerJornada(excluindo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Jornada excluída");
    setExcluindo(null);
  }

  const colunas = React.useMemo<ColumnDef<JornadaLista, unknown>[]>(() => {
    const base: ColumnDef<JornadaLista, unknown>[] = [
      {
        accessorKey: "nome",
        header: "Nome",
        size: 320,
        cell: ({ row }) => (
          <span className="font-medium">{row.original.nome}</span>
        ),
      },
      {
        id: "horas",
        header: "Horas",
        size: 200,
        cell: ({ row }) => (
          <span className="text-detalhe">{resumoHoras(row.original)}</span>
        ),
      },
      {
        accessorKey: "ativo",
        header: "Status",
        size: 110,
        cell: ({ row }) =>
          row.original.ativo ? (
            <StatusBadge status="aprovado" rotulo="Ativa" />
          ) : (
            <StatusBadge status="rascunho" rotulo="Inativa" />
          ),
      },
    ];

    if (!podeEditar && !podeExcluir) return base;

    base.push({
      id: "acoes",
      header: "",
      size: 60,
      meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
      cell: ({ row }) => {
        const jornada = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Ações da jornada"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {podeEditar ? (
                <DropdownMenuItem onSelect={() => onEditar(jornada)}>
                  Editar
                </DropdownMenuItem>
              ) : null}
              {podeExcluir ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setExcluindo(jornada)}
                >
                  Excluir
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    });

    return base;
  }, [podeEditar, podeExcluir, onEditar]);

  return (
    <>
      <DataTable
        idTabela="cadastros.jornadas"
        columns={colunas}
        data={filtradas}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca por nome",
            fixo: true,
            elemento: (
              <FiltroBusca
                valor={busca}
                onValorChange={setBusca}
                placeholder="Buscar por nome"
              />
            ),
          },
          {
            id: "status",
            rotulo: "Status",
            temValor: status !== "ativos",
            onLimpar: () => setStatus("ativos"),
            elemento: (
              <FiltroSelect
                valor={status === "todos" ? "" : status}
                onValorChange={(valor) =>
                  setStatus(valor === "" ? "todos" : (valor as FiltroStatus))
                }
                opcoes={OPCOES_STATUS}
                placeholder="Status"
                todosRotulo="Todos"
              />
            ),
          },
          {
            id: "horasSemanais",
            rotulo: "Carga semanal",
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
                rotulo="Horas na semana"
                onValorChange={(novoDe, novoAte) => {
                  setHorasDe(novoDe);
                  setHorasAte(novoAte);
                }}
              />
            ),
          },
          {
            id: "sabado",
            rotulo: "Trabalha no sábado",
            ocultoPorPadrao: true,
            temValor: sabado !== "",
            onLimpar: () => setSabado(""),
            elemento: (
              <FiltroSelect
                valor={sabado}
                onValorChange={setSabado}
                opcoes={OPCOES_SIM_NAO}
                placeholder="Sábado"
                todosRotulo="Sábado: tanto faz"
              />
            ),
          },
          {
            id: "domingo",
            rotulo: "Trabalha no domingo",
            ocultoPorPadrao: true,
            temValor: domingo !== "",
            onLimpar: () => setDomingo(""),
            elemento: (
              <FiltroSelect
                valor={domingo}
                onValorChange={setDomingo}
                opcoes={OPCOES_SIM_NAO}
                placeholder="Domingo"
                todosRotulo="Domingo: tanto faz"
              />
            ),
          },
        ]}
        emptyState={
          <EmptyState
            icone={Clock4}
            titulo="Nenhuma jornada encontrada"
            descricao="Ajuste os filtros ou cadastre uma nova jornada"
            className="border-none bg-transparent"
          />
        }
      />

      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setExcluindo(null);
        }}
        titulo="Excluir jornada"
        descricao={
          excluindo
            ? `A jornada ${excluindo.nome} vai para a lixeira. Você pode restaurá-la depois.`
            : ""
        }
        textoConfirmar="Excluir jornada"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoConfirmarExclusao}
      />
    </>
  );
}
