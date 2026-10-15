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
import type { PilhaLinha, PilhaMovimento } from "@/modules/estoque/pilhas/queries";
import type { InsumoOpcao } from "@/modules/manutencao/almoxarifado/queries";
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

/** Data e quantidade do último movimento. A pilha tem fluxo constante, então isso diz mais que um %. */
function UltimoMovimento({ movimento, unidade }: { movimento: PilhaMovimento | null; unidade: string | null }) {
  if (!movimento) return <CelulaVazia />;
  return (
    <span className="whitespace-nowrap tabular-nums">
      {formatarData(movimento.data)}
      <span className="mx-1.5 text-muted-foreground">·</span>
      <Quantidade valor={movimento.quantidade} unidade={unidade} />
    </span>
  );
}

export interface PilhasTabelaProps {
  pilhas: PilhaLinha[];
  /** Para o formulário de edição; vazio para quem não edita. */
  insumos: InsumoOpcao[];
  podeEditar: boolean;
  podeExcluir: boolean;
}

/**
 * Pilhas de agregado. Não há "Desativar": a pilha fica inativa quando zera (e volta a
 * ativa se a saída que a zerou for excluída). Excluir vai para a lixeira; pilha com
 * movimento está em uso e a FK recusa.
 */
export function PilhasTabela({ pilhas, insumos, podeEditar, podeExcluir }: PilhasTabelaProps) {
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
        header: "Insumo",
        size: 260,
        cell: ({ row }) =>
          row.original.insumoNome ? (
            <span>
              {row.original.insumoNome}
              {row.original.unidade ? <span className="ml-1 text-muted-foreground">· {row.original.unidade}</span> : null}
            </span>
          ) : (
            <StatusBadge status="pendente_aprovacao" rotulo="Defina o insumo" />
          ),
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
        id: "ultimaEntrada",
        accessorFn: (pilha) => pilha.ultimaEntrada?.data ?? "",
        header: "Última entrada",
        size: 190,
        meta: { atomico: true },
        cell: ({ row }) => <UltimoMovimento movimento={row.original.ultimaEntrada} unidade={row.original.unidade} />,
      },
      {
        id: "ultimaSaida",
        accessorFn: (pilha) => pilha.ultimaSaida?.data ?? "",
        header: "Última saída",
        size: 190,
        meta: { atomico: true },
        cell: ({ row }) => <UltimoMovimento movimento={row.original.ultimaSaida} unidade={row.original.unidade} />,
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
            elemento: <FiltroBusca valor={busca} onValorChange={setBusca} placeholder="Nome, insumo ou observação" />,
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
          insumos={insumos}
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
