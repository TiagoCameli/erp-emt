"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  CircleAlert,
  Link2,
  LoaderCircle,
} from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, MoneyText } from "@/components/canonicos";
import { formatarBRL, formatarData } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { ROTULO_TIPO_LANCAMENTO } from "@/modules/financeiro/_shared/formato";
import {
  conciliar,
  conciliarTransferencia,
} from "@/modules/financeiro/conciliacao/actions";
import type {
  SugestaoConciliacao,
  TransacaoLista,
} from "@/modules/financeiro/conciliacao/queries";

export interface ConciliarDialogProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Transação que está sendo conciliada (null quando fechado). */
  transacao: TransacaoLista | null;
  /** Sugestões já buscadas no servidor: parcelas pagas e transferências. */
  sugestoes: SugestaoConciliacao[];
  /** Verdadeiro enquanto o pai busca as sugestões da transação. */
  carregando: boolean;
  /** Conciliou com sucesso: o pai fecha o diálogo e revalida a listagem. */
  onConciliada: () => void;
}

/**
 * Escolha do que casar com a transação selecionada: uma parcela paga ou um lado
 * de uma transferência entre contas. As sugestões (mesma conta, mesmo valor,
 * data próxima) são buscadas pelo pai e recebidas por prop; aqui o usuário
 * escolhe uma e concilia, repassando o erro do banco ao toast quando falhar.
 *
 * São duas espécies porque o extrato não distingue: um débito de R$ 450.000,00
 * tanto pode ser o pagamento de uma parcela quanto o envio de uma
 * transferência. Cada espécie tem a sua RPC.
 *
 * O número em destaque de uma parcela é o líquido (valor menos desconto), que é
 * o que o extrato do banco mostra e o que o banco de dados compara.
 */
export function ConciliarDialog({
  aberto,
  onAbertoChange,
  transacao,
  sugestoes,
  carregando,
  onConciliada,
}: ConciliarDialogProps) {
  const router = useRouter();
  const [selecionada, setSelecionada] = React.useState<string | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [conciliando, setConciliando] = React.useState(false);

  function trocarAberto(novoAberto: boolean) {
    if (conciliando) return;
    if (!novoAberto) {
      setSelecionada(null);
      setErro(null);
    }
    onAbertoChange(novoAberto);
  }

  async function confirmar() {
    const escolhida = sugestoes.find((sugestao) => sugestao.id === selecionada);
    if (!transacao || !escolhida) return;
    setErro(null);
    setConciliando(true);

    const resposta =
      escolhida.especie === "parcela"
        ? await conciliar(transacao.id, escolhida.id)
        : await conciliarTransferencia(transacao.id, escolhida.id);
    setConciliando(false);

    if ("erro" in resposta) {
      setErro(resposta.erro);
      return;
    }

    toast.success("Transação conciliada");
    setSelecionada(null);
    onConciliada();
    router.refresh();
  }

  return (
    <Dialog open={aberto} onOpenChange={trocarAberto}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Conciliar transação</DialogTitle>
          <DialogDescription>
            {transacao
              ? `Movimento de ${formatarData(transacao.dataMovimento)} no valor de ${formatarBRL(Math.abs(transacao.valor))}`
              : "Escolha a parcela paga correspondente"}
          </DialogDescription>
        </DialogHeader>

        {erro ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Não foi possível conciliar</AlertTitle>
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        ) : null}

        {carregando ? (
          <div className="flex items-center justify-center gap-2 py-10 text-detalhe text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Buscando lançamentos compatíveis
          </div>
        ) : sugestoes.length === 0 ? (
          <EmptyState
            icone={Link2}
            titulo="Nenhum lançamento compatível"
            descricao="Não há parcela paga nem transferência na mesma conta, com o mesmo valor e data próxima. Confira se a parcela já foi paga, ou se a transferência foi lançada, no financeiro."
            className="border-none bg-transparent"
          />
        ) : (
          <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
            {sugestoes.map((sugestao) => {
              const ativa = selecionada === sugestao.id;
              const classes = cn(
                "flex items-start justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-surface",
                ativa && "border-primary bg-primary/5",
              );

              // Transferência entre contas: não tem parcela, não tem
              // fornecedor e não tem desconto. O que identifica é o par
              // origem/destino, que é o que diz se o lado está certo.
              if (sugestao.especie === "transferencia") {
                const transferencia = sugestao.transferencia;
                return (
                  <button
                    key={sugestao.id}
                    type="button"
                    onClick={() => setSelecionada(sugestao.id)}
                    className={classes}
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-detalhe font-medium">
                        <ArrowLeftRight className="size-3.5 shrink-0 text-muted-foreground" />
                        {transferencia.numero ? (
                          <span className="codigo-doc">
                            {transferencia.numero}
                          </span>
                        ) : null}
                        <span className="truncate">
                          {transferencia.descricao ??
                            "Transferência entre contas"}
                        </span>
                      </p>
                      <p className="text-legenda text-muted-foreground">
                        Transferência · {transferencia.contaOrigemNome} para{" "}
                        {transferencia.contaDestinoNome} ·{" "}
                        {formatarData(transferencia.dataTransferencia)}
                      </p>
                    </div>
                    <MoneyText
                      valor={transferencia.valor}
                      className="shrink-0 text-detalhe font-medium"
                    />
                  </button>
                );
              }

              const parcela = sugestao.parcela;
              return (
                <button
                  key={sugestao.id}
                  type="button"
                  onClick={() => setSelecionada(sugestao.id)}
                  className={classes}
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-detalhe font-medium">
                      {parcela.lancamentoNumero ? (
                        <span className="codigo-doc">
                          {parcela.lancamentoNumero}
                        </span>
                      ) : null}
                      <span className="truncate">
                        {parcela.lancamentoDescricao}
                      </span>
                    </p>
                    <p className="text-legenda text-muted-foreground">
                      {ROTULO_TIPO_LANCAMENTO[parcela.tipoLancamento]} · Parcela{" "}
                      {parcela.numeroParcela}
                      {parcela.fornecedorNome
                        ? ` · ${parcela.fornecedorNome}`
                        : ""}
                      {parcela.dataPagamento
                        ? ` · paga em ${formatarData(parcela.dataPagamento)}`
                        : ""}
                    </p>
                    {/* Com desconto, o valor da parcela não é o que o banco
                        debitou. Sem esta linha, uma parcela de R$ 500.000,00
                        sugerida para um débito de R$ 475.400,00 pareceria erro
                        de sugestão. */}
                    {parcela.desconto > 0 ? (
                      <p className="text-legenda text-muted-foreground">
                        valor{" "}
                        <MoneyText valor={parcela.valor} className="inline" />{" "}
                        menos desconto{" "}
                        <MoneyText valor={parcela.desconto} className="inline" />
                      </p>
                    ) : null}
                  </div>
                  {/* O líquido, que é o número que casou com o extrato. */}
                  <MoneyText
                    valor={parcela.valorLiquido}
                    className="shrink-0 text-detalhe font-medium"
                  />
                </button>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => trocarAberto(false)}
            disabled={conciliando}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => void confirmar()}
            disabled={conciliando || !selecionada}
          >
            {conciliando ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Link2 />
            )}
            Conciliar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
