"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Package, Pencil, Power } from "lucide-react";

import {
  CelulaVazia,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroSelect,
  StatusBadge,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { formatarQuantidade } from "@/lib/formatadores";
import { alternarAtivoPeca } from "@/modules/manutencao/almoxarifado/actions";
import type { InsumoOpcao, Opcao, PecaLinha } from "@/modules/manutencao/almoxarifado/queries";
import { PecaFormDrawer } from "./peca-form-drawer";

type FiltroStatus = "ativos" | "inativos" | "todos";
type FiltroTipo = "todos" | "oleo" | "peca";

const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativas" },
  { valor: "inativos", rotulo: "Inativas" },
];

const OPCOES_TIPO = [
  { valor: "oleo", rotulo: "Óleo" },
  { valor: "peca", rotulo: "Peça" },
];

export interface PecasListaProps {
  pecas: PecaLinha[];
  insumos: InsumoOpcao[];
  tiposOleo: Opcao[];
  equipamentos: (Opcao & { ativo: boolean })[];
  podeEditar: boolean;
}

/**
 * Peças do almoxarifado (`almoxarifado_itens`): tabela e drawer de edição. O
 * botão "Nova peça" é ação da página e mora no cabeçalho
 * (`PecasAcoesCabecalho`).
 */
export function PecasLista({
  pecas,
  insumos,
  tiposOleo,
  equipamentos,
  podeEditar,
}: PecasListaProps) {
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [status, setStatus] = useFiltroSessao<FiltroStatus>("status", "ativos", [
    "ativos",
    "inativos",
    "todos",
  ]);
  const [tipo, setTipo] = useFiltroSessao<FiltroTipo>("tipo", "todos", ["todos", "oleo", "peca"]);
  const [editando, setEditando] = React.useState<PecaLinha | null>(null);
  const [drawerAberto, setDrawerAberto] = React.useState(false);

  const insumosJaCadastrados = React.useMemo(
    () => new Set(pecas.map((peca) => peca.insumoId)),
    [pecas],
  );

  const filtradas = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return pecas.filter((peca) => {
      if (status === "ativos" && !peca.ativo) return false;
      if (status === "inativos" && peca.ativo) return false;
      if (tipo === "oleo" && !peca.tipoOleoId) return false;
      if (tipo === "peca" && peca.tipoOleoId) return false;
      if (
        termo &&
        !peca.insumoNome.toLowerCase().includes(termo) &&
        !(peca.tipoOleoNome ?? "").toLowerCase().includes(termo)
      ) {
        return false;
      }
      return true;
    });
  }, [pecas, busca, status, tipo]);

  function abrir(peca: PecaLinha) {
    setEditando(peca);
    setDrawerAberto(true);
  }

  async function aoAlternarAtivo(peca: PecaLinha) {
    const resultado = await alternarAtivoPeca(peca.id, !peca.ativo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(peca.ativo ? "Peça desativada" : "Peça reativada");
  }

  const colunas = React.useMemo<ColumnDef<PecaLinha, unknown>[]>(
    () => [
      {
        accessorKey: "insumoNome",
        header: "Insumo",
        size: 360,
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.insumoNome}
            {row.original.unidade ? (
              <span className="ml-1 text-muted-foreground">({row.original.unidade})</span>
            ) : null}
          </span>
        ),
      },
      {
        accessorKey: "tipoOleoNome",
        header: "Tipo de óleo",
        size: 180,
        cell: ({ row }) => row.original.tipoOleoNome ?? <CelulaVazia />,
      },
      {
        accessorKey: "estoqueMinimo",
        header: "Estoque mínimo",
        size: 130,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) =>
          row.original.estoqueMinimo === null ? (
            <CelulaVazia />
          ) : (
            <span className="tabular-nums">{formatarQuantidade(row.original.estoqueMinimo)}</span>
          ),
      },
      {
        accessorKey: "estoqueMaximo",
        header: "Estoque máximo",
        size: 130,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) =>
          row.original.estoqueMaximo === null ? (
            <CelulaVazia />
          ) : (
            <span className="tabular-nums">{formatarQuantidade(row.original.estoqueMaximo)}</span>
          ),
      },
      {
        id: "equipamentos",
        header: "Equipamentos",
        size: 130,
        accessorFn: (peca) => peca.equipamentoIds.length,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) =>
          row.original.equipamentoIds.length === 0 ? (
            <CelulaVazia />
          ) : (
            <span className="tabular-nums">{row.original.equipamentoIds.length}</span>
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
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-3">
      <DataTable
        idTabela="manutencao.almoxarifado.pecas"
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
              <FiltroBusca valor={busca} onValorChange={setBusca} placeholder="Buscar por insumo ou tipo de óleo" />
            ),
          },
          {
            id: "tipo",
            rotulo: "Tipo",
            temValor: tipo !== "todos",
            onLimpar: () => setTipo("todos"),
            elemento: (
              <FiltroSelect
                valor={tipo === "todos" ? "" : tipo}
                onValorChange={(valor) => setTipo(valor === "" ? "todos" : (valor as FiltroTipo))}
                opcoes={OPCOES_TIPO}
                placeholder="Tipo"
                todosRotulo="Peças e óleos"
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
                onValorChange={(valor) => setStatus(valor === "" ? "todos" : (valor as FiltroStatus))}
                opcoes={OPCOES_STATUS}
                placeholder="Status"
                todosRotulo="Todas"
              />
            ),
          },
        ]}
        acoesLinha={
          podeEditar
            ? (peca) => (
                <>
                  <DropdownMenuItem onSelect={() => abrir(peca)}>
                    <Pencil />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void aoAlternarAtivo(peca)}>
                    <Power />
                    {peca.ativo ? "Desativar" : "Reativar"}
                  </DropdownMenuItem>
                </>
              )
            : undefined
        }
        emptyState={
          <EmptyState
            icone={Package}
            titulo={pecas.length === 0 ? "Nenhuma peça cadastrada" : "Nenhuma peça encontrada"}
            descricao={
              pecas.length === 0
                ? "Cadastre a peça para definir estoque mínimo, tipo de óleo e equipamentos compatíveis"
                : "Ajuste os filtros"
            }
            className="border-none bg-transparent"
          />
        }
      />

      {podeEditar ? (
        <PecaFormDrawer
          key={editando?.id ?? "nenhuma"}
          aberto={drawerAberto}
          onAbertoChange={(aberto) => {
            setDrawerAberto(aberto);
            if (!aberto) setEditando(null);
          }}
          peca={editando}
          insumos={insumos}
          insumosJaCadastrados={insumosJaCadastrados}
          tiposOleo={tiposOleo}
          equipamentos={equipamentos}
        />
      ) : null}
    </div>
  );
}
