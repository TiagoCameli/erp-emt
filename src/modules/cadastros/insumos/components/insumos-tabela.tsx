"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Package, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  FilterBar,
  FiltroBusca,
  FiltroSelect,
  PageHeader,
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
import { ImportarCadastro } from "@/modules/cadastros/_shared/importar-cadastro";
import {
  alternarAtivo,
  excluir,
  importar,
  validarImport,
} from "@/modules/cadastros/insumos/actions";
import type {
  CategoriaOpcao,
  InsumoLista,
  UnidadeOpcao,
} from "@/modules/cadastros/insumos/queries";
import { InsumosFormDrawer } from "./insumos-form-drawer";

const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
];

export interface InsumosTabelaProps {
  insumos: InsumoLista[];
  categorias: CategoriaOpcao[];
  unidades: UnidadeOpcao[];
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
}

/**
 * Tela de insumos: cabeçalho com importar e novo, filtro de busca e status,
 * tabela com ações de linha (editar, ativar/desativar, excluir) e o drawer
 * de criação e edição.
 */
export function InsumosTabela({
  insumos,
  categorias,
  unidades,
  podeCriar,
  podeEditar,
  podeExcluir,
}: InsumosTabelaProps) {
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState("ativos");

  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<InsumoLista | null>(null);

  const [excluindo, setExcluindo] = React.useState<InsumoLista | null>(null);

  function abrirNovo() {
    setEmEdicao(null);
    setDrawerAberto(true);
  }

  function abrirEdicao(insumo: InsumoLista) {
    setEmEdicao(insumo);
    setDrawerAberto(true);
  }

  async function aoAlternarAtivo(insumo: InsumoLista) {
    const resultado = await alternarAtivo(insumo.id, !insumo.ativo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(insumo.ativo ? "Insumo desativado" : "Insumo reativado");
  }

  async function aoConfirmarExclusao(motivo?: string) {
    if (!excluindo) return;
    const resultado = await excluir(excluindo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Insumo movido para a lixeira");
    setExcluindo(null);
  }

  const filtrados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return insumos.filter((insumo) => {
      if (status === "ativos" && !insumo.ativo) return false;
      if (status === "inativos" && insumo.ativo) return false;
      if (!termo) return true;
      return insumo.nome.toLowerCase().includes(termo);
    });
  }, [insumos, busca, status]);

  const colunas: ColumnDef<InsumoLista, unknown>[] = React.useMemo(() => {
    const base: ColumnDef<InsumoLista, unknown>[] = [
      {
        accessorKey: "codigo",
        header: "Código",
        cell: ({ row }) =>
          row.original.codigo ? (
            <span className="codigo-doc">{row.original.codigo}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        accessorKey: "nome",
        header: "Nome",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.nome}</span>
        ),
      },
      {
        accessorKey: "categoriaNome",
        header: "Categoria",
        cell: ({ row }) =>
          row.original.categoriaNome ?? (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        accessorKey: "unidadeSigla",
        header: "Unidade",
        cell: ({ row }) =>
          row.original.unidadeSigla ?? (
            <span className="text-muted-foreground">-</span>
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
        const insumo = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Ações de ${insumo.nome}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {podeEditar ? (
                <>
                  <DropdownMenuItem onSelect={() => abrirEdicao(insumo)}>
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => aoAlternarAtivo(insumo)}>
                    {insumo.ativo ? "Desativar" : "Reativar"}
                  </DropdownMenuItem>
                </>
              ) : null}
              {podeExcluir ? (
                <>
                  {podeEditar ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setExcluindo(insumo)}
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
  }, [podeEditar, podeExcluir]);

  return (
    <>
      <PageHeader
        titulo="Insumos"
        descricao="Materiais, peças, óleos, combustíveis, betuminosos e serviços"
        acoes={
          podeCriar ? (
            <>
              <ImportarCadastro
                titulo="Importar insumos"
                modeloHref="/cadastros/insumos/modelo"
                validarAction={validarImport}
                importarAction={importar}
              />
              <Button type="button" size="sm" onClick={abrirNovo}>
                <Plus />
                Novo insumo
              </Button>
            </>
          ) : undefined
        }
      />

      <FilterBar>
        <FiltroBusca
          valor={busca}
          onValorChange={setBusca}
          placeholder="Buscar por nome"
        />
        <FiltroSelect
          valor={status}
          onValorChange={(valor) => setStatus(valor === "" ? "ativos" : valor)}
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
            icone={Package}
            titulo="Nenhum insumo encontrado"
            descricao={
              podeCriar
                ? "Cadastre o primeiro insumo ou importe uma planilha"
                : "Nenhum insumo para mostrar com os filtros atuais"
            }
            className="border-none bg-transparent"
          />
        }
      />

      <InsumosFormDrawer
        key={emEdicao?.id ?? "novo"}
        aberto={drawerAberto}
        onAbertoChange={setDrawerAberto}
        insumo={emEdicao}
        categorias={categorias}
        unidades={unidades}
      />

      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setExcluindo(null);
        }}
        titulo="Excluir insumo"
        descricao={`O insumo ${excluindo?.nome ?? ""} vai para a lixeira. Informe o motivo da exclusão.`}
        textoConfirmar="Excluir insumo"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoConfirmarExclusao}
      />
    </>
  );
}
