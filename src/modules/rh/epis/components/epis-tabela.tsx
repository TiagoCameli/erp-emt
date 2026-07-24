"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { HardHat, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  FilterBar,
  FiltroBusca,
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
import type { AnexoResumo } from "@/modules/compras/_shared/anexos-actions";
import { removerEpi } from "@/modules/rh/epis/actions";
import type { EpiLista } from "@/modules/rh/epis/queries";
import type { ColaboradorOpcao } from "@/modules/rh/_shared/queries";
import { EpiFormDrawer } from "./epi-form-drawer";

export interface EpisTabelaProps {
  epis: EpiLista[];
  colaboradores: ColaboradorOpcao[];
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
  /** Anexos por EPI, pré-carregados no server, chaveados por id. */
  anexosPorRegistro: Record<string, AnexoResumo[]>;
}

/**
 * Listagem de EPIs: busca por colaborador, criação, edição e exclusão no
 * drawer. Mostra o termo de entrega assinado como badge sim/não.
 */
export function EpisTabela({
  epis,
  colaboradores,
  podeCriar,
  podeEditar,
  podeExcluir,
  anexosPorRegistro,
}: EpisTabelaProps) {
  const [busca, setBusca] = React.useState("");

  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<EpiLista | null>(null);

  const [confirmarAberto, setConfirmarAberto] = React.useState(false);
  const [aExcluir, setAExcluir] = React.useState<EpiLista | null>(null);

  function abrirNovo() {
    setEmEdicao(null);
    setDrawerAberto(true);
  }

  function abrirEdicao(registro: EpiLista) {
    setEmEdicao(registro);
    setDrawerAberto(true);
  }

  function pedirExclusao(registro: EpiLista) {
    setAExcluir(registro);
    setConfirmarAberto(true);
  }

  async function confirmarExclusao() {
    if (!aExcluir) return;
    const resultado = await removerEpi(aExcluir.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("EPI excluído");
  }

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return epis;
    return epis.filter((item) =>
      item.colaboradorNome.toLowerCase().includes(termo),
    );
  }, [epis, busca]);

  const podeAgir = podeEditar || podeExcluir;

  const colunas = React.useMemo<ColumnDef<EpiLista, unknown>[]>(() => {
    const base: ColumnDef<EpiLista, unknown>[] = [
      {
        accessorKey: "colaboradorNome",
        header: "Colaborador",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.colaboradorNome}</span>
        ),
      },
      {
        accessorKey: "descricao",
        header: "EPI",
        cell: ({ row }) => <span>{row.original.descricao}</span>,
      },
      {
        accessorKey: "ca",
        header: "CA",
        cell: ({ row }) =>
          row.original.ca ? (
            <span className="tabular-nums">{row.original.ca}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        accessorKey: "quantidade",
        header: "Qtd",
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarQuantidade(row.original.quantidade)}
          </span>
        ),
      },
      {
        accessorKey: "dataEntrega",
        header: "Entrega",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarData(row.original.dataEntrega)}
          </span>
        ),
      },
      {
        accessorKey: "dataDevolucao",
        header: "Devolução",
        cell: ({ row }) =>
          row.original.dataDevolucao ? (
            <span className="tabular-nums">
              {formatarData(row.original.dataDevolucao)}
            </span>
          ) : (
            <span className="text-muted-foreground">Em uso</span>
          ),
      },
      {
        accessorKey: "assinado",
        header: "Termo assinado",
        cell: ({ row }) =>
          row.original.assinado ? (
            <StatusBadge status="aprovado" rotulo="Sim" />
          ) : (
            <StatusBadge status="pendente_aprovacao" rotulo="Não" />
          ),
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
      </FilterBar>

      <DataTable
        columns={colunas}
        data={dados}
        emptyState={
          <EmptyState
            icone={HardHat}
            titulo="Nenhum EPI encontrado"
            descricao="Registre a entrega de EPIs por colaborador, com CA, quantidade e o termo assinado."
            acao={
              podeCriar ? (
                <Button type="button" size="sm" onClick={abrirNovo}>
                  <Plus />
                  Novo EPI
                </Button>
              ) : undefined
            }
          />
        }
      />

      {podeEditar || podeCriar ? (
        <EpiFormDrawer
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          colaboradores={colaboradores}
          epi={emEdicao}
          podeEditar={podeEditar}
          anexosIniciais={emEdicao ? anexosPorRegistro[emEdicao.id] : undefined}
        />
      ) : null}

      {podeExcluir ? (
        <ConfirmDialog
          aberto={confirmarAberto}
          onAbertoChange={setConfirmarAberto}
          titulo="Excluir EPI"
          descricao={
            aExcluir
              ? `Excluir o EPI "${aExcluir.descricao}" de ${aExcluir.colaboradorNome}? Essa ação não pode ser desfeita.`
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
