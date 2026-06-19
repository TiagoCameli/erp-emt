"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Check, CheckCheck, Inbox, X } from "lucide-react";
import { toast } from "sonner";

import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  KPICard,
  MoneyText,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatarBRL, formatarData } from "@/lib/formatadores";
import {
  aprovarParcela,
  aprovarParcelasEmLote,
  rejeitarParcela,
} from "@/modules/financeiro/aprovacao-pagamentos/actions";
import type { ParcelaPendente } from "@/modules/financeiro/aprovacao-pagamentos/queries";

export interface FilaAprovacaoProps {
  parcelas: ParcelaPendente[];
  podeAprovar: boolean;
  podeRejeitar: boolean;
}

/** Soma o valor das parcelas, em centavos para não arrastar erro de float. */
function somarValores(parcelas: ParcelaPendente[]): number {
  const centavos = parcelas.reduce(
    (total, parcela) => total + Math.round(parcela.valor * 100),
    0,
  );
  return centavos / 100;
}

/** Rótulo da parcela: "LAN... · parcela N" quando há mais de uma. */
function rotuloParcela(parcela: ParcelaPendente): string {
  const numero = parcela.lancamentoNumero ?? "Sem número";
  return parcela.numeroParcela > 1
    ? `${numero} · parcela ${parcela.numeroParcela}`
    : numero;
}

/**
 * Fila de aprovação de pagamentos: parcelas a pagar aguardando aval. Mostra o
 * total a aprovar no topo, permite aprovar em lote pela seleção e aprovar ou
 * rejeitar cada parcela individualmente. Toda ação passa por Server Action,
 * que chama a RPC e repassa o erro do banco ao toast.
 */
export function FilaAprovacao({
  parcelas,
  podeAprovar,
  podeRejeitar,
}: FilaAprovacaoProps) {
  const router = useRouter();
  const [selecionadas, setSelecionadas] = React.useState<Set<string>>(new Set());
  const [aprovandoLote, setAprovandoLote] = React.useState(false);
  const [aprovandoId, setAprovandoId] = React.useState<string | null>(null);
  const [parcelaRejeitar, setParcelaRejeitar] =
    React.useState<ParcelaPendente | null>(null);

  const totalAprovar = React.useMemo(() => somarValores(parcelas), [parcelas]);

  const totalSelecionado = React.useMemo(
    () => somarValores(parcelas.filter((parcela) => selecionadas.has(parcela.id))),
    [parcelas, selecionadas],
  );

  const todasSelecionadas =
    parcelas.length > 0 && selecionadas.size === parcelas.length;
  const algumaSelecionada = selecionadas.size > 0;

  function alternarTodas() {
    setSelecionadas((atual) =>
      atual.size === parcelas.length
        ? new Set()
        : new Set(parcelas.map((parcela) => parcela.id)),
    );
  }

  function alternarUma(id: string) {
    setSelecionadas((atual) => {
      const proxima = new Set(atual);
      if (proxima.has(id)) proxima.delete(id);
      else proxima.add(id);
      return proxima;
    });
  }

  async function aoAprovar(parcela: ParcelaPendente) {
    if (aprovandoId !== null) return;
    setAprovandoId(parcela.id);
    try {
      const resultado = await aprovarParcela(parcela.id);
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      toast.success("Pagamento aprovado");
      setSelecionadas((atual) => {
        const proxima = new Set(atual);
        proxima.delete(parcela.id);
        return proxima;
      });
      router.refresh();
    } finally {
      setAprovandoId(null);
    }
  }

  async function aoAprovarLote() {
    if (aprovandoLote || selecionadas.size === 0) return;
    setAprovandoLote(true);
    try {
      const resultado = await aprovarParcelasEmLote([...selecionadas]);
      if ("erro" in resultado) {
        if (resultado.aprovadas > 0) {
          toast.error(
            `${resultado.aprovadas} pagamento(s) aprovado(s), mas parou: ${resultado.erro}`,
          );
        } else {
          toast.error(resultado.erro);
        }
        setSelecionadas(new Set());
        router.refresh();
        return;
      }
      toast.success(`${resultado.aprovadas} pagamento(s) aprovado(s)`);
      setSelecionadas(new Set());
      router.refresh();
    } finally {
      setAprovandoLote(false);
    }
  }

  async function aoRejeitar(motivo?: string) {
    if (!parcelaRejeitar) return;
    const resultado = await rejeitarParcela(parcelaRejeitar.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Pagamento rejeitado");
    setSelecionadas((atual) => {
      const proxima = new Set(atual);
      proxima.delete(parcelaRejeitar.id);
      return proxima;
    });
    router.refresh();
  }

  const colunas = React.useMemo<ColumnDef<ParcelaPendente, unknown>[]>(() => {
    const base: ColumnDef<ParcelaPendente, unknown>[] = [];

    if (podeAprovar) {
      base.push({
        id: "selecao",
        enableSorting: false,
        header: () => (
          <Checkbox
            checked={todasSelecionadas}
            onCheckedChange={alternarTodas}
            aria-label="Selecionar todos os pagamentos"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selecionadas.has(row.original.id)}
            onCheckedChange={() => alternarUma(row.original.id)}
            aria-label={`Selecionar ${rotuloParcela(row.original)}`}
          />
        ),
      });
    }

    base.push(
      {
        accessorKey: "lancamentoNumero",
        header: "Lançamento",
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <span className="codigo-doc">{rotuloParcela(row.original)}</span>
            <span className="text-legenda text-muted-foreground">
              {row.original.lancamentoDescricao}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "fornecedorNome",
        header: "Fornecedor",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.fornecedorNome}</span>
        ),
      },
      {
        accessorKey: "dataVencimento",
        header: "Vencimento",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.dataVencimento
              ? formatarData(row.original.dataVencimento)
              : "-"}
          </span>
        ),
      },
      {
        accessorKey: "valor",
        header: "Valor",
        meta: { alinharDireita: true },
        cell: ({ row }) => <MoneyText valor={row.original.valor} />,
      },
    );

    if (podeAprovar || podeRejeitar) {
      base.push({
        id: "acoes",
        header: "Ações",
        enableSorting: false,
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            {podeAprovar ? (
              <Button
                type="button"
                size="sm"
                disabled={aprovandoId === row.original.id || aprovandoLote}
                onClick={() => aoAprovar(row.original)}
              >
                <Check />
                Aprovar
              </Button>
            ) : null}
            {podeRejeitar ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setParcelaRejeitar(row.original)}
              >
                <X />
                Rejeitar
              </Button>
            ) : null}
          </div>
        ),
      });
    }

    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    podeAprovar,
    podeRejeitar,
    selecionadas,
    todasSelecionadas,
    aprovandoId,
    aprovandoLote,
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <KPICard
          titulo="Total a aprovar"
          valor={formatarBRL(totalAprovar)}
          detalhe={`${parcelas.length} pagamento(s) na fila`}
        />
      </div>

      {podeAprovar && algumaSelecionada ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface px-4 py-2.5">
          <p className="text-detalhe text-foreground">
            {selecionadas.size} selecionado(s)
            <span className="text-muted-foreground">
              {" "}
              · {formatarBRL(totalSelecionado)}
            </span>
          </p>
          <Button
            type="button"
            size="sm"
            disabled={aprovandoLote}
            onClick={aoAprovarLote}
          >
            <CheckCheck />
            {aprovandoLote ? "Aprovando..." : "Aprovar selecionados"}
          </Button>
        </div>
      ) : null}

      <DataTable
        columns={colunas}
        data={parcelas}
        emptyState={
          <EmptyState
            icone={Inbox}
            titulo="Nenhum pagamento aguardando aprovação"
            descricao="As parcelas a pagar enviadas para aprovação aparecem aqui"
            className="border-none bg-transparent"
          />
        }
      />

      <ConfirmDialog
        aberto={parcelaRejeitar !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setParcelaRejeitar(null);
        }}
        titulo="Rejeitar pagamento"
        descricao="Informe o motivo da rejeição. Ele fica registrado na auditoria."
        textoConfirmar="Rejeitar pagamento"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoRejeitar}
      />
    </div>
  );
}
