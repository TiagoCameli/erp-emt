"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { MapPin, MoreHorizontal } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  ConfirmDialog,
  DataTable,
  EmptyState,
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
import { alternarAtivo, excluir } from "@/modules/cadastros/localidades/actions";
import type { LocalidadeLista } from "@/modules/cadastros/localidades/queries";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";

type FiltroStatus = "ativos" | "inativos" | "todos";

const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativas" },
  { valor: "inativos", rotulo: "Inativas" },
];

export interface LocalidadesTabelaProps {
  localidades: LocalidadeLista[];
  podeEditar: boolean;
  podeExcluir: boolean;
  onEditar: (localidade: LocalidadeLista) => void;
}

/**
 * Listagem de localidades com busca por nome ou endereço, filtro de status e
 * ações por linha: editar, ativar/desativar e excluir (com motivo, para a lixeira).
 *
 * A página carrega o cadastro inteiro (dezenas de linhas), então filtrar em
 * memória está correto.
 */
export function LocalidadesTabela({
  localidades,
  podeEditar,
  podeExcluir,
  onEditar,
}: LocalidadesTabelaProps) {
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [status, setStatus] = useFiltroSessao<FiltroStatus>("status", "ativos", ["ativos", "inativos", "todos"]);
  const [excluindo, setExcluindo] = React.useState<LocalidadeLista | null>(null);

  const filtradas = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return localidades.filter((localidade) => {
      if (status === "ativos" && !localidade.ativo) return false;
      if (status === "inativos" && localidade.ativo) return false;
      if (
        termo &&
        !localidade.nome.toLowerCase().includes(termo) &&
        !(localidade.endereco ?? "").toLowerCase().includes(termo) &&
        !(localidade.fornecedorNome ?? "").toLowerCase().includes(termo)
      ) {
        return false;
      }
      return true;
    });
  }, [localidades, busca, status]);

  async function aoAlternarAtivo(localidade: LocalidadeLista) {
    const resultado = await alternarAtivo(localidade.id, !localidade.ativo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(localidade.ativo ? "Localidade desativada" : "Localidade reativada");
  }

  async function aoConfirmarExclusao(motivo?: string) {
    if (!excluindo) return;
    const resultado = await excluir(excluindo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Localidade excluída");
    setExcluindo(null);
  }

  const colunas = React.useMemo<ColumnDef<LocalidadeLista, unknown>[]>(() => {
    const base: ColumnDef<LocalidadeLista, unknown>[] = [
      {
        accessorKey: "nome",
        header: "Nome",
        size: 320,
        cell: ({ row }) => (
          <span className="font-medium">{row.original.nome}</span>
        ),
      },
      {
        accessorKey: "endereco",
        header: "Endereço",
        size: 360,
        cell: ({ row }) =>
          row.original.endereco ? (
            row.original.endereco
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "fornecedorNome",
        header: "Pedreira (fornecedor)",
        size: 260,
        cell: ({ row }) =>
          row.original.fornecedorNome ? (
            row.original.fornecedorNome
          ) : (
            <span className="text-muted-foreground">—</span>
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
        const localidade = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Ações da localidade"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {podeEditar ? (
                <>
                  <DropdownMenuItem onSelect={() => onEditar(localidade)}>
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      void aoAlternarAtivo(localidade);
                    }}
                  >
                    {localidade.ativo ? "Desativar" : "Reativar"}
                  </DropdownMenuItem>
                </>
              ) : null}
              {podeExcluir ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setExcluindo(localidade)}
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
        idTabela="cadastros.localidades"
        columns={colunas}
        data={filtradas}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca",
            fixo: true,
            temValor: busca !== "",
            onLimpar: () => setBusca(""),
            elemento: (
              <FiltroBusca
                valor={busca}
                onValorChange={setBusca}
                placeholder="Buscar por nome, endereço ou pedreira"
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
                todosRotulo="Todas"
              />
            ),
          },
        ]}
        emptyState={
          <EmptyState
            icone={MapPin}
            titulo="Nenhuma localidade encontrada"
            descricao="Ajuste os filtros ou cadastre a origem ou o destino de um frete"
            className="border-none bg-transparent"
          />
        }
      />

      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setExcluindo(null);
        }}
        titulo="Excluir localidade"
        descricao={
          excluindo
            ? `A localidade ${excluindo.nome} vai para a lixeira. Você pode restaurá-la depois.`
            : ""
        }
        textoConfirmar="Excluir localidade"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoConfirmarExclusao}
      />
    </>
  );
}
