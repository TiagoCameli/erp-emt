"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Power, Trash2, Warehouse } from "lucide-react";

import {
  CelulaVazia,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroSelect,
  StatusBadge,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { alternarAtivoDeposito, excluirDeposito } from "@/modules/manutencao/almoxarifado/actions";
import type { DepositoLinha } from "@/modules/manutencao/almoxarifado/queries";
import { DepositoFormDrawer } from "./deposito-form-drawer";

type FiltroStatus = "ativos" | "inativos" | "todos";

const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
];

export interface DepositosTabelaProps {
  depositos: DepositoLinha[];
  podeEditar: boolean;
  podeExcluir: boolean;
}

/**
 * Depósitos de peças. Excluir vai para a lixeira pela `fn_excluir_cadastro`;
 * depósito com entrada, saída ou saldo está em uso e a FK recusa (a tela diz para
 * desativar no lugar).
 */
export function DepositosTabela({ depositos, podeEditar, podeExcluir }: DepositosTabelaProps) {
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [status, setStatus] = useFiltroSessao<FiltroStatus>("status", "ativos", [
    "ativos",
    "inativos",
    "todos",
  ]);
  const [editando, setEditando] = React.useState<DepositoLinha | null>(null);
  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [excluindo, setExcluindo] = React.useState<DepositoLinha | null>(null);

  const filtrados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return depositos.filter((deposito) => {
      if (status === "ativos" && !deposito.ativo) return false;
      if (status === "inativos" && deposito.ativo) return false;
      if (
        termo &&
        !deposito.nome.toLowerCase().includes(termo) &&
        !(deposito.endereco ?? "").toLowerCase().includes(termo)
      ) {
        return false;
      }
      return true;
    });
  }, [depositos, busca, status]);

  async function aoAlternarAtivo(deposito: DepositoLinha) {
    const resultado = await alternarAtivoDeposito(deposito.id, !deposito.ativo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(deposito.ativo ? "Depósito desativado" : "Depósito reativado");
  }

  async function aoConfirmarExclusao(motivo?: string) {
    if (!excluindo) return;
    const resultado = await excluirDeposito(excluindo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Depósito excluído");
    setExcluindo(null);
  }

  const colunas = React.useMemo<ColumnDef<DepositoLinha, unknown>[]>(
    () => [
      {
        accessorKey: "nome",
        header: "Nome",
        size: 300,
        cell: ({ row }) => <span className="font-medium">{row.original.nome}</span>,
      },
      {
        accessorKey: "endereco",
        header: "Endereço",
        size: 360,
        cell: ({ row }) => row.original.endereco || <CelulaVazia />,
      },
      {
        accessorKey: "ativo",
        header: "Status",
        size: 110,
        cell: ({ row }) =>
          row.original.ativo ? (
            <StatusBadge status="aprovado" rotulo="Ativo" />
          ) : (
            <StatusBadge status="rascunho" rotulo="Inativo" />
          ),
      },
    ],
    [],
  );

  return (
    <>
      <DataTable
        idTabela="manutencao.almoxarifado.depositos"
        columns={colunas}
        data={filtrados}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca",
            fixo: true,
            temValor: busca !== "",
            onLimpar: () => setBusca(""),
            elemento: (
              <FiltroBusca valor={busca} onValorChange={setBusca} placeholder="Buscar por nome ou endereço" />
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
                onValorChange={(valor) => setStatus(valor === "" ? "todos" : (valor as FiltroStatus))}
                opcoes={OPCOES_STATUS}
                placeholder="Status"
                todosRotulo="Todos"
              />
            ),
          },
        ]}
        acoesLinha={
          podeEditar || podeExcluir
            ? (deposito) => (
                <>
                  {podeEditar ? (
                    <>
                      <DropdownMenuItem
                        onSelect={() => {
                          setEditando(deposito);
                          setDrawerAberto(true);
                        }}
                      >
                        <Pencil />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void aoAlternarAtivo(deposito)}>
                        <Power />
                        {deposito.ativo ? "Desativar" : "Reativar"}
                      </DropdownMenuItem>
                    </>
                  ) : null}
                  {podeExcluir ? (
                    <DropdownMenuItem variant="destructive" onSelect={() => setExcluindo(deposito)}>
                      <Trash2 />
                      Excluir
                    </DropdownMenuItem>
                  ) : null}
                </>
              )
            : undefined
        }
        emptyState={
          <EmptyState
            icone={Warehouse}
            titulo="Nenhum depósito encontrado"
            descricao="Ajuste os filtros ou cadastre o depósito onde as peças ficam"
            className="border-none bg-transparent"
          />
        }
      />

      {podeEditar ? (
        <DepositoFormDrawer
          key={editando?.id ?? "nenhum"}
          aberto={drawerAberto}
          onAbertoChange={(aberto) => {
            setDrawerAberto(aberto);
            if (!aberto) setEditando(null);
          }}
          deposito={editando}
        />
      ) : null}

      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setExcluindo(null);
        }}
        titulo="Excluir depósito"
        descricao={
          excluindo
            ? `O depósito ${excluindo.nome} vai para a lixeira. Se ele já teve entrada de peça, a exclusão é recusada: desative no lugar.`
            : ""
        }
        textoConfirmar="Excluir depósito"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoConfirmarExclusao}
      />
    </>
  );
}
