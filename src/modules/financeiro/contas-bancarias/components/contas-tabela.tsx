"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Landmark } from "lucide-react";

import {
  DataTable,
  EmptyState,
  FilterBar,
  FiltroBusca,
  FiltroSelect,
  MoneyText,
  StatusBadge,
} from "@/components/canonicos";
import { ROTULO_BANCO } from "@/modules/financeiro/_shared/formato";
import type { ContaLista } from "@/modules/financeiro/contas-bancarias/queries";
import { ROTULO_TIPO_CONTA } from "@/modules/financeiro/contas-bancarias/schemas";
import { ContasFormDrawer } from "./contas-form-drawer";

const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativas" },
  { valor: "inativos", rotulo: "Inativas" },
];

/** Texto "Ag. 0001 / Conta 12345-6" com o que existir, senão um traço. */
function agenciaConta(conta: ContaLista): React.ReactNode {
  const partes = [
    conta.agencia ? `Ag. ${conta.agencia}` : null,
    conta.conta ? `C/C ${conta.conta}` : null,
  ].filter(Boolean);
  if (partes.length === 0) {
    return <span className="text-muted-foreground">-</span>;
  }
  return <span className="codigo-doc">{partes.join(" • ")}</span>;
}

const colunas: ColumnDef<ContaLista, unknown>[] = [
  {
    accessorKey: "nome",
    header: "Nome",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.nome}</span>
    ),
  },
  {
    accessorKey: "banco",
    header: "Banco",
    cell: ({ row }) => ROTULO_BANCO[row.original.banco],
  },
  {
    id: "agenciaConta",
    header: "Agência / Conta",
    cell: ({ row }) => agenciaConta(row.original),
  },
  {
    accessorKey: "tipo",
    header: "Tipo",
    cell: ({ row }) => ROTULO_TIPO_CONTA[row.original.tipo],
  },
  {
    accessorKey: "saldoAtual",
    header: "Saldo atual",
    meta: { alinharDireita: true },
    cell: ({ row }) => (
      <MoneyText
        valor={row.original.saldoAtual}
        className="font-semibold text-foreground"
      />
    ),
  },
  {
    accessorKey: "ativo",
    header: "Ativa",
    cell: ({ row }) =>
      row.original.ativo ? (
        <StatusBadge status="aprovado" rotulo="Ativa" />
      ) : (
        <StatusBadge status="rascunho" rotulo="Inativa" />
      ),
  },
];

export interface ContasTabelaProps {
  contas: ContaLista[];
  podeEditar: boolean;
}

/**
 * Listagem de contas bancárias. Clicar numa linha abre o drawer de edição
 * quando o usuário tem permissão de editar.
 */
export function ContasTabela({ contas, podeEditar }: ContasTabelaProps) {
  const [selecionadaId, setSelecionadaId] = React.useState<string | null>(null);
  const [aberto, setAberto] = React.useState(false);
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState("ativos");

  // Deriva da prop pra refletir edições depois do revalidatePath.
  const contaSelecionada =
    contas.find((conta) => conta.id === selecionadaId) ?? null;

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return contas.filter((conta) => {
      if (status === "ativos" && !conta.ativo) return false;
      if (status === "inativos" && conta.ativo) return false;
      if (termo && !conta.nome.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [contas, busca, status]);

  function abrirEdicao(conta: ContaLista) {
    if (!podeEditar) return;
    setSelecionadaId(conta.id);
    setAberto(true);
  }

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
          opcoes={OPCOES_STATUS}
          placeholder="Status"
          todosRotulo="Todas"
        />
      </FilterBar>

      <DataTable
        columns={colunas}
        data={dados}
        onRowClick={podeEditar ? abrirEdicao : undefined}
        emptyState={
          <EmptyState
            icone={Landmark}
            titulo="Nenhuma conta bancária cadastrada"
            descricao="Cadastre a primeira conta para registrar pagamentos e conciliar extratos"
            className="border-none bg-transparent"
          />
        }
      />

      <ContasFormDrawer
        key={contaSelecionada?.id ?? "nenhuma"}
        aberto={aberto}
        onAbertoChange={setAberto}
        conta={contaSelecionada}
      />
    </div>
  );
}
