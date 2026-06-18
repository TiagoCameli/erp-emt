"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Users } from "lucide-react";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatarData } from "@/lib/formatadores";
import {
  alternarAtivo,
  excluir,
} from "@/modules/cadastros/colaboradores/actions";
import type {
  ColaboradorLista,
  OpcaoSelecao,
} from "@/modules/cadastros/colaboradores/queries";
import { ROTULO_VINCULO } from "@/modules/cadastros/colaboradores/schemas";
import { ColaboradoresFormDrawer } from "./colaboradores-form-drawer";

type FiltroStatus = "ativos" | "inativos" | "todos";

// "Todos" é a opção embutida do FiltroSelect (valor vazio); aqui ficam só os
// estados explícitos.
const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
];

export interface ColaboradoresTabelaProps {
  colaboradores: ColaboradorLista[];
  obras: OpcaoSelecao[];
  centrosCusto: OpcaoSelecao[];
  podeEditar: boolean;
  podeExcluir: boolean;
}

/**
 * Listagem de colaboradores com busca por nome, filtro de status, edição
 * em drawer, ativar/desativar e exclusão para a lixeira (com motivo).
 */
export function ColaboradoresTabela({
  colaboradores,
  obras,
  centrosCusto,
  podeEditar,
  podeExcluir,
}: ColaboradoresTabelaProps) {
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState<FiltroStatus>("ativos");

  const [emEdicao, setEmEdicao] = React.useState<ColaboradorLista | null>(null);
  const [edicaoAberta, setEdicaoAberta] = React.useState(false);

  const [aExcluir, setAExcluir] = React.useState<ColaboradorLista | null>(null);
  const [exclusaoAberta, setExclusaoAberta] = React.useState(false);

  function abrirEdicao(colaborador: ColaboradorLista) {
    setEmEdicao(colaborador);
    setEdicaoAberta(true);
  }

  function abrirExclusao(colaborador: ColaboradorLista) {
    setAExcluir(colaborador);
    setExclusaoAberta(true);
  }

  async function aoAlternarAtivo(colaborador: ColaboradorLista) {
    const resultado = await alternarAtivo(colaborador.id, !colaborador.ativo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(colaborador.ativo ? "Colaborador desativado" : "Colaborador reativado");
  }

  async function aoConfirmarExclusao(motivo?: string) {
    if (!aExcluir) return;
    const resultado = await excluir(aExcluir.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Colaborador movido para a lixeira");
    setAExcluir(null);
  }

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return colaboradores.filter((colaborador) => {
      if (status === "ativos" && !colaborador.ativo) return false;
      if (status === "inativos" && colaborador.ativo) return false;
      if (termo && !colaborador.nome.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [colaboradores, busca, status]);

  const colunas = React.useMemo<ColumnDef<ColaboradorLista, unknown>[]>(() => {
    const base: ColumnDef<ColaboradorLista, unknown>[] = [
      {
        accessorKey: "nome",
        header: "Nome",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.nome}</span>
        ),
      },
      {
        accessorKey: "funcao",
        header: "Função",
        cell: ({ row }) =>
          row.original.funcao ?? (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        accessorKey: "vinculo",
        header: "Vínculo",
        cell: ({ row }) => ROTULO_VINCULO[row.original.vinculo],
      },
      {
        accessorKey: "obraNome",
        header: "Obra",
        cell: ({ row }) =>
          row.original.obraNome ?? (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        accessorKey: "dataAdmissao",
        header: "Admissão",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.dataAdmissao
              ? formatarData(row.original.dataAdmissao)
              : "-"}
          </span>
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

    if (!podeEditar && !podeExcluir) return base;

    base.push({
      id: "acoes",
      header: "",
      meta: { alinharDireita: true },
      cell: ({ row }) => {
        const colaborador = row.original;
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Ações do colaborador"
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {podeEditar ? (
                  <>
                    <DropdownMenuItem onSelect={() => abrirEdicao(colaborador)}>
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => void aoAlternarAtivo(colaborador)}
                    >
                      {colaborador.ativo ? "Desativar" : "Reativar"}
                    </DropdownMenuItem>
                  </>
                ) : null}
                {podeExcluir ? (
                  <>
                    {podeEditar ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => abrirExclusao(colaborador)}
                    >
                      Excluir
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    });

    return base;
  }, [podeEditar, podeExcluir]);

  return (
    <>
      <FilterBar>
        <FiltroBusca
          valor={busca}
          onValorChange={setBusca}
          placeholder="Buscar por nome"
        />
        <FiltroSelect
          valor={status}
          onValorChange={(valor) => setStatus((valor || "todos") as FiltroStatus)}
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
            icone={Users}
            titulo="Nenhum colaborador encontrado"
            descricao="Cadastre o primeiro colaborador ou ajuste os filtros"
            className="border-none bg-transparent"
          />
        }
      />

      <ColaboradoresFormDrawer
        key={emEdicao?.id ?? "nenhum"}
        obras={obras}
        centrosCusto={centrosCusto}
        colaborador={emEdicao}
        aberto={edicaoAberta}
        onAbertoChange={setEdicaoAberta}
      />

      <ConfirmDialog
        aberto={exclusaoAberta}
        onAbertoChange={setExclusaoAberta}
        titulo="Excluir colaborador"
        descricao={`Mover ${aExcluir?.nome ?? "o colaborador"} para a lixeira. Informe o motivo da exclusão.`}
        textoConfirmar="Excluir colaborador"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoConfirmarExclusao}
      />
    </>
  );
}
