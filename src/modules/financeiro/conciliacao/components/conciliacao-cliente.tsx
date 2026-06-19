"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowDownRight, ArrowUpRight, Link2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import {
  DataTable,
  EmptyState,
  FilterBar,
  FiltroSelect,
  KPICard,
  MoneyText,
  StatusBadge,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/canonicos";
import { formatarData } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import {
  buscarSugestoes,
  desconciliar,
} from "@/modules/financeiro/conciliacao/actions";
import type {
  ContaBancariaOpcao,
  ExtratoLista,
  ParcelaVinculada,
  TransacaoLista,
} from "@/modules/financeiro/conciliacao/queries";
import { ConciliarDialog } from "./conciliar-dialog";
import { ImportarOfxDialog } from "./importar-ofx-dialog";

type FiltroConciliacao = "" | "conciliada" | "pendente";

export interface ConciliacaoClienteProps {
  transacoes: TransacaoLista[];
  extratos: ExtratoLista[];
  contas: ContaBancariaOpcao[];
  /** Conta atualmente filtrada via URL ("" = todas). */
  contaId: string;
  podeImportar: boolean;
  podeConciliar: boolean;
  podeDesconciliar: boolean;
}

/** Valor com sinal e cor: crédito verde (+), débito vermelho (-). */
function ValorMovimento({ transacao }: { transacao: TransacaoLista }) {
  const credito = transacao.tipo === "credito";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-end gap-1 tabular-nums",
        credito ? "text-status-aprovado" : "text-status-rejeitado",
      )}
    >
      {credito ? (
        <ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <ArrowDownRight className="size-3.5 shrink-0" aria-hidden="true" />
      )}
      <MoneyText valor={Math.abs(transacao.valor)} />
    </span>
  );
}

/**
 * Tela de conciliação: importa OFX, lista as transações do extrato com o
 * valor por sinal/cor, e casa cada transação não conciliada com uma parcela
 * paga (ou desfaz a conciliação). KPIs no topo resumem o estado.
 */
export function ConciliacaoCliente({
  transacoes,
  extratos,
  contas,
  contaId,
  podeImportar,
  podeConciliar,
  podeDesconciliar,
}: ConciliacaoClienteProps) {
  const router = useRouter();
  const [importarAberto, setImportarAberto] = React.useState(false);
  const [conciliarAberto, setConciliarAberto] = React.useState(false);
  const [transacaoAtiva, setTransacaoAtiva] =
    React.useState<TransacaoLista | null>(null);
  const [sugestoes, setSugestoes] = React.useState<ParcelaVinculada[]>([]);
  const [carregandoSugestoes, setCarregandoSugestoes] = React.useState(false);
  const [desconciliarAlvo, setDesconciliarAlvo] =
    React.useState<TransacaoLista | null>(null);
  const [conciliacao, setConciliacao] = React.useState<FiltroConciliacao>("");

  const opcoesConta = React.useMemo(
    () =>
      contas.map((conta) => ({
        valor: conta.id,
        rotulo: `${conta.nome} (${conta.bancoRotulo})`,
      })),
    [contas],
  );

  const dados = React.useMemo(() => {
    return transacoes.filter((transacao) => {
      if (conciliacao === "conciliada" && !transacao.conciliada) return false;
      if (conciliacao === "pendente" && transacao.conciliada) return false;
      return true;
    });
  }, [transacoes, conciliacao]);

  const totalTransacoes = transacoes.length;
  const totalConciliadas = transacoes.filter((t) => t.conciliada).length;
  const totalPendentes = totalTransacoes - totalConciliadas;

  function trocarConta(valor: string) {
    const params = new URLSearchParams(window.location.search);
    if (valor) params.set("conta", valor);
    else params.delete("conta");
    const query = params.toString();
    router.replace(query ? `?${query}` : "?", { scroll: false });
  }

  function abrirConciliar(transacao: TransacaoLista) {
    setTransacaoAtiva(transacao);
    setSugestoes([]);
    setCarregandoSugestoes(true);
    setConciliarAberto(true);
    void buscarSugestoes({
      contaBancariaId: transacao.contaBancariaId,
      valor: transacao.valor,
      dataMovimento: transacao.dataMovimento,
    }).then((resposta) => {
      if ("erro" in resposta) {
        toast.error(resposta.erro);
        setSugestoes([]);
      } else {
        setSugestoes(resposta.sugestoes);
      }
      setCarregandoSugestoes(false);
    });
  }

  async function confirmarDesconciliar() {
    if (!desconciliarAlvo) return;
    const resposta = await desconciliar(desconciliarAlvo.id);
    if ("erro" in resposta) {
      toast.error(resposta.erro);
      return;
    }
    toast.success("Conciliação desfeita");
    setDesconciliarAlvo(null);
    router.refresh();
  }

  const colunas: ColumnDef<TransacaoLista, unknown>[] = React.useMemo(
    () => [
      {
        accessorKey: "dataMovimento",
        header: "Data",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarData(row.original.dataMovimento)}
          </span>
        ),
      },
      {
        accessorKey: "memo",
        header: "Histórico",
        cell: ({ row }) => (
          <span className="block max-w-md truncate">
            {row.original.memo ?? "-"}
          </span>
        ),
      },
      {
        accessorKey: "valor",
        header: "Valor",
        meta: { alinharDireita: true },
        cell: ({ row }) => <ValorMovimento transacao={row.original} />,
      },
      {
        id: "conciliada",
        header: "Conciliada",
        cell: ({ row }) => {
          const transacao = row.original;
          if (!transacao.conciliada || !transacao.parcela) {
            return (
              <StatusBadge status="pendente_aprovacao" rotulo="Não conciliada" />
            );
          }
          const parcela = transacao.parcela;
          return (
            <div className="flex flex-col gap-0.5">
              <StatusBadge status="aprovado" rotulo="Conciliada" />
              <span className="text-legenda text-muted-foreground">
                {parcela.lancamentoNumero ? `${parcela.lancamentoNumero} · ` : ""}
                {parcela.lancamentoDescricao} (parcela {parcela.numeroParcela})
              </span>
            </div>
          );
        },
      },
      {
        id: "acoes",
        header: "",
        meta: { alinharDireita: true },
        cell: ({ row }) => {
          const transacao = row.original;
          if (transacao.conciliada) {
            if (!podeDesconciliar) return null;
            return (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDesconciliarAlvo(transacao)}
              >
                <X />
                Desconciliar
              </Button>
            );
          }
          if (!podeConciliar) return null;
          return (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => abrirConciliar(transacao)}
            >
              <Link2 />
              Conciliar
            </Button>
          );
        },
      },
    ],
    [podeConciliar, podeDesconciliar],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KPICard titulo="Transações" valor={totalTransacoes} />
        <KPICard
          titulo="Conciliadas"
          valor={totalConciliadas}
          detalhe={
            totalTransacoes > 0
              ? `${Math.round((totalConciliadas / totalTransacoes) * 100)}% do extrato`
              : undefined
          }
        />
        <KPICard titulo="Pendentes" valor={totalPendentes} />
      </div>

      <FilterBar className="justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <FiltroSelect
            valor={contaId}
            onValorChange={trocarConta}
            opcoes={opcoesConta}
            placeholder="Conta bancária"
            todosRotulo="Todas as contas"
          />
          <FiltroSelect
            valor={conciliacao}
            onValorChange={(valor) =>
              setConciliacao(valor as FiltroConciliacao)
            }
            opcoes={[
              { valor: "conciliada", rotulo: "Conciliadas" },
              { valor: "pendente", rotulo: "Pendentes" },
            ]}
            placeholder="Situação"
            todosRotulo="Todas as situações"
          />
        </div>
        {podeImportar ? (
          <Button type="button" size="sm" onClick={() => setImportarAberto(true)}>
            <Upload />
            Importar OFX
          </Button>
        ) : null}
      </FilterBar>

      <DataTable
        columns={colunas}
        data={dados}
        emptyState={
          <EmptyState
            icone={Upload}
            titulo={
              extratos.length === 0
                ? "Nenhum extrato importado"
                : "Nenhuma transação nesta seleção"
            }
            descricao={
              extratos.length === 0
                ? "Importe um arquivo OFX do banco para começar a conciliar."
                : "Ajuste os filtros de conta e situação para ver as transações."
            }
            acao={
              podeImportar && extratos.length === 0 ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setImportarAberto(true)}
                >
                  <Upload />
                  Importar OFX
                </Button>
              ) : undefined
            }
            className="border-none bg-transparent"
          />
        }
      />

      <ImportarOfxDialog
        key={importarAberto ? "import-aberto" : "import-fechado"}
        aberto={importarAberto}
        onAbertoChange={setImportarAberto}
        contas={contas}
        contaInicialId={contaId || undefined}
      />

      <ConciliarDialog
        aberto={conciliarAberto}
        onAbertoChange={setConciliarAberto}
        transacao={transacaoAtiva}
        sugestoes={sugestoes}
        carregando={carregandoSugestoes}
        onConciliada={() => setConciliarAberto(false)}
      />

      <ConfirmDialog
        aberto={desconciliarAlvo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setDesconciliarAlvo(null);
        }}
        titulo="Desfazer conciliação"
        descricao="A transação volta a ficar pendente e a parcela é liberada para nova conciliação. Confirma?"
        textoConfirmar="Desconciliar"
        variante="destrutivo"
        onConfirmar={confirmarDesconciliar}
      />
    </div>
  );
}
