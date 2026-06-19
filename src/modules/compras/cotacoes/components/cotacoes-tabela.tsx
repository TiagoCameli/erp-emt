"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardList, LoaderCircle, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  DataTable,
  EmptyState,
  FilterBar,
  FiltroBusca,
  FiltroSelect,
  StatusBadge,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarData } from "@/lib/formatadores";
import { criarCotacao } from "@/modules/compras/cotacoes/actions";
import type { CotacaoLista } from "@/modules/compras/cotacoes/queries";
import { infoStatusCotacao } from "@/modules/compras/_shared/formato";
import { NovaCotacaoDrawer } from "./nova-cotacao-drawer";
import type { PedidoAprovadoOpcao } from "@/modules/compras/cotacoes/queries";

const OPCOES_STATUS = [
  { valor: "aberta", rotulo: "Aberta" },
  { valor: "finalizada", rotulo: "Finalizada" },
  { valor: "cancelada", rotulo: "Cancelada" },
];

const colunas: ColumnDef<CotacaoLista, unknown>[] = [
  {
    accessorKey: "numero",
    header: "Número",
    cell: ({ row }) =>
      row.original.numero ? (
        <span className="codigo-doc">{row.original.numero}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const info = infoStatusCotacao(row.original.status);
      return <StatusBadge status={info.badge} rotulo={info.rotulo} />;
    },
  },
  {
    accessorKey: "qtdFornecedores",
    header: "Fornecedores",
    meta: { alinharDireita: true },
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.qtdFornecedores}</span>
    ),
  },
  {
    accessorKey: "vencedorNome",
    header: "Vencedor",
    cell: ({ row }) =>
      row.original.vencedorNome ? (
        <span>{row.original.vencedorNome}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    accessorKey: "createdAt",
    header: "Criado em",
    cell: ({ row }) => (
      <span className="tabular-nums">{formatarData(row.original.createdAt)}</span>
    ),
  },
];

/**
 * Estado e fluxo único de criação de cotação (drawer + aoCriar): cria, mostra o
 * toast e leva ao detalhe. Reusado pelo cabeçalho, pelo botão da tabela e pelo
 * EmptyState, para não duplicar a lógica de criação em vários pontos.
 */
function useCriarCotacao() {
  const router = useRouter();
  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [criando, setCriando] = React.useState(false);

  const aoCriar = React.useCallback(
    async (pedidoId: string | undefined, observacoes: string) => {
      setCriando(true);
      const resultado = await criarCotacao({ pedidoId, observacoes });
      setCriando(false);

      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      toast.success("Cotação criada");
      setDrawerAberto(false);
      router.push(`/compras/cotacoes/${resultado.id}`);
    },
    [router],
  );

  return { drawerAberto, setDrawerAberto, criando, aoCriar };
}

export interface CotacoesTabelaProps {
  cotacoes: CotacaoLista[];
  pedidos: PedidoAprovadoOpcao[];
  podeCriar: boolean;
}

/**
 * Listagem de cotações. Clicar numa linha abre o detalhe (mapa comparativo).
 * O botão de nova cotação cria e leva direto ao detalhe para montar o mapa.
 */
export function CotacoesTabela({
  cotacoes,
  pedidos,
  podeCriar,
}: CotacoesTabelaProps) {
  const router = useRouter();
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState("");
  const { drawerAberto, setDrawerAberto, criando, aoCriar } = useCriarCotacao();

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return cotacoes.filter((cotacao) => {
      if (status && cotacao.status !== status) return false;
      if (termo) {
        const alvo = `${cotacao.numero ?? ""} ${
          cotacao.vencedorNome ?? ""
        } ${cotacao.pedidoNumero ?? ""}`.toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
  }, [cotacoes, busca, status]);

  return (
    <div className="flex flex-col gap-2">
      <FilterBar>
        <FiltroBusca
          valor={busca}
          onValorChange={setBusca}
          placeholder="Buscar por número, vencedor ou pedido"
        />
        <FiltroSelect
          valor={status}
          onValorChange={setStatus}
          opcoes={OPCOES_STATUS}
          placeholder="Status"
          todosRotulo="Todos"
        />
      </FilterBar>

      <DataTable
        columns={colunas}
        data={dados}
        onRowClick={(cotacao) =>
          router.push(`/compras/cotacoes/${cotacao.id}`)
        }
        emptyState={
          <EmptyState
            icone={ClipboardList}
            titulo="Nenhuma cotação"
            descricao={
              podeCriar
                ? "Crie a primeira cotação a partir de um pedido aprovado ou avulsa"
                : "Quando houver cotações, elas aparecem aqui"
            }
            acao={
              podeCriar ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setDrawerAberto(true)}
                >
                  <Plus />
                  Nova cotação
                </Button>
              ) : undefined
            }
            className="border-none bg-transparent"
          />
        }
      />

      {podeCriar ? (
        <NovaCotacaoDrawer
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          pedidos={pedidos}
          criando={criando}
          onCriar={aoCriar}
        />
      ) : null}
    </div>
  );
}

/** Botão de nova cotação para o cabeçalho da página. */
export function CotacoesAcoesCabecalho({
  pedidos,
  podeCriar,
}: {
  pedidos: PedidoAprovadoOpcao[];
  podeCriar: boolean;
}) {
  const { drawerAberto, setDrawerAberto, criando, aoCriar } = useCriarCotacao();

  if (!podeCriar) return null;

  return (
    <>
      <Button type="button" size="sm" onClick={() => setDrawerAberto(true)}>
        {criando ? <LoaderCircle className="animate-spin" /> : <Plus />}
        Nova cotação
      </Button>
      <NovaCotacaoDrawer
        aberto={drawerAberto}
        onAbertoChange={setDrawerAberto}
        pedidos={pedidos}
        criando={criando}
        onCriar={aoCriar}
      />
    </>
  );
}
