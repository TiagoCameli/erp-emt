"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Palmtree, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  FilterBar,
  FiltroBusca,
  FiltroSelect,
  StatusBadge,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatarData } from "@/lib/formatadores";
import { removerFerias } from "@/modules/rh/ferias/actions";
import type {
  FeriasLista,
  SituacaoFerias,
} from "@/modules/rh/ferias/queries";
import { ROTULO_STATUS_FERIAS } from "@/modules/rh/ferias/schemas";
import type { ColaboradorOpcao } from "@/modules/rh/_shared/queries";
import { FeriasFormDrawer } from "./ferias-form-drawer";

export interface FeriasTabelaProps {
  ferias: FeriasLista[];
  colaboradores: ColaboradorOpcao[];
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
}

/** Mapeia a situação no status do badge e no rótulo pt-BR. */
const SITUACAO_BADGE: Record<
  SituacaoFerias,
  { status: "rejeitado" | "pendente_aprovacao" | "aprovado"; rotulo: string }
> = {
  vencida: { status: "rejeitado", rotulo: "Vencida" },
  a_vencer: { status: "pendente_aprovacao", rotulo: "A vencer" },
  ok: { status: "aprovado", rotulo: "Em dia" },
  gozada: { status: "aprovado", rotulo: "Gozada" },
};

const OPCOES_SITUACAO = [
  { valor: "vencida", rotulo: "Vencidas" },
  { valor: "a_vencer", rotulo: "A vencer" },
  { valor: "ok", rotulo: "Em dia" },
  { valor: "gozada", rotulo: "Gozadas" },
];

/**
 * Listagem de férias: busca por colaborador, filtro por situação, criação,
 * edição e exclusão no drawer. Mostra a situação calculada na leitura (limite
 * de gozo = fim do período aquisitivo + 12 meses).
 */
export function FeriasTabela({
  ferias,
  colaboradores,
  podeCriar,
  podeEditar,
  podeExcluir,
}: FeriasTabelaProps) {
  const [busca, setBusca] = React.useState("");
  const [situacao, setSituacao] = React.useState("");

  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<FeriasLista | null>(null);

  const [confirmarAberto, setConfirmarAberto] = React.useState(false);
  const [aExcluir, setAExcluir] = React.useState<FeriasLista | null>(null);

  function abrirNovo() {
    setEmEdicao(null);
    setDrawerAberto(true);
  }

  function abrirEdicao(registro: FeriasLista) {
    setEmEdicao(registro);
    setDrawerAberto(true);
  }

  function pedirExclusao(registro: FeriasLista) {
    setAExcluir(registro);
    setConfirmarAberto(true);
  }

  async function confirmarExclusao() {
    if (!aExcluir) return;
    const resultado = await removerFerias(aExcluir.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Férias excluídas");
  }

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return ferias.filter((item) => {
      if (situacao && item.situacao !== situacao) return false;
      if (termo && !item.colaboradorNome.toLowerCase().includes(termo)) {
        return false;
      }
      return true;
    });
  }, [ferias, busca, situacao]);

  const podeAgir = podeEditar || podeExcluir;

  const colunas = React.useMemo<ColumnDef<FeriasLista, unknown>[]>(() => {
    const base: ColumnDef<FeriasLista, unknown>[] = [
      {
        accessorKey: "colaboradorNome",
        header: "Colaborador",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.colaboradorNome}</span>
        ),
      },
      {
        id: "periodoAquisitivo",
        header: "Período aquisitivo",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarData(row.original.periodoAquisitivoInicio)} a{" "}
            {formatarData(row.original.periodoAquisitivoFim)}
          </span>
        ),
      },
      {
        id: "gozo",
        header: "Gozo",
        cell: ({ row }) =>
          row.original.dataInicio ? (
            <span className="tabular-nums">
              {formatarData(row.original.dataInicio)}
              {row.original.dataFim
                ? ` a ${formatarData(row.original.dataFim)}`
                : ""}
            </span>
          ) : (
            <span className="text-muted-foreground">A programar</span>
          ),
      },
      {
        accessorKey: "dias",
        header: "Dias",
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.dias}</span>
        ),
      },
      {
        accessorKey: "limiteGozo",
        header: "Limite de gozo",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarData(row.original.limiteGozo)}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <span>{ROTULO_STATUS_FERIAS[row.original.status]}</span>
        ),
      },
      {
        accessorKey: "situacao",
        header: "Situação",
        cell: ({ row }) => {
          const config = SITUACAO_BADGE[row.original.situacao];
          return <StatusBadge status={config.status} rotulo={config.rotulo} />;
        },
      },
    ];

    if (!podeAgir) return base;

    base.push({
      id: "acoes",
      header: "",
      meta: { alinharDireita: true },
      cell: ({ row }) => {
        const registro = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Ações de ${registro.colaboradorNome}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {podeEditar ? (
                <DropdownMenuItem onSelect={() => abrirEdicao(registro)}>
                  Editar
                </DropdownMenuItem>
              ) : null}
              {podeExcluir ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => pedirExclusao(registro)}
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
  }, [podeAgir, podeEditar, podeExcluir]);

  return (
    <>
      <FilterBar>
        <FiltroBusca
          valor={busca}
          onValorChange={setBusca}
          placeholder="Buscar por colaborador"
        />
        <FiltroSelect
          valor={situacao}
          onValorChange={setSituacao}
          opcoes={OPCOES_SITUACAO}
          placeholder="Situação"
          todosRotulo="Todas as situações"
        />
      </FilterBar>

      <DataTable
        columns={colunas}
        data={dados}
        emptyState={
          <EmptyState
            icone={Palmtree}
            titulo="Nenhuma férias encontrada"
            descricao="Registre os períodos aquisitivos e o gozo de férias por colaborador. O sistema alerta sobre férias vencidas e a vencer."
            acao={
              podeCriar ? (
                <Button type="button" size="sm" onClick={abrirNovo}>
                  <Plus />
                  Nova férias
                </Button>
              ) : undefined
            }
          />
        }
      />

      {podeEditar || podeCriar ? (
        <FeriasFormDrawer
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          colaboradores={colaboradores}
          ferias={emEdicao}
        />
      ) : null}

      {podeExcluir ? (
        <ConfirmDialog
          aberto={confirmarAberto}
          onAbertoChange={setConfirmarAberto}
          titulo="Excluir férias"
          descricao={
            aExcluir
              ? `Excluir as férias de ${aExcluir.colaboradorNome}? Essa ação não pode ser desfeita.`
              : ""
          }
          textoConfirmar="Excluir"
          variante="destrutivo"
          onConfirmar={confirmarExclusao}
        />
      ) : null}
    </>
  );
}
