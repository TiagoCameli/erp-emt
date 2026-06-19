"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Link2, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

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
import { conciliar } from "@/modules/financeiro/conciliacao/actions";
import type {
  ParcelaVinculada,
  TransacaoLista,
} from "@/modules/financeiro/conciliacao/queries";

export interface ConciliarDialogProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Transação que está sendo conciliada (null quando fechado). */
  transacao: TransacaoLista | null;
  /** Sugestões já buscadas no servidor para a transação aberta. */
  sugestoes: ParcelaVinculada[];
  /** Verdadeiro enquanto o pai busca as sugestões da transação. */
  carregando: boolean;
  /** Conciliou com sucesso: o pai fecha o diálogo e revalida a listagem. */
  onConciliada: () => void;
}

/**
 * Escolha da parcela paga para conciliar com a transação selecionada. As
 * sugestões (mesma conta, mesmo valor, data de pagamento próxima) são buscadas
 * pelo pai e recebidas por prop; aqui o usuário escolhe uma e concilia,
 * repassando o erro do banco ao toast quando falhar.
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
    if (!transacao || !selecionada) return;
    setErro(null);
    setConciliando(true);

    const resposta = await conciliar(transacao.id, selecionada);
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
            Buscando parcelas compatíveis
          </div>
        ) : sugestoes.length === 0 ? (
          <EmptyState
            icone={Link2}
            titulo="Nenhuma parcela compatível"
            descricao="Não há parcela paga na mesma conta, com o mesmo valor e data de pagamento próxima. Confira se a parcela já foi paga no financeiro."
            className="border-none bg-transparent"
          />
        ) : (
          <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
            {sugestoes.map((parcela) => {
              const ativa = selecionada === parcela.id;
              return (
                <button
                  key={parcela.id}
                  type="button"
                  onClick={() => setSelecionada(parcela.id)}
                  className={cn(
                    "flex items-start justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-surface",
                    ativa && "border-primary bg-primary/5",
                  )}
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
                      Parcela {parcela.numeroParcela}
                      {parcela.fornecedorNome
                        ? ` · ${parcela.fornecedorNome}`
                        : ""}
                      {parcela.dataPagamento
                        ? ` · paga em ${formatarData(parcela.dataPagamento)}`
                        : ""}
                    </p>
                  </div>
                  <MoneyText
                    valor={parcela.valor}
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
            {conciliando ? <LoaderCircle className="animate-spin" /> : <Link2 />}
            Conciliar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
