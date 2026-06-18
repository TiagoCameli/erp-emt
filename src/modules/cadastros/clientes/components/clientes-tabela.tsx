"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, MoreHorizontal } from "lucide-react";
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
import {
  alternarAtivo,
  excluir,
} from "@/modules/cadastros/clientes/actions";
import type { ClienteLista } from "@/modules/cadastros/clientes/queries";
import { ClientesFormDrawer } from "./clientes-form-drawer";

type FiltroStatus = "ativos" | "inativos" | "todos";

/** Opções do filtro de status. "ativos" é o padrão (valor vazio do select). */
const OPCOES_STATUS = [
  { valor: "inativos", rotulo: "Inativos" },
  { valor: "todos", rotulo: "Todos" },
];

function rotuloTipo(tipo: string): string {
  return tipo === "pf" ? "Pessoa física" : "Pessoa jurídica";
}

export interface ClientesTabelaProps {
  clientes: ClienteLista[];
  podeEditar: boolean;
  podeExcluir: boolean;
}

/**
 * Listagem de clientes com busca por nome, filtro de status e ações de
 * linha (editar, ativar/desativar, excluir). A criação fica no PageHeader.
 */
export function ClientesTabela({
  clientes,
  podeEditar,
  podeExcluir,
}: ClientesTabelaProps) {
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState<FiltroStatus>("ativos");

  const [edicaoCliente, setEdicaoCliente] = React.useState<ClienteLista | null>(
    null,
  );
  const [drawerAberto, setDrawerAberto] = React.useState(false);

  const [exclusaoCliente, setExclusaoCliente] =
    React.useState<ClienteLista | null>(null);
  const [exclusaoAberta, setExclusaoAberta] = React.useState(false);

  const filtrados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return clientes.filter((cliente) => {
      if (status === "ativos" && !cliente.ativo) return false;
      if (status === "inativos" && cliente.ativo) return false;
      if (termo.length > 0 && !cliente.nome.toLowerCase().includes(termo)) {
        return false;
      }
      return true;
    });
  }, [clientes, busca, status]);

  function abrirEdicao(cliente: ClienteLista) {
    setEdicaoCliente(cliente);
    setDrawerAberto(true);
  }

  async function alternar(cliente: ClienteLista) {
    const resultado = await alternarAtivo(cliente.id, !cliente.ativo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(cliente.ativo ? "Cliente desativado" : "Cliente reativado");
  }

  function abrirExclusao(cliente: ClienteLista) {
    setExclusaoCliente(cliente);
    setExclusaoAberta(true);
  }

  async function confirmarExclusao(motivo?: string) {
    if (!exclusaoCliente) return;
    const resultado = await excluir(exclusaoCliente.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Cliente excluído");
  }

  const colunas = React.useMemo<ColumnDef<ClienteLista, unknown>[]>(() => {
    const base: ColumnDef<ClienteLista, unknown>[] = [
      {
        accessorKey: "nome",
        header: "Nome",
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.original.nome}</span>
            {row.original.nomeFantasia ? (
              <span className="text-legenda text-muted-foreground">
                {row.original.nomeFantasia}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "tipo",
        header: "Tipo",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {rotuloTipo(row.original.tipo)}
          </span>
        ),
      },
      {
        accessorKey: "cpfCnpj",
        header: "CPF/CNPJ",
        cell: ({ row }) =>
          row.original.cpfCnpj ? (
            <span className="codigo-doc tabular-nums">
              {row.original.cpfCnpj}
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        accessorKey: "cidade",
        header: "Cidade",
        cell: ({ row }) => {
          const { cidade, uf } = row.original;
          if (!cidade && !uf) {
            return <span className="text-muted-foreground">-</span>;
          }
          return <span>{[cidade, uf].filter(Boolean).join(", ")}</span>;
        },
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
        const cliente = row.original;
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Ações do cliente"
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {podeEditar ? (
                  <>
                    <DropdownMenuItem onSelect={() => abrirEdicao(cliente)}>
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void alternar(cliente)}>
                      {cliente.ativo ? "Desativar" : "Reativar"}
                    </DropdownMenuItem>
                  </>
                ) : null}
                {podeExcluir ? (
                  <>
                    {podeEditar ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => abrirExclusao(cliente)}
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
          valor={status === "ativos" ? "" : status}
          onValorChange={(valor) =>
            setStatus((valor === "" ? "ativos" : valor) as FiltroStatus)
          }
          opcoes={OPCOES_STATUS}
          placeholder="Status"
          todosRotulo="Ativos"
        />
      </FilterBar>

      <DataTable
        columns={colunas}
        data={filtrados}
        emptyState={
          <EmptyState
            icone={Building2}
            titulo="Nenhum cliente encontrado"
            descricao="Cadastre o primeiro órgão ou empresa contratante"
            className="border-none bg-transparent"
          />
        }
      />

      {podeEditar ? (
        <ClientesFormDrawer
          aberto={drawerAberto}
          onAbertoChange={(aberto) => {
            setDrawerAberto(aberto);
            if (!aberto) setEdicaoCliente(null);
          }}
          cliente={edicaoCliente}
        />
      ) : null}

      {podeExcluir ? (
        <ConfirmDialog
          aberto={exclusaoAberta}
          onAbertoChange={(aberto) => {
            setExclusaoAberta(aberto);
            if (!aberto) setExclusaoCliente(null);
          }}
          titulo="Excluir cliente"
          descricao={`O cliente ${
            exclusaoCliente?.nome ?? ""
          } vai para a lixeira. Registros em uso não podem ser excluídos, desative-os no lugar.`}
          textoConfirmar="Excluir cliente"
          variante="destrutivo"
          exigeMotivo
          onConfirmar={confirmarExclusao}
        />
      ) : null}
    </>
  );
}
