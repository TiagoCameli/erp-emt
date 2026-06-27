"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { FileText, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  FilterBar,
  FiltroBusca,
  FiltroSelect,
  MoneyText,
  StatusBadge,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { excluir } from "@/modules/cadastros/orcamentos/actions";
import type { OrcamentoLista } from "@/modules/cadastros/orcamentos/queries";
import {
  STATUS_ORCAMENTO,
  STATUS_ORCAMENTO_CONFIG,
} from "@/modules/cadastros/orcamentos/schemas";

const OPCOES_STATUS = STATUS_ORCAMENTO.map((chave) => ({
  valor: chave,
  rotulo: STATUS_ORCAMENTO_CONFIG[chave].rotulo,
}));

export interface OrcamentosTabelaProps {
  orcamentos: OrcamentoLista[];
  podeExcluir: boolean;
}

/**
 * Listagem de orçamentos. Clicar numa linha abre o detalhe; o menu de ações
 * permite excluir para quem tem permissão.
 */
export function OrcamentosTabela({
  orcamentos,
  podeExcluir,
}: OrcamentosTabelaProps) {
  const router = useRouter();
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [excluindo, setExcluindo] = React.useState<OrcamentoLista | null>(null);

  async function aoConfirmarExclusao() {
    if (!excluindo) return;
    const resultado = await excluir(excluindo.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Orçamento excluído");
    setExcluindo(null);
  }

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return orcamentos.filter((orcamento) => {
      if (status && orcamento.status !== status) return false;
      if (termo) {
        const obra = orcamento.obraNome?.toLowerCase() ?? "";
        const numero = orcamento.numero?.toLowerCase() ?? "";
        const descricao = orcamento.descricao?.toLowerCase() ?? "";
        if (
          !obra.includes(termo) &&
          !numero.includes(termo) &&
          !descricao.includes(termo)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [orcamentos, busca, status]);

  const colunas: ColumnDef<OrcamentoLista, unknown>[] = React.useMemo(() => {
    const base: ColumnDef<OrcamentoLista, unknown>[] = [
      {
        accessorKey: "obraNome",
        header: "Obra",
        cell: ({ row }) =>
          row.original.obraNome ? (
            <span className="font-medium">{row.original.obraNome}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
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
          const config = STATUS_ORCAMENTO_CONFIG[row.original.status];
          return (
            <StatusBadge
              status={row.original.status}
              rotulo={config.rotulo}
              className={config.classes}
            />
          );
        },
      },
      {
        accessorKey: "custoTotal",
        header: "Custo total",
        meta: { alinharDireita: true },
        cell: ({ row }) => <MoneyText valor={row.original.custoTotal} />,
      },
      {
        accessorKey: "precoTotal",
        header: "Preço total",
        meta: { alinharDireita: true },
        cell: ({ row }) => <MoneyText valor={row.original.precoTotal} />,
      },
      {
        accessorKey: "totalItens",
        header: "Itens",
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.totalItens}</span>
        ),
      },
    ];

    if (!podeExcluir) return base;

    base.push({
      id: "acoes",
      header: "",
      meta: { alinharDireita: true },
      cell: ({ row }) => {
        const orcamento = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Ações do orçamento ${orcamento.numero ?? orcamento.obraNome ?? ""}`}
                onClick={(evento) => evento.stopPropagation()}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setExcluindo(orcamento)}
              >
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    });

    return base;
  }, [podeExcluir]);

  return (
    <div className="flex flex-col gap-2">
      <FilterBar>
        <FiltroBusca
          valor={busca}
          onValorChange={setBusca}
          placeholder="Buscar por obra, número ou descrição"
        />
        <FiltroSelect
          valor={status}
          onValorChange={setStatus}
          opcoes={OPCOES_STATUS}
          placeholder="Status"
          todosRotulo="Todos os status"
        />
      </FilterBar>

      <DataTable
        columns={colunas}
        data={dados}
        onRowClick={(orcamento) =>
          router.push(`/cadastros/orcamentos/${orcamento.id}`)
        }
        emptyState={
          <EmptyState
            icone={FileText}
            titulo="Nenhum orçamento por aqui"
            descricao="Quando houver orçamentos, eles aparecem nesta lista"
            className="border-none bg-transparent"
          />
        }
      />

      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setExcluindo(null);
        }}
        titulo="Excluir orçamento"
        descricao={`O orçamento ${excluindo?.numero ?? excluindo?.obraNome ?? ""} e todos os seus itens serão excluídos. Esta ação não pode ser desfeita.`}
        textoConfirmar="Excluir orçamento"
        variante="destrutivo"
        onConfirmar={aoConfirmarExclusao}
      />
    </div>
  );
}
