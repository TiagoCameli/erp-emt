"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Percent, MoreHorizontal } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  CelulaVazia,
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
import { formatarPercentual } from "@/lib/formatadores";
import { removerEncargo } from "@/modules/rh/encargos/actions";
import type { EncargoLista } from "@/modules/rh/encargos/queries";
import { naFaixa } from "@/modules/rh/_shared/filtros";
import { filtrarFacetado } from "@/modules/_shared/filtros-facetados";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";

type FiltroStatus = "ativos" | "inativos" | "todos";

/** Opções explícitas do filtro; "todos" é o valor vazio do FiltroSelect. */
const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
];

export interface EncargosTabelaProps {
  encargos: EncargoLista[];
  podeEditar: boolean;
  podeExcluir: boolean;
  /** Abre o drawer de edição com o encargo da linha. */
  onEditar: (encargo: EncargoLista) => void;
}

/**
 * Listagem de encargos da folha com busca por nome, filtro de status e ações
 * por linha: editar e excluir (com motivo, via lixeira).
 */
export function EncargosTabela({
  encargos,
  podeEditar,
  podeExcluir,
  onEditar,
}: EncargosTabelaProps) {
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [status, setStatus] = useFiltroSessao<FiltroStatus>("status", "ativos", ["ativos", "inativos", "todos"]);
  const [percentualDe, setPercentualDe] = useFiltroSessao("percentualDe", "");
  const [percentualAte, setPercentualAte] = useFiltroSessao("percentualAte", "");
  const [excluindo, setExcluindo] = React.useState<EncargoLista | null>(null);

  // Facetado: o status só oferece o que existe na lista filtrada pelos outros
  // (ver `_shared/filtros-facetados`).
  const { linhas: filtrados, opcoes } = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return filtrarFacetado(
      encargos,
      {
        status: {
          selecionados: status === "todos" ? [] : [status],
          casa: (encargo, valor) => (valor === "ativos") === encargo.ativo,
        },
      },
      [
        (encargo) => naFaixa(encargo.percentual, percentualDe, percentualAte),
        (encargo) => !termo || encargo.nome.toLowerCase().includes(termo),
      ],
    );
  }, [encargos, busca, status, percentualDe, percentualAte]);

  async function aoConfirmarExclusao(motivo?: string) {
    if (!excluindo) return;
    const resultado = await removerEncargo(excluindo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Encargo excluído");
    setExcluindo(null);
  }

  const colunas = React.useMemo<ColumnDef<EncargoLista, unknown>[]>(() => {
    const base: ColumnDef<EncargoLista, unknown>[] = [
      {
        accessorKey: "nome",
        header: "Nome",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.nome}</span>
        ),
      },
      {
        accessorKey: "percentual",
        header: "Percentual",
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarPercentual(row.original.percentual, 3)}
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
      {
        accessorKey: "grupoRecolhimento",
        header: "Grupo de recolhimento",
        cell: ({ row }) =>
          row.original.grupoRecolhimento ?? <CelulaVazia />,
      },
    ];

    if (!podeEditar && !podeExcluir) return base;

    base.push({
      id: "acoes",
      header: "",
      meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
      cell: ({ row }) => {
        const encargo = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Ações do encargo"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {podeEditar ? (
                <DropdownMenuItem onSelect={() => onEditar(encargo)}>
                  Editar
                </DropdownMenuItem>
              ) : null}
              {podeExcluir ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setExcluindo(encargo)}
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
        idTabela="rh.encargos"
        columns={colunas}
        data={filtrados}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca por nome",
            fixo: true,
            // Entra no "Limpar filtros": sem isto o botão limpa os seletores e
            // deixa o texto da busca filtrando a lista.
            temValor: busca !== "",
            onLimpar: () => setBusca(""),
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
                opcoes={opcoes("status", OPCOES_STATUS)}
                placeholder="Status"
                todosRotulo="Todos"
              />
            ),
          },
          {
            id: "percentual",
            rotulo: "Percentual",
            ocultoPorPadrao: true,
            temValor: percentualDe !== "" || percentualAte !== "",
            onLimpar: () => {
              setPercentualDe("");
              setPercentualAte("");
            },
            elemento: (
              <FiltroValor
                de={percentualDe}
                ate={percentualAte}
                rotulo="Percentual"
                onValorChange={(de, ate) => {
                  setPercentualDe(de);
                  setPercentualAte(ate);
                }}
              />
            ),
          },
        ]}
        emptyState={
          <EmptyState
            icone={Percent}
            titulo="Nenhum encargo encontrado"
            descricao="Ajuste os filtros ou cadastre um novo encargo"
            className="border-none bg-transparent"
          />
        }
      />

      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setExcluindo(null);
        }}
        titulo="Excluir encargo"
        descricao={
          excluindo
            ? `O encargo ${excluindo.nome} vai para a lixeira. Você pode restaurá-lo depois.`
            : ""
        }
        textoConfirmar="Excluir encargo"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoConfirmarExclusao}
      />
    </>
  );
}
