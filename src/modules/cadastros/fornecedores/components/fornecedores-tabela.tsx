"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Truck } from "lucide-react";
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
} from "@/modules/cadastros/fornecedores/actions";
import type { FornecedorLista } from "@/modules/cadastros/fornecedores/queries";
import { ROTULO_TIPO } from "@/modules/cadastros/fornecedores/schemas";
import { FornecedoresFormDrawer } from "./fornecedores-form-drawer";

type FiltroStatus = "ativos" | "inativos" | "todos";

const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
  { valor: "todos", rotulo: "Todos" },
];

function StatusFornecedor({ ativo }: { ativo: boolean }) {
  return ativo ? (
    <StatusBadge status="aprovado" rotulo="Ativo" />
  ) : (
    <StatusBadge status="rascunho" rotulo="Inativo" />
  );
}

export interface FornecedoresTabelaProps {
  fornecedores: FornecedorLista[];
  podeEditar: boolean;
  podeExcluir: boolean;
}

/**
 * Listagem de fornecedores: filtros de busca e status, tabela densa e
 * ações por linha (editar, ativar/desativar, excluir). A exclusão é
 * física (move para a lixeira) e exige motivo.
 */
export function FornecedoresTabela({
  fornecedores,
  podeEditar,
  podeExcluir,
}: FornecedoresTabelaProps) {
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState<FiltroStatus>("ativos");

  const [editarId, setEditarId] = React.useState<string | null>(null);
  const [drawerAberto, setDrawerAberto] = React.useState(false);

  const [excluirAlvo, setExcluirAlvo] =
    React.useState<FornecedorLista | null>(null);
  const [alternandoId, setAlternandoId] = React.useState<string | null>(null);

  const emEdicao =
    fornecedores.find((fornecedor) => fornecedor.id === editarId) ?? null;

  const filtrados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return fornecedores.filter((fornecedor) => {
      if (status === "ativos" && !fornecedor.ativo) return false;
      if (status === "inativos" && fornecedor.ativo) return false;
      if (termo.length === 0) return true;
      const alvo = [
        fornecedor.razaoSocial,
        fornecedor.nomeFantasia,
        fornecedor.cnpjCpf,
      ]
        .filter((valor): valor is string => valor !== null)
        .join(" ")
        .toLowerCase();
      return alvo.includes(termo);
    });
  }, [fornecedores, busca, status]);

  function abrirEdicao(fornecedor: FornecedorLista) {
    setEditarId(fornecedor.id);
    setDrawerAberto(true);
  }

  async function trocarAtivo(fornecedor: FornecedorLista) {
    setAlternandoId(fornecedor.id);
    const resultado = await alternarAtivo(fornecedor.id, !fornecedor.ativo);
    setAlternandoId(null);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(fornecedor.ativo ? "Fornecedor desativado" : "Fornecedor reativado");
  }

  async function confirmarExclusao(motivo?: string) {
    if (!excluirAlvo) return;
    const resultado = await excluir(excluirAlvo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Fornecedor enviado para a lixeira");
    setExcluirAlvo(null);
  }

  const colunas: ColumnDef<FornecedorLista, unknown>[] = React.useMemo(() => {
    const base: ColumnDef<FornecedorLista, unknown>[] = [
      {
        accessorKey: "razaoSocial",
        header: "Razão social",
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.original.razaoSocial}</span>
            {row.original.nomeFantasia ? (
              <span className="text-detalhe text-muted-foreground">
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
            {ROTULO_TIPO[row.original.tipo]}
          </span>
        ),
      },
      {
        accessorKey: "cnpjCpf",
        header: "CNPJ/CPF",
        cell: ({ row }) =>
          row.original.cnpjCpf ? (
            <span className="codigo-doc tabular-nums">
              {row.original.cnpjCpf}
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        id: "localizacao",
        header: "Cidade/UF",
        cell: ({ row }) => {
          const { cidade, uf } = row.original;
          const texto = [cidade, uf].filter(Boolean).join(" / ");
          return texto ? (
            <span>{texto}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          );
        },
      },
      {
        accessorKey: "telefone",
        header: "Telefone",
        cell: ({ row }) =>
          row.original.telefone ? (
            <span className="tabular-nums">{row.original.telefone}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        accessorKey: "ativo",
        header: "Status",
        cell: ({ row }) => <StatusFornecedor ativo={row.original.ativo} />,
      },
    ];

    if (!podeEditar && !podeExcluir) return base;

    base.push({
      id: "acoes",
      header: "",
      meta: { alinharDireita: true },
      cell: ({ row }) => {
        const fornecedor = row.original;
        const alternando = alternandoId === fornecedor.id;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Abrir ações do fornecedor"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {podeEditar ? (
                <>
                  <DropdownMenuItem onSelect={() => abrirEdicao(fornecedor)}>
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={alternando}
                    onSelect={(evento) => {
                      evento.preventDefault();
                      void trocarAtivo(fornecedor);
                    }}
                  >
                    {fornecedor.ativo ? "Desativar" : "Reativar"}
                  </DropdownMenuItem>
                </>
              ) : null}
              {podeExcluir ? (
                <>
                  {podeEditar ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setExcluirAlvo(fornecedor)}
                  >
                    Excluir
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    });

    return base;
  }, [podeEditar, podeExcluir, alternandoId]);

  return (
    <>
      <FilterBar>
        <FiltroBusca
          valor={busca}
          onValorChange={setBusca}
          placeholder="Buscar por nome ou documento"
        />
        <FiltroSelect
          valor={status === "todos" ? "todos" : status}
          onValorChange={(valor) =>
            setStatus((valor === "" ? "todos" : valor) as FiltroStatus)
          }
          opcoes={OPCOES_STATUS}
          placeholder="Status"
          todosRotulo="Todos"
        />
      </FilterBar>

      <DataTable
        columns={colunas}
        data={filtrados}
        emptyState={
          <EmptyState
            icone={Truck}
            titulo="Nenhum fornecedor encontrado"
            descricao="Cadastre um fornecedor ou ajuste os filtros de busca"
            className="border-none bg-transparent"
          />
        }
      />

      {podeEditar ? (
        <FornecedoresFormDrawer
          key={emEdicao?.id ?? "edicao-nenhum"}
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          fornecedor={emEdicao}
        />
      ) : null}

      {podeExcluir ? (
        <ConfirmDialog
          aberto={excluirAlvo !== null}
          onAbertoChange={(aberto) => {
            if (!aberto) setExcluirAlvo(null);
          }}
          titulo="Excluir fornecedor"
          descricao={
            excluirAlvo
              ? `O fornecedor ${excluirAlvo.razaoSocial} vai para a lixeira. Informe o motivo.`
              : "O fornecedor vai para a lixeira."
          }
          textoConfirmar="Excluir fornecedor"
          variante="destrutivo"
          exigeMotivo
          onConfirmar={confirmarExclusao}
        />
      ) : null}
    </>
  );
}
