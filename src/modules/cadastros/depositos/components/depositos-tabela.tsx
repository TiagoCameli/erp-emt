"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Plus, Warehouse } from "lucide-react";
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
import { alternarAtivo, excluir } from "@/modules/cadastros/depositos/actions";
import { DepositosFormDrawer } from "@/modules/cadastros/depositos/components/depositos-form-drawer";
import type {
  DepositoLista,
  InsumoOpcao,
  ObraOpcao,
} from "@/modules/cadastros/depositos/queries";
import { ROTULO_TIPO_DEPOSITO } from "@/modules/cadastros/depositos/schemas";

const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
  { valor: "todos", rotulo: "Todos" },
];

export interface DepositosTabelaProps {
  depositos: DepositoLista[];
  obras: ObraOpcao[];
  insumos: InsumoOpcao[];
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
}

/** Badge de status custom: ativo verde, inativo cinza. */
function StatusDeposito({ ativo }: { ativo: boolean }) {
  return ativo ? (
    <StatusBadge status="aprovado" rotulo="Ativo" />
  ) : (
    <StatusBadge status="rascunho" rotulo="Inativo" />
  );
}

export function DepositosTabela({
  depositos,
  obras,
  insumos,
  podeCriar,
  podeEditar,
  podeExcluir,
}: DepositosTabelaProps) {
  const router = useRouter();
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState("ativos");

  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<DepositoLista | undefined>(
    undefined,
  );

  const [excluindo, setExcluindo] = React.useState<DepositoLista | null>(null);

  function abrirNovo() {
    setEmEdicao(undefined);
    setDrawerAberto(true);
  }

  function abrirEdicao(deposito: DepositoLista) {
    setEmEdicao(deposito);
    setDrawerAberto(true);
  }

  async function aoAlternarAtivo(deposito: DepositoLista) {
    const resultado = await alternarAtivo(deposito.id, !deposito.ativo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(deposito.ativo ? "Depósito desativado" : "Depósito reativado");
    router.refresh();
  }

  async function aoExcluir(motivo?: string) {
    if (!excluindo) return;
    const resultado = await excluir(excluindo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Depósito excluído");
    setExcluindo(null);
    router.refresh();
  }

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return depositos.filter((deposito) => {
      if (status === "ativos" && !deposito.ativo) return false;
      if (status === "inativos" && deposito.ativo) return false;
      if (termo && !deposito.nome.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [depositos, busca, status]);

  const temAcoes = podeEditar || podeExcluir;

  const colunas = React.useMemo<ColumnDef<DepositoLista, unknown>[]>(() => {
    const base: ColumnDef<DepositoLista, unknown>[] = [
      {
        accessorKey: "nome",
        header: "Nome",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.nome}</span>
        ),
      },
      {
        accessorKey: "tipo",
        header: "Tipo",
        cell: ({ row }) => ROTULO_TIPO_DEPOSITO[row.original.tipo],
      },
      {
        accessorKey: "obraNome",
        header: "Obra",
        cell: ({ row }) => row.original.obraNome ?? "-",
      },
      {
        accessorKey: "insumoNome",
        header: "Insumo",
        cell: ({ row }) => row.original.insumoNome ?? "-",
      },
      {
        accessorKey: "ativo",
        header: "Status",
        cell: ({ row }) => <StatusDeposito ativo={row.original.ativo} />,
      },
    ];

    if (!temAcoes) return base;

    base.push({
      id: "acoes",
      header: "",
      meta: { alinharDireita: true },
      cell: ({ row }) => {
        const deposito = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Ações de ${deposito.nome}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {podeEditar ? (
                <>
                  <DropdownMenuItem onClick={() => abrirEdicao(deposito)}>
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => aoAlternarAtivo(deposito)}>
                    {deposito.ativo ? "Desativar" : "Reativar"}
                  </DropdownMenuItem>
                </>
              ) : null}
              {podeExcluir ? (
                <>
                  {podeEditar ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setExcluindo(deposito)}
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podeEditar, podeExcluir, temAcoes]);

  return (
    <div className="flex flex-col gap-2">
      <FilterBar>
        <FiltroBusca
          valor={busca}
          onValorChange={setBusca}
          placeholder="Buscar por nome"
        />
        <FiltroSelect
          valor={status === "todos" ? "" : status}
          onValorChange={(valor) => setStatus(valor === "" ? "todos" : valor)}
          opcoes={OPCOES_STATUS.filter((opcao) => opcao.valor !== "todos")}
          placeholder="Status"
          todosRotulo="Todos"
        />
      </FilterBar>

      <DataTable
        columns={colunas}
        data={dados}
        emptyState={
          <EmptyState
            icone={Warehouse}
            titulo="Nenhum depósito encontrado"
            descricao="Cadastre depósitos centrais, de obra, almoxarifados e tanques de combustível ou betuminoso."
            acao={
              podeCriar ? (
                <Button type="button" size="sm" onClick={abrirNovo}>
                  <Plus />
                  Novo depósito
                </Button>
              ) : undefined
            }
          />
        }
      />

      {podeCriar || podeEditar ? (
        <DepositosFormDrawer
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          deposito={emEdicao}
          obras={obras}
          insumos={insumos}
        />
      ) : null}

      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setExcluindo(null);
        }}
        titulo="Excluir depósito"
        descricao={`Esta ação move "${excluindo?.nome ?? ""}" para a lixeira. Informe o motivo da exclusão.`}
        textoConfirmar="Excluir depósito"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoExcluir}
      />
    </div>
  );
}
