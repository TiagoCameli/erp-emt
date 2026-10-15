"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Mountain, Pencil, Trash2 } from "lucide-react";

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
import { casaBusca, textoPesquisavel } from "@/lib/busca";
import { formatarData, formatarQuantidade } from "@/lib/formatadores";
import { filtrarFacetado } from "@/modules/_shared/filtros-facetados";
import { excluirPilha } from "@/modules/estoque/pilhas/actions";
import type { PilhaLinha } from "@/modules/estoque/pilhas/queries";
import { PilhaFormDrawer } from "./pilha-form-drawer";

type FiltroStatus = "ativas" | "inativas" | "todas";

const OPCOES_STATUS = [
  { valor: "ativas", rotulo: "Ativas" },
  { valor: "inativas", rotulo: "Zeradas" },
];

function Quantidade({ valor, unidade }: { valor: number; unidade: string | null }) {
  return (
    <span className="tabular-nums">
      {formatarQuantidade(valor)}
      {unidade ? <span className="ml-1 text-muted-foreground">{unidade}</span> : null}
    </span>
  );
}

/** Quanto ainda resta do que entrou, em barra e em %. */
function Restante({ pilha }: { pilha: PilhaLinha }) {
  if (pilha.totalEntrada <= 0) return <CelulaVazia />;
  const fracao = Math.min(1, Math.max(0, pilha.saldo / pilha.totalEntrada));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-full min-w-12 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-primary" style={{ width: `${fracao * 100}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">{Math.round(fracao * 100)}%</span>
    </div>
  );
}

export interface PilhasTabelaProps {
  pilhas: PilhaLinha[];
  podeEditar: boolean;
  podeExcluir: boolean;
}

/**
 * Pilhas de agregado. Não há "Desativar": a pilha fica inativa quando zera (e volta a
 * ativa se a saída que a zerou for excluída). Excluir vai para a lixeira; pilha com
 * movimento está em uso e a FK recusa.
 */
export function PilhasTabela({ pilhas, podeEditar, podeExcluir }: PilhasTabelaProps) {
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [status, setStatus] = useFiltroSessao<FiltroStatus>("status", "ativas", ["ativas", "inativas", "todas"]);
  const [editando, setEditando] = React.useState<PilhaLinha | null>(null);
  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [excluindo, setExcluindo] = React.useState<PilhaLinha | null>(null);

  const { linhas: filtradas, opcoes } = React.useMemo(() => {
    return filtrarFacetado(
      pilhas,
      {
        status: {
          selecionados: status === "todas" ? [] : [status],
          casa: (pilha, valor) => (valor === "ativas") === pilha.ativo,
        },
      },
      [
        (pilha) =>
          casaBusca(
            textoPesquisavel(
              pilha.nome,
              pilha.insumoNome,
              pilha.observacoes,
              formatarQuantidade(pilha.saldo),
              pilha.zeradaEm ? formatarData(pilha.zeradaEm) : null,
              pilha.ativo ? "ativa" : "zerada inativa",
            ),
            busca,
          ),
      ],
    );
  }, [pilhas, busca, status]);

  async function aoConfirmarExclusao(motivo?: string) {
    if (!excluindo) return;
    const resultado = await excluirPilha(excluindo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Pilha excluída");
    setExcluindo(null);
  }

  const colunas = React.useMemo<ColumnDef<PilhaLinha, unknown>[]>(
    () => [
      {
        accessorKey: "nome",
        header: "Nome",
        size: 260,
        meta: { celular: "titulo" },
        cell: ({ row }) => <span className="font-medium">{row.original.nome}</span>,
      },
      {
        accessorKey: "insumoNome",
        header: "Material",
        size: 240,
        cell: ({ row }) => row.original.insumoNome ?? <span className="text-muted-foreground">Sem entrada</span>,
      },
      {
        accessorKey: "saldo",
        header: "Saldo",
        size: 130,
        meta: { alinharDireita: true, atomico: true, celular: "valor" },
        cell: ({ row }) => <Quantidade valor={row.original.saldo} unidade={row.original.unidade} />,
      },
      {
        accessorKey: "totalEntrada",
        header: "Entrou",
        size: 130,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => <Quantidade valor={row.original.totalEntrada} unidade={row.original.unidade} />,
      },
      {
        id: "restante",
        header: "Restante",
        size: 160,
        cell: ({ row }) => <Restante pilha={row.original} />,
      },
      {
        accessorKey: "ativo",
        header: "Status",
        size: 170,
        cell: ({ row }) =>
          row.original.ativo ? (
            <StatusBadge status="aprovado" rotulo="Ativa" />
          ) : (
            <StatusBadge
              status="rascunho"
              rotulo={row.original.zeradaEm ? `Zerada em ${formatarData(row.original.zeradaEm)}` : "Zerada"}
            />
          ),
      },
      {
        accessorKey: "observacoes",
        header: "Observações",
        size: 240,
        cell: ({ row }) => row.original.observacoes || <CelulaVazia />,
      },
    ],
    [],
  );

  return (
    <>
      <DataTable
        idTabela="estoque.pilhas"
        columns={colunas}
        data={filtradas}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca",
            fixo: true,
            temValor: busca !== "",
            onLimpar: () => setBusca(""),
            elemento: <FiltroBusca valor={busca} onValorChange={setBusca} placeholder="Nome, material ou observação" />,
          },
          {
            id: "status",
            rotulo: "Status",
            temValor: status !== "ativas",
            onLimpar: () => setStatus("ativas"),
            elemento: (
              <FiltroSelect
                valor={status === "todas" ? "" : status}
                onValorChange={(valor) => setStatus(valor === "" ? "todas" : (valor as FiltroStatus))}
                opcoes={opcoes("status", OPCOES_STATUS)}
                placeholder="Status"
                todosRotulo="Todas"
              />
            ),
          },
        ]}
        acoesLinha={
          podeEditar || podeExcluir
            ? (pilha) => (
                <>
                  {podeEditar ? (
                    <DropdownMenuItem
                      onSelect={() => {
                        setEditando(pilha);
                        setDrawerAberto(true);
                      }}
                    >
                      <Pencil />
                      Editar
                    </DropdownMenuItem>
                  ) : null}
                  {podeExcluir ? (
                    <DropdownMenuItem variant="destructive" onSelect={() => setExcluindo(pilha)}>
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
            icone={Mountain}
            titulo="Nenhuma pilha encontrada"
            descricao={
              status === "ativas"
                ? "Crie a pilha e dê entrada do agregado na aba Entradas. As pilhas zeradas ficam no status Zeradas"
                : "Ajuste a busca ou o status"
            }
            className="border-none bg-transparent"
          />
        }
      />

      {podeEditar ? (
        <PilhaFormDrawer
          key={editando?.id ?? "nenhuma"}
          aberto={drawerAberto}
          onAbertoChange={(aberto) => {
            setDrawerAberto(aberto);
            if (!aberto) setEditando(null);
          }}
          pilha={editando}
        />
      ) : null}

      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setExcluindo(null);
        }}
        titulo="Excluir pilha"
        descricao={
          excluindo
            ? `A pilha ${excluindo.nome} vai para a lixeira. Se ela já teve entrada ou saída, a exclusão é recusada: o histórico fica, e a pilha zerada já sai da lista sozinha.`
            : ""
        }
        textoConfirmar="Excluir pilha"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoConfirmarExclusao}
      />
    </>
  );
}
