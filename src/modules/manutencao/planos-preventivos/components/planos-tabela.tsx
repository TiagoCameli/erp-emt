"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardList, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";

import {
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
import { formatarQuantidade } from "@/lib/formatadores";
import { alternarAtivoPlano } from "@/modules/manutencao/planos-preventivos/actions";
import type { PlanoLista } from "@/modules/manutencao/planos-preventivos/queries";
import {
  ROTULO_INTERVALO_TIPO,
  UNIDADE_INTERVALO_TIPO,
  type IntervaloTipo,
} from "@/modules/manutencao/planos-preventivos/schemas";
import { PlanoFormDrawer } from "./plano-form-drawer";

const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
];

/** Resumo "250 h", "10.000 km", "30 dias" de uma atividade. */
function resumoIntervalo(tipo: IntervaloTipo, valor: number): string {
  return `${formatarQuantidade(valor)} ${UNIDADE_INTERVALO_TIPO[tipo]}`;
}

export interface PlanosTabelaProps {
  planos: PlanoLista[];
  podeCriar: boolean;
  podeEditar: boolean;
}

/**
 * Listagem dos modelos de plano: busca por nome, filtro por status, resumo
 * das atividades, criação e edição no drawer, ativar e desativar.
 */
export function PlanosTabela({
  planos,
  podeCriar,
  podeEditar,
}: PlanosTabelaProps) {
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState("ativos");

  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<PlanoLista | null>(null);

  function abrirNovo() {
    setEmEdicao(null);
    setDrawerAberto(true);
  }

  function abrirEdicao(plano: PlanoLista) {
    setEmEdicao(plano);
    setDrawerAberto(true);
  }

  async function aoAlternarAtivo(plano: PlanoLista) {
    const resultado = await alternarAtivoPlano(plano.id, !plano.ativo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(plano.ativo ? "Plano desativado" : "Plano ativado");
  }

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return planos.filter((plano) => {
      if (status === "ativos" && !plano.ativo) return false;
      if (status === "inativos" && plano.ativo) return false;
      if (termo && !plano.nome.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [planos, busca, status]);

  const colunas = React.useMemo<ColumnDef<PlanoLista, unknown>[]>(() => {
    const base: ColumnDef<PlanoLista, unknown>[] = [
      {
        accessorKey: "nome",
        header: "Plano",
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.original.nome}</span>
            {row.original.descricao ? (
              <span className="text-legenda text-muted-foreground">
                {row.original.descricao}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: "atividades",
        header: "Atividades",
        cell: ({ row }) => {
          const atividades = row.original.atividades;
          if (atividades.length === 0) {
            return <span className="text-muted-foreground">Sem atividades</span>;
          }
          return (
            <div className="flex flex-col gap-0.5">
              {atividades.map((atividade) => (
                <span key={atividade.id} className="text-detalhe">
                  {atividade.descricao}
                  <span className="text-muted-foreground">
                    {" · "}
                    {ROTULO_INTERVALO_TIPO[atividade.intervaloTipo]}{" "}
                    {resumoIntervalo(
                      atividade.intervaloTipo,
                      atividade.intervaloValor,
                    )}
                  </span>
                </span>
              ))}
            </div>
          );
        },
      },
      {
        accessorKey: "equipamentos",
        header: "Equipamentos",
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.equipamentos}</span>
        ),
      },
      {
        accessorKey: "ativo",
        header: "Status",
        cell: ({ row }) =>
          row.original.ativo ? (
            <StatusBadge status="aprovado" rotulo="Ativo" />
          ) : (
            <StatusBadge status="rascunho" rotulo="Inativo" />
          ),
      },
    ];

    if (!podeEditar) return base;

    base.push({
      id: "acoes",
      header: "",
      meta: { alinharDireita: true },
      cell: ({ row }) => {
        const plano = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Ações de ${plano.nome}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => abrirEdicao(plano)}>
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => aoAlternarAtivo(plano)}>
                {plano.ativo ? "Desativar" : "Ativar"}
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
      <FilterBar>
        <FiltroBusca
          valor={busca}
          onValorChange={setBusca}
          placeholder="Buscar por nome"
        />
        <FiltroSelect
          valor={status === "todos" ? "" : status}
          onValorChange={(valor) => setStatus(valor === "" ? "todos" : valor)}
          opcoes={OPCOES_STATUS}
          placeholder="Status"
          todosRotulo="Todos"
        />
      </FilterBar>

      <DataTable
        columns={colunas}
        data={dados}
        emptyState={
          <EmptyState
            icone={ClipboardList}
            titulo="Nenhum plano encontrado"
            descricao="Cadastre modelos de plano para atribuir aos equipamentos da frota."
            acao={
              podeCriar ? (
                <Button type="button" size="sm" onClick={abrirNovo}>
                  <Plus />
                  Novo plano
                </Button>
              ) : undefined
            }
          />
        }
      />

      {podeEditar || podeCriar ? (
        <PlanoFormDrawer
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          plano={emEdicao}
        />
      ) : null}
    </>
  );
}
