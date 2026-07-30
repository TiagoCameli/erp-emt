"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Check, CheckCheck, Inbox, PenLine } from "lucide-react";
import { toast } from "sonner";

import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  KPICard,
  MoneyText,
  StatusBadge,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatarBRL, formatarData } from "@/lib/formatadores";
import {
  aprovarParcela,
  aprovarParcelasEmLote,
  revisarParcela,
} from "@/modules/financeiro/aprovacao-pagamentos/actions";
import type {
  ParcelaPendente,
  ParcelasIncompletas,
  ResumoFora,
} from "@/modules/financeiro/aprovacao-pagamentos/queries";
import { AprovarDialog } from "./aprovar-dialog";

export interface FilaAprovacaoProps {
  parcelas: ParcelaPendente[];
  /** O que está fora da fila por lançamento incompleto (estado vazio honesto). */
  incompletas: ParcelasIncompletas;
  /** Parcelas devolvidas para ajuste: saíram da fila, seguem na previsão. */
  emRevisao: ResumoFora;
  /** Aprovadas cuja data autorizada ainda não chegou. */
  aguardandoData: ResumoFora;
  podeAprovar: boolean;
  /** Permissão de desaprovar: é ela que libera mandar para revisão. */
  podeRevisar: boolean;
}

/** O que está sendo aprovado: uma linha, ou a seleção inteira. */
type Alvo = { tipo: "linha"; parcela: ParcelaPendente } | { tipo: "lote" };

/**
 * Descrição do estado vazio. "Nada aqui" sozinho manda o usuário procurar um
 * botão de "enviar para aprovação" que não existe: o que segura parcela fora da
 * fila é lançamento incompleto, e é isso que a tela diz.
 */
function descricaoVazia(incompletas: ParcelasIncompletas): string {
  if (incompletas.parcelas === 0) {
    return "Parcelas de dinheiro e cartão de crédito não passam por aqui: elas vão direto para Pagamentos.";
  }
  const plural = incompletas.parcelas > 1;
  return `${incompletas.parcelas} parcela${plural ? "s" : ""} de ${formatarBRL(
    incompletas.valor,
  )} está${plural ? "o" : ""} em ${
    incompletas.lancamentos > 1
      ? `${incompletas.lancamentos} lançamentos incompletos`
      : "um lançamento incompleto"
  }: as parcelas precisam somar o valor do lançamento para entrar na fila.`;
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
 * Fila de aprovação de pagamentos: parcelas a pagar aguardando aval.
 *
 * Aprovar abre o modal da data: aprovar é autorizar o pagamento para um dia, e
 * sem escolha a data cai no vencimento da parcela. Revisar devolve a parcela
 * para quem lançou, com motivo obrigatório, sem cancelar nada: o lançamento
 * continua vivo e continua contando na previsão de caixa.
 *
 * Toda ação passa por Server Action, que chama a RPC e repassa o erro do banco
 * ao toast. A trava de data e a exigência de motivo vivem no banco também.
 */
export function FilaAprovacao({
  parcelas,
  incompletas,
  emRevisao,
  aguardandoData,
  podeAprovar,
  podeRevisar,
}: FilaAprovacaoProps) {
  const router = useRouter();
  const [selecionadas, setSelecionadas] = React.useState<Set<string>>(new Set());
  const [alvo, setAlvo] = React.useState<Alvo | null>(null);
  const [parcelaRevisar, setParcelaRevisar] =
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

  async function confirmarAprovacao(dataProgramada: string | null) {
    if (!alvo) return;

    if (alvo.tipo === "linha") {
      const resultado = await aprovarParcela(alvo.parcela.id, dataProgramada);
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      toast.success("Pagamento aprovado");
      setSelecionadas((atual) => {
        const proxima = new Set(atual);
        proxima.delete(alvo.parcela.id);
        return proxima;
      });
    } else {
      const resultado = await aprovarParcelasEmLote(
        [...selecionadas],
        dataProgramada,
      );
      if ("erro" in resultado) {
        toast.error(
          resultado.aprovadas > 0
            ? `${resultado.aprovadas} pagamento(s) aprovado(s), mas parou: ${resultado.erro}`
            : resultado.erro,
        );
        setSelecionadas(new Set());
        setAlvo(null);
        router.refresh();
        return;
      }
      toast.success(`${resultado.aprovadas} pagamento(s) aprovado(s)`);
      setSelecionadas(new Set());
    }

    setAlvo(null);
    router.refresh();
  }

  async function aoRevisar(motivo?: string) {
    if (!parcelaRevisar) return;
    const resultado = await revisarParcela(parcelaRevisar.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Pagamento enviado para revisão");
    setSelecionadas((atual) => {
      const proxima = new Set(atual);
      proxima.delete(parcelaRevisar.id);
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
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="codigo-doc">{rotuloParcela(row.original)}</span>
              {/* Não bloqueia aprovar: só mostra que a nota ainda não chegou,
                  para a decisão ser consciente. */}
              {row.original.semNota ? (
                <span
                  title="A OC de origem ainda não tem nota fiscal registrada. Não impede aprovar: serve para você saber que está autorizando pagamento de uma compra sem nota."
                >
                  <StatusBadge status="pendente_aprovacao" rotulo="Sem nota" />
                </span>
              ) : null}
            </div>
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

    if (podeAprovar || podeRevisar) {
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
                onClick={() => setAlvo({ tipo: "linha", parcela: row.original })}
              >
                <Check />
                Aprovar
              </Button>
            ) : null}
            {podeRevisar ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setParcelaRevisar(row.original)}
              >
                <PenLine />
                Revisar
              </Button>
            ) : null}
          </div>
        ),
      });
    }

    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podeAprovar, podeRevisar, selecionadas, todasSelecionadas]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <KPICard
          titulo="Total a aprovar"
          valor={formatarBRL(totalAprovar)}
          detalhe={`${parcelas.length} pagamento(s) na fila`}
        />
        <KPICard
          titulo="Em revisão"
          valor={formatarBRL(emRevisao.valor)}
          detalhe={`${emRevisao.parcelas} devolvido(s) para ajuste`}
        />
        <KPICard
          titulo="Aprovado aguardando data"
          valor={formatarBRL(aguardandoData.valor)}
          detalhe={`${aguardandoData.parcelas} com data autorizada à frente`}
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
          <Button type="button" size="sm" onClick={() => setAlvo({ tipo: "lote" })}>
            <CheckCheck />
            Aprovar selecionados
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
            descricao={descricaoVazia(incompletas)}
            className="border-none bg-transparent"
          />
        }
      />

      <AprovarDialog
        aberto={alvo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setAlvo(null);
        }}
        quantidade={alvo?.tipo === "linha" ? 1 : selecionadas.size}
        valorTotal={
          alvo?.tipo === "linha" ? alvo.parcela.valor : totalSelecionado
        }
        vencimento={
          alvo?.tipo === "linha" ? alvo.parcela.dataVencimento : null
        }
        onConfirmar={confirmarAprovacao}
      />

      <ConfirmDialog
        aberto={parcelaRevisar !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setParcelaRevisar(null);
        }}
        titulo="Enviar para revisão"
        descricao="A parcela sai da fila e volta para quem lançou ajustar. Nada é cancelado: o lançamento continua valendo e continua na previsão de caixa. Informe o que precisa ser corrigido (ex.: valor divergente da NF, falta anexo, centro de custo errado)."
        textoConfirmar="Enviar para revisão"
        exigeMotivo
        onConfirmar={aoRevisar}
      />
    </div>
  );
}
